/*
 * Predictive Maintenance Engine.
 *
 * Per-asset hazard estimation: category lifespan priors, blended with the
 * cross-home model analytics when the cohort is large enough, adjusted by the
 * asset's own repair history. Outputs failure probability, remaining useful
 * life, expected repair cost, and a repair/replace/monitor recommendation —
 * each with a confidence that reflects how much evidence backs it.
 */

import { db, type AssetRow } from "../db/store";
import { cohortOk } from "./privacy";
import { modelReliability } from "./analytics";

/** category lifespan priors (years) — replaced by learned curves as data grows */
const LIFESPAN_PRIOR: Record<string, number> = {
  Appliances: 12,
  HVAC: 15,
  Plumbing: 12,
  Electronics: 9,
  Furniture: 14,
  Outdoor: 10,
  Other: 10,
};

const REPAIR_COST_PRIOR_CENTS: Record<string, number> = {
  Appliances: 24000,
  HVAC: 38000,
  Plumbing: 28000,
  Electronics: 18000,
  Furniture: 15000,
  Outdoor: 16000,
  Other: 20000,
};

export interface AssetPrediction {
  assetId: string;
  name: string;
  brand?: string;
  model?: string;
  ageYears: number | null;
  expectedLifespanYears: number;
  failureProbability12mo: number; // 0..1
  remainingUsefulLifeYears: number | null;
  expectedRepairCostCents: number;
  recommendation: "maintain" | "monitor" | "repair" | "replace";
  reasons: string[];
  confidence: number; // 0..1
}

function ageOf(asset: AssetRow): number | null {
  const year = Number((asset.purchased?.match(/\d{4}/) ?? [])[0]);
  if (!Number.isFinite(year)) return null;
  return Math.max(0, new Date().getUTCFullYear() - year);
}

export function predictAsset(asset: AssetRow): AssetPrediction {
  const reasons: string[] = [];
  let lifespan = LIFESPAN_PRIOR[asset.category] ?? LIFESPAN_PRIOR.Other;
  let expectedCost = REPAIR_COST_PRIOR_CENTS[asset.category] ?? REPAIR_COST_PRIOR_CENTS.Other;
  let confidence = 0.35; // priors only

  // learned adjustment from the anonymized cross-home cohort
  if (asset.brand && asset.model) {
    const rel = modelReliability(asset.brand, asset.model);
    if (rel.sufficientData && cohortOk(rel.cohort)) {
      confidence = 0.6;
      if (rel.avgAssetAgeAtRepairYears) {
        lifespan = Number(((lifespan + rel.avgAssetAgeAtRepairYears * 1.4) / 2).toFixed(1));
        reasons.push(`cohort of ${rel.cohort} homes: repairs cluster at ${rel.avgAssetAgeAtRepairYears}y for this model`);
      }
      if (rel.avgRepairCostCents) expectedCost = rel.avgRepairCostCents;
      if ((rel.reliabilityScore ?? 50) < 40) {
        reasons.push(`model reliability score ${rel.reliabilityScore}/100 — below average`);
      }
    }
  }

  const age = ageOf(asset);
  const repairs = db.data.repairRecords.filter((r) => r.assetId === asset.id);
  const repairBoost = Math.min(0.3, repairs.length * 0.12);
  if (repairs.length > 0) {
    reasons.push(`${repairs.length} prior repair${repairs.length > 1 ? "s" : ""} on this unit`);
    confidence = Math.min(0.85, confidence + 0.15);
  }

  let p: number;
  let rul: number | null;
  if (age === null) {
    p = 0.15 + repairBoost;
    rul = null;
    reasons.push("purchase date unknown — probability is a floor estimate");
    confidence = Math.min(confidence, 0.3);
  } else {
    const ratio = age / lifespan;
    p = 1 / (1 + Math.exp(-4 * (ratio - 1))) + repairBoost; // logistic hazard around end-of-life
    rul = Math.max(0, Number((lifespan * (1 - repairBoost) - age).toFixed(1)));
    reasons.unshift(`${age}y old vs ${lifespan}y expected lifespan (${Math.round(ratio * 100)}% consumed)`);
  }
  p = Math.min(0.97, Number(p.toFixed(2)));

  const recommendation: AssetPrediction["recommendation"] =
    p >= 0.75 ? "replace" : p >= 0.5 ? "repair" : p >= 0.3 ? "monitor" : "maintain";

  return {
    assetId: asset.id,
    name: asset.name,
    brand: asset.brand || undefined,
    model: asset.model || undefined,
    ageYears: age,
    expectedLifespanYears: lifespan,
    failureProbability12mo: p,
    remainingUsefulLifeYears: rul,
    expectedRepairCostCents: expectedCost,
    recommendation,
    reasons,
    confidence: Number(confidence.toFixed(2)),
  };
}

export function predictionsForHome(homeId: string): AssetPrediction[] {
  return db.data.assets
    .filter((a) => a.homeId === homeId && !a.deletedAt)
    .map(predictAsset)
    .sort((a, b) => b.failureProbability12mo - a.failureProbability12mo);
}
