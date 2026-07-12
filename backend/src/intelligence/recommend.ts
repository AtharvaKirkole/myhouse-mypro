/*
 * Proactive Recommendation Engine — the platform speaks first.
 * Merges predictive maintenance, warranty expiry windows, recall matches,
 * seasonal tasks, and efficiency opportunities into one prioritized feed.
 */

import { db } from "../db/store";
import { predictionsForHome } from "./predictive";

export interface Recommendation {
  id: string;
  kind: "recall" | "replace" | "repair" | "warranty_claim" | "maintenance" | "seasonal" | "efficiency";
  priority: number; // 1 = act now
  title: string;
  reason: string;
  action: string;
  assetId?: string;
}

/** known recalls (CPSC/NHTSA feed adapter in production) */
export const RECALLS: { brand: string; modelPrefix: string; title: string; ref: string }[] = [
  { brand: "Samsung", modelPrefix: "WF45", title: "Washer drum fastener recall", ref: "CPSC-24-118" },
  { brand: "GE", modelPrefix: "JGB735", title: "Gas range knob accidental-activation recall", ref: "CPSC-23-702" },
  { brand: "ChargePoint", modelPrefix: "Home Flex", title: "EVSE firmware overheat advisory", ref: "NHTSA-22V-441" },
];

const SEASONAL: Record<string, { title: string; action: string }[]> = {
  winter: [{ title: "Insulate exterior hose bibs", action: "15-minute DIY before the first freeze" }],
  spring: [{ title: "Service AC before summer load", action: "book an HVAC tune-up while slots are cheap" }],
  summer: [{ title: "Check irrigation for leaks", action: "walk zones monthly during peak watering" }],
  fall: [{ title: "Flush water heater sediment", action: "annual flush extends tank life 2-3 years" }],
};

function season(): string {
  const m = new Date().getUTCMonth() + 1;
  return m === 12 || m <= 2 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "fall";
}

export function recommendationsForHome(homeId: string): Recommendation[] {
  const out: Recommendation[] = [];
  const assets = db.data.assets.filter((a) => a.homeId === homeId && !a.deletedAt);
  const nowIso = new Date().toISOString();
  const in60d = new Date(Date.now() + 60 * 86_400_000).toISOString();

  // 1. recalls — always first
  for (const a of assets) {
    const recall = RECALLS.find(
      (r) => a.brand.toLowerCase() === r.brand.toLowerCase() && a.model.toLowerCase().startsWith(r.modelPrefix.toLowerCase())
    );
    if (recall) {
      out.push({
        id: `rec-recall-${a.id}`, kind: "recall", priority: 1, assetId: a.id,
        title: `Recall: ${a.name}`, reason: `${recall.title} (${recall.ref}) matches ${a.brand} ${a.model}`,
        action: "Manufacturer remedy is free — schedule the fix",
      });
    }
  }

  // 2. predictive replace / repair
  for (const p of predictionsForHome(homeId)) {
    if (p.recommendation === "replace") {
      out.push({
        id: `rec-replace-${p.assetId}`, kind: "replace", priority: 2, assetId: p.assetId,
        title: `Plan replacement: ${p.name}`,
        reason: `${Math.round(p.failureProbability12mo * 100)}% failure probability within 12 months — ${p.reasons[0]}`,
        action: "Replacing on your schedule beats an emergency swap",
      });
    } else if (p.recommendation === "repair") {
      out.push({
        id: `rec-repair-${p.assetId}`, kind: "repair", priority: 3, assetId: p.assetId,
        title: `Inspect soon: ${p.name}`,
        reason: p.reasons[0] ?? "elevated failure risk",
        action: `Expected repair ~$${Math.round(p.expectedRepairCostCents / 100)} — book before it escalates`,
      });
    }
  }

  // 3. warranty claims before expiry
  for (const w of db.data.warranties.filter((x) => x.homeId === homeId && !x.deletedAt)) {
    if (w.expiresAt > nowIso && w.expiresAt <= in60d) {
      out.push({
        id: `rec-warranty-${w.id}`, kind: "warranty_claim", priority: 3, assetId: w.assetId ?? undefined,
        title: `Warranty expiring: ${w.item}`,
        reason: `coverage ends ${w.expiresAt.slice(0, 10)} — known issues must be claimed before then`,
        action: "Inspect now; file any claim while it's still free",
      });
    }
  }

  // 4. seasonal + efficiency
  for (const s of SEASONAL[season()] ?? []) {
    out.push({
      id: `rec-season-${s.title.replace(/\s+/g, "-").toLowerCase()}`, kind: "seasonal", priority: 5,
      title: s.title, reason: `${season()} maintenance window`, action: s.action,
    });
  }
  for (const a of assets) {
    const year = Number((a.purchased?.match(/\d{4}/) ?? [])[0]);
    if (a.category === "HVAC" && Number.isFinite(year) && new Date().getUTCFullYear() - year > 10) {
      out.push({
        id: `rec-eff-${a.id}`, kind: "efficiency", priority: 6, assetId: a.id,
        title: `Efficiency upgrade: ${a.name}`,
        reason: "units older than 10 years typically run 20-40% below modern SEER ratings",
        action: "A heat-pump swap may qualify for federal tax credits",
      });
    }
  }

  return out.sort((a, b) => a.priority - b.priority);
}
