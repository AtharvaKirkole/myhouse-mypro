/*
 * Data layer — a typed JSON-file store behind repository helpers.
 *
 * Database mapping for production (each table notes its target):
 *   PostgreSQL → users, homes, members, assets, warranties, providers, jobs,
 *                bids, payments, notifications, auditLogs, analytics
 *   Redis      → refreshTokens (sessions), rate-limit buckets, event queue
 *   S3         → files (images / manuals / receipts / videos) — here we store
 *                only metadata + a mock URL
 *   Neo4j      → the knowledge-graph queries (later; today they're joins)
 *
 * The repository API (find/insert/update/remove) is intentionally the same
 * shape you'd wrap around Prisma/pg — swap the engine, keep the services.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { config } from "../core/config";

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  accountType: "consumer" | "pro";
  mfaEnabled: boolean;
  proProfile?: {
    business: string;
    professions: string[];
    license: string;
    insurance: string;
    radiusMi: number;
    baseCity: string;
    emergency: boolean;
  };
  createdAt: string;
}

export interface HomeRow {
  id: string;
  name: string;
  address: string;
  propertyType: string;
  createdBy: string;
  createdAt: string;
}

export interface MemberRow {
  id: string;
  homeId: string;
  userId: string;
  role: string; // owner | co_owner | child | roommate | tenant | guest | property_manager
}

export interface AssetRow {
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
  createdAt: string;
}

export interface WarrantyRow {
  id: string;
  homeId: string;
  assetId?: string;
  item: string;
  provider: string;
  expiresAt: string; // ISO date
  source: string;
  remindersSent: number[];
  createdAt: string;
}

export interface FileRow {
  id: string;
  homeId: string;
  kind: string; // receipt | warranty | product | manual | video
  filename: string;
  url: string; // s3://… mock
  bytes: number;
  createdAt: string;
}

export interface JobRow {
  id: string;
  homeId: string;
  createdBy: string;
  title: string;
  category: string;
  urgency: string;
  description: string;
  status: "open" | "accepted" | "completed" | "cancelled";
  acceptedBidId?: string;
  createdAt: string;
}

export interface BidRow {
  id: string;
  jobId: string;
  proUserId: string;
  price: number;
  etaLabel: string;
  warranty: string;
  createdAt: string;
}

export interface PaymentRow {
  id: string;
  jobId: string;
  payerUserId: string;
  payeeUserId: string;
  amountCents: number;
  status: "held" | "released" | "refunded";
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  channels: string[];
  read: boolean;
  createdAt: string;
}

export interface RefreshTokenRow {
  id: string; // the token itself (opaque)
  userId: string;
  expiresAt: string;
  rotatedFrom?: string;
}

export interface AuditRow {
  id: string;
  ts: string;
  requestId: string;
  userId: string;
  action: string;
  resource: string;
}

export interface AnalyticsRow {
  id: string;
  ts: string;
  event: string;
  userId?: string;
  props?: Record<string, unknown>;
}

interface Tables {
  users: UserRow[];
  homes: HomeRow[];
  members: MemberRow[];
  assets: AssetRow[];
  warranties: WarrantyRow[];
  files: FileRow[];
  jobs: JobRow[];
  bids: BidRow[];
  payments: PaymentRow[];
  notifications: NotificationRow[];
  refreshTokens: RefreshTokenRow[];
  auditLogs: AuditRow[];
  analytics: AnalyticsRow[];
}

const EMPTY: Tables = {
  users: [],
  homes: [],
  members: [],
  assets: [],
  warranties: [],
  files: [],
  jobs: [],
  bids: [],
  payments: [],
  notifications: [],
  refreshTokens: [],
  auditLogs: [],
  analytics: [],
};

class Store {
  data: Tables;
  private file: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "db.json");
    this.data = existsSync(this.file)
      ? { ...EMPTY, ...JSON.parse(readFileSync(this.file, "utf8")) }
      : structuredClone(EMPTY);
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
    this.persist();
  }
}

export const db = new Store(config.dataDir);

export function uid(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function now(): string {
  return new Date().toISOString();
}
