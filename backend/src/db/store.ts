/*
 * Data layer — a typed JSON-file store behind repository helpers.
 *
 * Database mapping for production (each table notes its target):
 *   PostgreSQL → users, homes, members, assets, warranties, jobs, bids,
 *                payments, ledger, notifications, verificationTokens,
 *                auditLogs, analytics   (FKs + indexes in migrations/)
 *   Redis      → refreshTokens (sessions), rate limits, idempotency, caches
 *   S3         → files (images / manuals / receipts) — metadata only here
 *   Neo4j      → knowledge-graph queries (later; joins today)
 *
 * Production semantics implemented here and preserved across engines:
 *   - UUID ids (no sequential guessing)
 *   - createdAt / updatedAt / deletedAt (soft deletes) / version (optimistic locking)
 *   - schema migrations with a persisted schemaVersion
 *   - snapshot transactions (Postgres BEGIN/COMMIT once migrated)
 *   - pagination helpers
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../core/config";
import { ConflictError, DatabaseError } from "../core/errors";

/* ---------- rows ---------- */

export interface BaseFields {
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  version?: number;
}

export interface UserRow extends BaseFields {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  accountType: "consumer" | "pro";
  isAdmin?: boolean;
  emailVerified?: boolean;
  mfaEnabled: boolean;
  mfaSecret?: string;
  mfaPendingSecret?: string;
  recoveryCodes?: string[]; // hashed
  trustedDevices?: { deviceId: string; expiresAt: string }[];
  passwordHistory?: string[]; // last N hashes
  passwordChangedAt?: string;
  tokenGeneration?: number; // bumped on password change/reset → invalidates old JWTs
  proProfile?: {
    business: string;
    professions: string[];
    license: string;
    insurance: string;
    radiusMi: number;
    baseCity: string;
    emergency: boolean;
  };
}

export interface HomeRow extends BaseFields {
  id: string;
  name: string;
  address: string;
  propertyType: string;
  createdBy: string;
}

export interface MemberRow {
  id: string;
  homeId: string;
  userId: string;
  role: string; // owner | co_owner | child | roommate | tenant | guest | property_manager | contractor | admin
  expiresAt?: string; // contractor / guest scoped access
}

export interface AssetRow extends BaseFields {
  id: string;
  homeId: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  serial: string;
  purchased: string;
  value: string;
  room: string;
  x: number;
  y: number;
  createdBy: string;
}

export interface WarrantyRow extends BaseFields {
  id: string;
  homeId: string;
  assetId?: string;
  item: string;
  provider: string;
  expiresAt: string;
  source: string;
  remindersSent: number[];
}

export interface FileRow extends BaseFields {
  id: string;
  homeId: string;
  kind: string;
  filename: string;
  url: string;
  bytes: number;
  mime?: string;
  sha256?: string;
}

export interface JobRow extends BaseFields {
  id: string;
  homeId: string;
  createdBy: string;
  title: string;
  category: string;
  urgency: string;
  description: string;
  status: "open" | "accepted" | "completed" | "cancelled";
  acceptedBidId?: string;
}

export interface BidRow extends BaseFields {
  id: string;
  jobId: string;
  proUserId: string;
  price: number;
  etaLabel: string;
  warranty: string;
}

export interface PaymentRow extends BaseFields {
  id: string;
  jobId: string;
  payerUserId: string;
  payeeUserId: string;
  amountCents: number;
  refundedCents?: number;
  status: "held" | "released" | "refunded" | "partially_refunded";
}

export interface LedgerEntryRow {
  id: string;
  paymentId: string;
  type: "hold" | "release" | "refund";
  amountCents: number;
  ts: string;
  requestId: string;
}

export interface NotificationRow extends BaseFields {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  channels: string[];
  deliveries?: { channel: string; status: "sent" | "deferred" | "failed"; attempts: number }[];
  read: boolean;
}

export interface RefreshTokenRow {
  id: string; // opaque token
  userId: string;
  familyId: string; // token family — one per device/session
  deviceId?: string;
  deviceName?: string;
  ip?: string;
  expiresAt: string;
  usedAt?: string | null; // set on rotation; reuse of a used token = theft signal
  revokedAt?: string | null;
  rotatedFrom?: string;
  createdAt?: string;
}

export interface VerificationTokenRow {
  id: string;
  userId: string;
  kind: "email" | "password_reset";
  tokenHash: string;
  expiresAt: string;
  usedAt?: string | null;
}

export interface PreferencesRow {
  userId: string;
  push: boolean;
  email: boolean;
  sms: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

export interface AuditRow {
  id: string;
  ts: string;
  requestId: string;
  userId: string;
  action: string;
  resource: string;
  ip?: string;
  before?: unknown;
  after?: unknown;
}

export interface AnalyticsRow {
  id: string;
  ts: string;
  event: string;
  userId?: string;
  props?: Record<string, unknown>;
}

interface Tables {
  meta: { schemaVersion: number };
  users: UserRow[];
  homes: HomeRow[];
  members: MemberRow[];
  assets: AssetRow[];
  warranties: WarrantyRow[];
  files: FileRow[];
  jobs: JobRow[];
  bids: BidRow[];
  payments: PaymentRow[];
  ledger: LedgerEntryRow[];
  notifications: NotificationRow[];
  preferences: PreferencesRow[];
  refreshTokens: RefreshTokenRow[];
  verificationTokens: VerificationTokenRow[];
  auditLogs: AuditRow[];
  analytics: AnalyticsRow[];
}

const EMPTY: Tables = {
  meta: { schemaVersion: 0 },
  users: [],
  homes: [],
  members: [],
  assets: [],
  warranties: [],
  files: [],
  jobs: [],
  bids: [],
  payments: [],
  ledger: [],
  notifications: [],
  preferences: [],
  refreshTokens: [],
  verificationTokens: [],
  auditLogs: [],
  analytics: [],
};

/* ---------- migrations ---------- */

interface Migration {
  version: number;
  name: string;
  up(data: Tables): void;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "refresh-token-families",
    up(data) {
      for (const t of data.refreshTokens) if (!t.familyId) t.familyId = t.id;
    },
  },
  {
    version: 2,
    name: "row-versioning-defaults",
    up(data) {
      for (const j of data.jobs) if (j.version === undefined) j.version = 1;
      for (const a of data.assets) if (a.version === undefined) a.version = 1;
    },
  },
];

function runMigrations(data: Tables): void {
  for (const m of MIGRATIONS.filter((x) => x.version > (data.meta?.schemaVersion ?? 0)).sort(
    (a, b) => a.version - b.version
  )) {
    m.up(data);
    data.meta.schemaVersion = m.version;
  }
}

/* ---------- store ---------- */

class Store {
  data: Tables;
  private file: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "db.json");
    this.data = existsSync(this.file)
      ? { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(this.file, "utf8")) }
      : structuredClone(EMPTY);
    if (!this.data.meta) this.data.meta = { schemaVersion: 0 };
    runMigrations(this.data);
  }

  persist() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      writeFileSync(this.file, JSON.stringify(this.data, null, 1));
    }, 50);
  }

  reset() {
    this.data = structuredClone(EMPTY);
    runMigrations(this.data);
    this.persist();
  }

  /**
   * Snapshot transaction: all-or-nothing mutation. Postgres swaps this for
   * BEGIN/COMMIT; call sites don't change.
   */
  withTx<T>(fn: () => T): T {
    const snapshot = structuredClone(this.data);
    try {
      const out = fn();
      this.persist();
      return out;
    } catch (err) {
      this.data = snapshot;
      throw err;
    }
  }
}

export const db = new Store(config.dataDir);

/* ---------- helpers ---------- */

export function uid(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function notDeleted<T extends { deletedAt?: string | null }>(row: T): boolean {
  return !row.deletedAt;
}

export function softDelete<T extends BaseFields>(row: T): T {
  row.deletedAt = now();
  row.updatedAt = now();
  return row;
}

/** bump updatedAt + version; throws ConflictError when expectedVersion is stale */
export function touch<T extends BaseFields>(row: T, expectedVersion?: number): T {
  const current = row.version ?? 1;
  if (expectedVersion !== undefined && expectedVersion !== current) {
    throw new ConflictError("version_conflict", `expected version ${expectedVersion}, current is ${current}`);
  }
  row.version = current + 1;
  row.updatedAt = now();
  return row;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function paginate<T>(items: T[], page = 1, limit = 50): Page<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const p = Math.min(page, pages);
  return { items: items.slice((p - 1) * limit, (p - 1) * limit + limit), page: p, limit, total, pages };
}

/** integrity guard used by tests and the payments reconciliation endpoint */
export function assertDatabaseLoaded(): void {
  if (!db.data || !Array.isArray(db.data.users)) throw new DatabaseError("store not initialized");
}
