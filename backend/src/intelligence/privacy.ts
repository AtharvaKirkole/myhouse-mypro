/*
 * Privacy primitives for the intelligence platform.
 *
 * Invariants enforced here:
 *  - one home's data is NEVER shown to another home — cross-home queries pass
 *    exclusively through k-anonymized aggregates (cohort >= intelMinCohort)
 *  - free text persisted into learning tables is PII-scrubbed first
 *  - optional differential privacy: Laplace noise on published aggregates
 *  - retention: the immutable domain-event log is pruned past RETENTION_DAYS
 */

import { config } from "../core/config";
import { db } from "../db/store";

/** strip emails, phone numbers, and street addresses from stored free text */
export function scrubPII(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]{2,}/g, "[email]")
    .replace(/(\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{1,5}\s+[A-Z][A-Za-z]+(\s[A-Z][A-Za-z]+)*\s(St|Ave|Dr|Rd|Blvd|Ln|Ct|Way|Pl)\b\.?/g, "[address]")
    .slice(0, 2000);
}

/** k-anonymity gate: an aggregate may only be published for a large-enough cohort */
export function cohortOk(n: number): boolean {
  return n >= config.intelMinCohort;
}

/** Laplace mechanism (differential privacy hook); epsilon 0 disables noise */
export function dpValue(value: number, sensitivity = 1): number {
  if (!config.dpEpsilon || config.dpEpsilon <= 0) return value;
  const u = Math.random() - 0.5;
  const noise = -(sensitivity / config.dpEpsilon) * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return Math.max(0, value + noise);
}

/** truncate a ZIP to its 3-digit prefix for regional aggregates */
export function zipRegion(zip?: string): string | null {
  return zip && /^\d{5}$/.test(zip) ? `${zip.slice(0, 3)}xx` : null;
}

/** PII-minimizing filter for the immutable domain-event log */
const PII_PAYLOAD_KEY = /(email|name|password|token|secret|address|phone|notes|description)/i;

export function minimizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (PII_PAYLOAD_KEY.test(k)) continue;
    out[k] = typeof v === "string" ? v.slice(0, 200) : v;
  }
  return out;
}

/** retention: prune domain events older than the policy window */
export function purgeExpiredIntel(nowMs = Date.now()): number {
  const cutoff = new Date(nowMs - config.retentionDays * 86_400_000).toISOString();
  const before = db.data.domainEvents.length;
  db.data.domainEvents = db.data.domainEvents.filter((e) => e.ts >= cutoff);
  const removed = before - db.data.domainEvents.length;
  if (removed > 0) db.persist();
  return removed;
}
