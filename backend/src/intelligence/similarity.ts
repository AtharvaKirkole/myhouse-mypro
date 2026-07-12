/*
 * Historical Issue Similarity Engine.
 *
 * A new issue is embedded and searched against every past issue vector.
 * Privacy contract: matches from OTHER homes are never returned row-by-row —
 * they fold into k-anonymized aggregates (costs, durations, root causes,
 * outcome probabilities). Only the caller's own past issues are listed.
 */

import { db, type JobRow } from "../db/store";
import { embedder, searchSimilar } from "./embeddings";
import { cohortOk } from "./privacy";
import { getContractorProfile } from "./learning";

export interface SimilarIssuesReport {
  jobId: string;
  cohort: number;
  sufficientData: boolean;
  ownHomeMatches: { jobId: string; title: string; score: number; status: string }[];
  aggregates?: {
    avgRepairCostCents: number;
    avgLaborMinutes: number;
    topRootCauses: { key: string; n: number }[];
    warrantyCoverageRate: number;
    replacementProbability: number;
    recommendedContractor: { contractorId: string; business: string; jobsOnCategory: number; avgRating: number | null } | null;
  };
}

export function similarIssues(job: JobRow): SimilarIssuesReport {
  const vector = embedder.embed(`${job.category} ${job.description}`);
  const hits = searchSimilar(vector, { topK: 25, excludeRefId: job.id });

  const ownHits = hits.filter((h) => h.homeId === job.homeId);
  const crossHits = hits.filter((h) => h.homeId !== job.homeId);
  const crossHomes = new Set(crossHits.map((h) => h.homeId));

  const ownHomeMatches = ownHits.slice(0, 5).map((h) => {
    const j = db.data.jobs.find((x) => x.id === h.refId);
    return { jobId: h.refId, title: j?.title ?? "—", score: h.score, status: j?.status ?? "—" };
  });

  if (!cohortOk(crossHomes.size)) {
    return { jobId: job.id, cohort: crossHomes.size, sufficientData: false, ownHomeMatches };
  }

  const records = crossHits
    .map((h) => db.data.repairRecords.find((r) => r.jobId === h.refId))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);

  const causes: Record<string, number> = {};
  for (const r of records) if (r.rootCause) causes[r.rootCause] = (causes[r.rootCause] ?? 0) + 1;

  const replacements = records.filter(
    (r) => r.rootCause?.toLowerCase().includes("end of life") || r.partsReplaced.some((p) => p.toLowerCase().includes("full unit"))
  ).length;

  // best contractor across the matched repairs, by volume then rating
  const byContractor: Record<string, number> = {};
  for (const r of records) byContractor[r.contractorId] = (byContractor[r.contractorId] ?? 0) + 1;
  const top = Object.entries(byContractor).sort((a, b) => b[1] - a[1])[0];
  const topProfile = top ? getContractorProfile(top[0]) : undefined;
  const topUser = top ? db.data.users.find((u) => u.id === top[0]) : undefined;

  const n = Math.max(1, records.length);
  return {
    jobId: job.id,
    cohort: crossHomes.size,
    sufficientData: true,
    ownHomeMatches,
    aggregates: {
      avgRepairCostCents: Math.round(records.reduce((a, r) => a + r.costCents, 0) / n),
      avgLaborMinutes: Math.round(records.reduce((a, r) => a + r.laborMinutes, 0) / n),
      topRootCauses: Object.entries(causes)
        .map(([key, count]) => ({ key, n: count }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 3),
      warrantyCoverageRate: Number((records.filter((r) => r.warrantyCovered).length / n).toFixed(2)),
      replacementProbability: Number((replacements / n).toFixed(2)),
      recommendedContractor:
        top && topUser
          ? {
              contractorId: top[0],
              business: topUser.proProfile?.business ?? topUser.name,
              jobsOnCategory: top[1],
              avgRating: topProfile?.avgRating ?? null,
            }
          : null,
    },
  };
}
