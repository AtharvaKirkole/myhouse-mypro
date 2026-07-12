/*
 * Continuous Learning Pipeline — nothing is static.
 *
 * Subscribed to the domain event queue (at-least-once, retries, DLQ). Every
 * completed repair updates: the repair-record store, the contractor expertise
 * profile, the knowledge graph, the issue-vector index, and the immutable
 * domain-event log that future ML models train on. Consumers are idempotent —
 * redelivery cannot double-count.
 */

import { on, type AppEvent, type EventName } from "../core/events";
import { log } from "../core/http";
import {
  db, now, uid,
  type AssetEventRow, type ContractorProfileRow, type RepairRecordRow,
} from "../db/store";
import { minimizePayload, scrubPII } from "./privacy";
import { projectAsset, projectJob, projectRepair } from "./graph";
import { upsertIssueVector } from "./embeddings";

/* ---------- immutable domain-event log (versioned schemas) ---------- */

const EVENT_SCHEMA_VERSION: Record<string, number> = {
  "user.signed_up": 1,
  "asset.created": 1,
  "warranty.expiring": 1,
  "job.created": 2, // v2 added homeId + description-derived fields
  "bid.placed": 1,
  "bid.accepted": 1,
  "job.completed": 2, // v2 added structured repair capture
  "payment.released": 1,
  "auth.suspicious": 1,
};

function recordDomainEvent(e: AppEvent): void {
  if (db.data.domainEvents.some((d) => d.id === e.id)) return; // idempotent
  db.data.domainEvents.push({
    id: e.id,
    name: e.name,
    schemaVersion: EVENT_SCHEMA_VERSION[e.name] ?? 1,
    payload: minimizePayload(e.payload),
    ts: e.ts,
  });
  db.persist();
}

/* ---------- asset history (append-only) ---------- */

export function appendAssetEvent(ev: Omit<AssetEventRow, "id" | "ts">): void {
  db.data.assetEvents.push({ ...ev, id: uid("aev"), ts: now() });
  db.persist();
}

/* ---------- repair records ---------- */

function seasonOf(iso: string): RepairRecordRow["season"] {
  const m = new Date(iso).getUTCMonth() + 1;
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "fall";
}

export function buildRepairRecord(payload: Record<string, unknown>): RepairRecordRow | null {
  const jobId = String(payload.jobId ?? "");
  const contractorId = payload.contractorId ? String(payload.contractorId) : "";
  if (!jobId || !contractorId) return null; // self-resolved job — no repair record
  if (db.data.repairRecords.some((r) => r.jobId === jobId)) return null; // idempotent

  const job = db.data.jobs.find((j) => j.id === jobId);
  if (!job) return null;

  const assetId = payload.assetId ? String(payload.assetId) : null;
  const asset = assetId ? db.data.assets.find((a) => a.id === assetId && a.homeId === job.homeId) : undefined;
  const bidCents = typeof payload.priceCents === "number" ? payload.priceCents : undefined;
  const costCents = typeof payload.costCents === "number" ? payload.costCents : (bidCents ?? 0);

  const record: RepairRecordRow = {
    id: uid("rep"),
    jobId,
    homeId: job.homeId,
    contractorId,
    assetId: asset?.id ?? null,
    brand: asset?.brand || undefined,
    model: asset?.model || undefined,
    issueCategory: job.category,
    rootCause: payload.rootCause ? String(payload.rootCause).slice(0, 120) : undefined,
    partsReplaced: Array.isArray(payload.partsReplaced) ? payload.partsReplaced.map(String).slice(0, 10) : [],
    laborMinutes: typeof payload.laborMinutes === "number" ? payload.laborMinutes : 60,
    costCents,
    bidCents,
    rating: typeof payload.rating === "number" ? payload.rating : undefined,
    warrantyCovered: payload.warrantyCovered === true,
    zip: typeof payload.zip === "string" ? payload.zip : undefined,
    season: seasonOf(now()),
    notes: payload.notes ? scrubPII(String(payload.notes)) : undefined,
    createdAt: now(),
  };
  db.data.repairRecords.push(record);
  db.persist();
  return record;
}

/* ---------- contractor expertise profile (materialized) ---------- */

export function recomputeContractorProfile(userId: string): ContractorProfileRow {
  const repairs = db.data.repairRecords.filter((r) => r.contractorId === userId);
  const count = <K extends "brands" | "models" | "issueCategories">(pick: (r: RepairRecordRow) => string | undefined) => {
    const out: Record<string, number> = {};
    for (const r of repairs) {
      const k = pick(r);
      if (k) out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };

  const rated = repairs.filter((r) => r.rating !== undefined);
  const avgRating = rated.length ? rated.reduce((a, r) => a + (r.rating ?? 0), 0) / rated.length : null;

  const quoted = repairs.filter((r) => r.bidCents && r.costCents);
  const quoteAccuracy = quoted.length
    ? 1 - quoted.reduce((a, r) => a + Math.min(1, Math.abs(r.costCents - (r.bidCents ?? 0)) / (r.bidCents ?? 1)), 0) / quoted.length
    : null;

  const homesServed = new Map<string, number>();
  for (const r of repairs) homesServed.set(r.homeId, (homesServed.get(r.homeId) ?? 0) + 1);
  const repeatCustomers = [...homesServed.values()].filter((n) => n > 1).length;

  const emergencyJobs = repairs.filter((r) => {
    const job = db.data.jobs.find((j) => j.id === r.jobId);
    return job?.urgency === "emergency";
  }).length;

  const evidence = repairs.length + rated.length;
  const qualityScore = Math.round(
    Math.max(5, Math.min(99, 50 + (avgRating !== null ? (avgRating - 3) * 20 : 0) + (quoteAccuracy !== null ? quoteAccuracy * 10 : 0)))
  );
  const reliabilityScore = Math.round(
    Math.max(5, Math.min(99, 40 + Math.min(30, repairs.length * 3) + repeatCustomers * 5 + (quoteAccuracy !== null ? quoteAccuracy * 15 : 0)))
  );

  const profile: ContractorProfileRow = {
    userId,
    jobsCompleted: repairs.length,
    brands: count((r) => r.brand),
    models: count((r) => r.model),
    issueCategories: count((r) => r.issueCategory),
    avgRating: avgRating !== null ? Number(avgRating.toFixed(2)) : null,
    avgLaborMinutes: repairs.length ? Math.round(repairs.reduce((a, r) => a + r.laborMinutes, 0) / repairs.length) : null,
    quoteAccuracy: quoteAccuracy !== null ? Number(quoteAccuracy.toFixed(3)) : null,
    repeatCustomers,
    emergencyJobs,
    warrantyCoveredJobs: repairs.filter((r) => r.warrantyCovered).length,
    reliabilityScore,
    qualityScore,
    skillConfidence: Number(Math.min(1, evidence / 20).toFixed(2)),
    updatedAt: now(),
  };

  const idx = db.data.contractorProfiles.findIndex((p) => p.userId === userId);
  if (idx >= 0) db.data.contractorProfiles[idx] = profile;
  else db.data.contractorProfiles.push(profile);
  db.persist();
  return profile;
}

export function getContractorProfile(userId: string): ContractorProfileRow | undefined {
  return db.data.contractorProfiles.find((p) => p.userId === userId);
}

/* ---------- consumer registration ---------- */

const ALL_EVENTS: EventName[] = [
  "user.signed_up", "asset.created", "warranty.expiring", "job.created",
  "bid.placed", "bid.accepted", "job.completed", "payment.released", "auth.suspicious",
];

let registered = false;

export function registerIntelligenceConsumers(): void {
  if (registered) return;
  registered = true;

  // 1. every event lands in the immutable, PII-minimized training log
  for (const name of ALL_EVENTS) {
    on(name, (e) => recordDomainEvent(e), `intel.domain-log:${name}`);
  }

  // 2. new assets join the knowledge graph with a creation history entry
  on(
    "asset.created",
    (e) => {
      const asset = db.data.assets.find((a) => a.id === e.payload.assetId);
      if (!asset) return;
      projectAsset(asset, e.id);
      if (!db.data.assetEvents.some((ev) => ev.assetId === asset.id && ev.kind === "created")) {
        appendAssetEvent({
          assetId: asset.id, homeId: asset.homeId, kind: "created",
          after: { name: asset.name, brand: asset.brand, model: asset.model },
          actorId: asset.createdBy, requestId: e.id,
        });
      }
    },
    "intel.asset-graph"
  );

  // 3. new jobs become Issue nodes + embedded vectors (similarity engine)
  on(
    "job.created",
    (e) => {
      const job = db.data.jobs.find((j) => j.id === e.payload.jobId);
      if (!job) return;
      projectJob(job, e.id);
      const asset = db.data.assets.find((a) => a.homeId === job.homeId && job.description.toLowerCase().includes(a.brand.toLowerCase()) && a.brand);
      upsertIssueVector(job.id, job.homeId, job.description, {
        brand: asset?.brand, model: asset?.model, category: job.category,
      });
    },
    "intel.issue-vector"
  );

  // 4. completed repairs feed EVERYTHING: records, graph, profiles, history
  on(
    "job.completed",
    (e) => {
      const record = buildRepairRecord(e.payload);
      if (!record) return;
      projectRepair(record, e.id);
      recomputeContractorProfile(record.contractorId);
      if (record.assetId) {
        appendAssetEvent({
          assetId: record.assetId, homeId: record.homeId, kind: "repaired",
          after: {
            issueCategory: record.issueCategory, rootCause: record.rootCause,
            partsReplaced: record.partsReplaced, costCents: record.costCents,
          },
          actorId: record.contractorId, requestId: e.id,
        });
      }
      log(null, "intel", "repair_learned", {
        jobId: record.jobId, category: record.issueCategory, contractorId: record.contractorId,
      });
    },
    "intel.repair-learning"
  );
}
