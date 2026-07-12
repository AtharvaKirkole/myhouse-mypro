/*
 * Manufacturer & Model Analytics — anonymized cross-home aggregates.
 *
 * Every number published here passes the k-anonymity gate (cohortOk) and the
 * optional differential-privacy noise hook. No row-level data, no home ids,
 * no user ids ever leave this module — only cohort statistics.
 */

import { db, type RepairRecordRow } from "../db/store";
import { cohortOk, dpValue, zipRegion } from "./privacy";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function repairsFor(brand: string, model?: string): RepairRecordRow[] {
  return db.data.repairRecords.filter(
    (r) => r.brand && norm(r.brand) === norm(brand) && (!model || (r.model && norm(r.model) === norm(model)))
  );
}

function share<T>(rows: T[], pick: (r: T) => string | undefined): { key: string; share: number; n: number }[] {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const k = pick(r);
    if (!k) continue;
    counts[k] = (counts[k] ?? 0) + 1;
    total++;
  }
  return Object.entries(counts)
    .map(([key, n]) => ({ key, share: Number((n / Math.max(1, total)).toFixed(2)), n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
}

export interface ModelReliability {
  brand: string;
  model?: string;
  sufficientData: boolean;
  cohort: number;
  avgRepairCostCents?: number;
  avgLaborMinutes?: number;
  commonIssues?: { key: string; share: number }[];
  commonRootCauses?: { key: string; share: number }[];
  commonParts?: { key: string; share: number }[];
  warrantyClaimRate?: number;
  seasonalPeak?: string;
  avgAssetAgeAtRepairYears?: number;
  reliabilityScore?: number; // 0..100, higher = more reliable
}

export function modelReliability(brand: string, model?: string): ModelReliability {
  const rows = repairsFor(brand, model);
  const cohortHomes = new Set(rows.map((r) => r.homeId)).size;
  if (!cohortOk(cohortHomes)) {
    return { brand, model, sufficientData: false, cohort: cohortHomes };
  }

  const avgCost = rows.reduce((a, r) => a + r.costCents, 0) / rows.length;
  const avgLabor = rows.reduce((a, r) => a + r.laborMinutes, 0) / rows.length;
  const warrantyRate = rows.filter((r) => r.warrantyCovered).length / rows.length;

  const seasons: Record<string, number> = {};
  for (const r of rows) seasons[r.season] = (seasons[r.season] ?? 0) + 1;
  const seasonalPeak = Object.entries(seasons).sort((a, b) => b[1] - a[1])[0]?.[0];

  // asset age at repair — the lifespan signal
  const ages: number[] = [];
  for (const r of rows) {
    const asset = db.data.assets.find((a) => a.id === r.assetId);
    const year = asset?.purchased ? Number((asset.purchased.match(/\d{4}/) ?? [])[0]) : NaN;
    if (Number.isFinite(year)) ages.push(new Date(r.createdAt).getUTCFullYear() - year);
  }
  const avgAge = ages.length ? ages.reduce((a, x) => a + x, 0) / ages.length : undefined;

  // repairs per home in the cohort: >1 means the model comes back
  const repairsPerHome = rows.length / cohortHomes;
  const reliabilityScore = Math.round(
    Math.max(1, Math.min(99, 90 - (repairsPerHome - 1) * 30 - warrantyRate * 10 + (avgAge && avgAge > 8 ? 5 : 0)))
  );

  return {
    brand,
    model,
    sufficientData: true,
    cohort: cohortHomes,
    avgRepairCostCents: Math.round(dpValue(avgCost, 500)),
    avgLaborMinutes: Math.round(dpValue(avgLabor, 5)),
    commonIssues: share(rows, (r) => r.issueCategory),
    commonRootCauses: share(rows, (r) => r.rootCause),
    commonParts: share(
      rows.flatMap((r) => r.partsReplaced.map((p) => ({ p }))),
      (x) => x.p
    ),
    warrantyClaimRate: Number(warrantyRate.toFixed(2)),
    seasonalPeak,
    avgAssetAgeAtRepairYears: avgAge !== undefined ? Number(avgAge.toFixed(1)) : undefined,
    reliabilityScore,
  };
}

export function manufacturerRanking(): {
  brand: string; cohort: number; repairs: number; avgRepairCostCents: number; reliabilityScore: number;
}[] {
  const byBrand = new Map<string, RepairRecordRow[]>();
  for (const r of db.data.repairRecords) {
    if (!r.brand) continue;
    const k = norm(r.brand);
    byBrand.set(k, [...(byBrand.get(k) ?? []), r]);
  }
  const out: { brand: string; cohort: number; repairs: number; avgRepairCostCents: number; reliabilityScore: number }[] = [];
  for (const [brand, rows] of byBrand) {
    const cohort = new Set(rows.map((r) => r.homeId)).size;
    if (!cohortOk(cohort)) continue; // k-anonymity: small cohorts never published
    const rel = modelReliability(rows[0].brand!);
    out.push({
      brand,
      cohort,
      repairs: rows.length,
      avgRepairCostCents: rel.avgRepairCostCents ?? 0,
      reliabilityScore: rel.reliabilityScore ?? 50,
    });
  }
  return out.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
}

export function topFailureModels(category?: string): {
  brand: string; model: string; repairs: number; cohort: number; avgRepairCostCents: number;
}[] {
  const byModel = new Map<string, RepairRecordRow[]>();
  for (const r of db.data.repairRecords) {
    if (!r.brand || !r.model) continue;
    if (category && norm(r.issueCategory) !== norm(category)) continue;
    const k = `${norm(r.brand)}|${norm(r.model)}`;
    byModel.set(k, [...(byModel.get(k) ?? []), r]);
  }
  const out: { brand: string; model: string; repairs: number; cohort: number; avgRepairCostCents: number }[] = [];
  for (const rows of byModel.values()) {
    const cohort = new Set(rows.map((r) => r.homeId)).size;
    if (!cohortOk(cohort)) continue;
    out.push({
      brand: rows[0].brand!,
      model: rows[0].model!,
      repairs: rows.length,
      cohort,
      avgRepairCostCents: Math.round(dpValue(rows.reduce((a, r) => a + r.costCents, 0) / rows.length, 500)),
    });
  }
  return out.sort((a, b) => b.repairs / b.cohort - a.repairs / a.cohort).slice(0, 10);
}

export function issuesByRegion(category?: string): { region: string; topIssue: string; repairs: number }[] {
  const byRegion = new Map<string, RepairRecordRow[]>();
  for (const r of db.data.repairRecords) {
    const region = zipRegion(r.zip);
    if (!region) continue;
    if (category && norm(r.issueCategory) !== norm(category)) continue;
    byRegion.set(region, [...(byRegion.get(region) ?? []), r]);
  }
  const out: { region: string; topIssue: string; repairs: number }[] = [];
  for (const [region, rows] of byRegion) {
    const cohort = new Set(rows.map((r) => r.homeId)).size;
    if (!cohortOk(cohort)) continue;
    out.push({ region, topIssue: share(rows, (r) => r.issueCategory)[0]?.key ?? "—", repairs: rows.length });
  }
  return out.sort((a, b) => b.repairs - a.repairs);
}

export function contractorSuccessOnBrand(brand: string, minRate: number): {
  contractorId: string; business: string; jobsOnBrand: number; avgRating: number | null; qualityScore: number;
}[] {
  return db.data.contractorProfiles
    .filter((p) => {
      const jobs = Object.entries(p.brands).find(([b]) => norm(b) === norm(brand))?.[1] ?? 0;
      return jobs > 0 && p.qualityScore / 100 >= minRate;
    })
    .map((p) => ({
      contractorId: p.userId,
      business: db.data.users.find((u) => u.id === p.userId)?.proProfile?.business ?? "—",
      jobsOnBrand: Object.entries(p.brands).find(([b]) => norm(b) === norm(brand))?.[1] ?? 0,
      avgRating: p.avgRating,
      qualityScore: p.qualityScore,
    }))
    .sort((a, b) => b.jobsOnBrand - a.jobsOnBrand)
    .slice(0, 10);
}

/** personal query — repeat repairs across the CALLER's homes only (never global) */
export function repeatRepairsForHomes(homeIds: string[], brand: string | undefined, minRepairs: number) {
  const mine = db.data.repairRecords.filter(
    (r) => homeIds.includes(r.homeId) && (!brand || (r.brand && norm(r.brand) === norm(brand)))
  );
  const byAsset = new Map<string, RepairRecordRow[]>();
  for (const r of mine) {
    if (!r.assetId) continue;
    byAsset.set(r.assetId, [...(byAsset.get(r.assetId) ?? []), r]);
  }
  return [...byAsset.entries()]
    .filter(([, rows]) => rows.length >= minRepairs)
    .map(([assetId, rows]) => {
      const asset = db.data.assets.find((a) => a.id === assetId);
      return {
        assetId,
        name: asset?.name ?? "—",
        brand: asset?.brand,
        model: asset?.model,
        repairs: rows.length,
        totalCostCents: rows.reduce((a, r) => a + r.costCents, 0),
      };
    })
    .sort((a, b) => b.repairs - a.repairs);
}
