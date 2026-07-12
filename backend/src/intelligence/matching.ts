/*
 * AI Contractor Matching Engine — never "closest first".
 *
 * Multi-factor weighted scoring over the contractor knowledge graph, with an
 * explainable per-factor breakdown in every response (a match you can't
 * explain is a match support can't defend). Confidence grows with evidence.
 */

import { db, type JobRow, type UserRow } from "../db/store";
import { getContractorProfile } from "./learning";

interface Factor {
  name: string;
  weight: number;
  value: number; // 0..1
  evidence: string;
}

export interface ContractorMatch {
  contractorId: string;
  business: string;
  score: number; // 0..100
  confidence: number; // 0..1
  factors: Factor[];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function cityMatch(pro: UserRow, homeAddress: string): number {
  const base = pro.proProfile?.baseCity?.trim().toLowerCase();
  if (!base) return 0.4;
  return homeAddress.toLowerCase().includes(base) ? 1 : 0.3;
}

export function matchContractors(job: JobRow, limit = 5): ContractorMatch[] {
  const home = db.data.homes.find((h) => h.id === job.homeId);
  const asset = db.data.assets.find(
    (a) => a.homeId === job.homeId && a.brand && job.description.toLowerCase().includes(a.brand.toLowerCase())
  );
  const pros = db.data.users.filter((u) => u.accountType === "pro" && !u.deletedAt);

  const matches = pros.map((pro): ContractorMatch => {
    const profile = getContractorProfile(pro.id);
    const brands = profile?.brands ?? {};
    const models = profile?.models ?? {};
    const cats = profile?.issueCategories ?? {};

    const brandJobs = asset?.brand ? (Object.entries(brands).find(([b]) => b.toLowerCase() === asset.brand.toLowerCase())?.[1] ?? 0) : 0;
    const modelJobs = asset?.model ? (Object.entries(models).find(([m]) => m.toLowerCase() === asset.model.toLowerCase())?.[1] ?? 0) : 0;
    const catJobs = Object.entries(cats).find(([c]) => c.toLowerCase() === job.category.toLowerCase())?.[1] ?? 0;

    const activeAccepted = db.data.jobs.filter(
      (j) => j.status === "accepted" && db.data.bids.some((b) => b.id === j.acceptedBidId && b.proUserId === pro.id)
    ).length;

    const factors: Factor[] = [
      {
        name: "model_experience", weight: 0.2, value: clamp01(modelJobs / 5),
        evidence: asset?.model ? `${modelJobs} repairs on ${asset.brand} ${asset.model}` : "no model detected on this job",
      },
      {
        name: "brand_experience", weight: 0.12, value: clamp01(brandJobs / 10),
        evidence: asset?.brand ? `${brandJobs} repairs on ${asset.brand}` : "no brand detected",
      },
      {
        name: "issue_category_experience", weight: 0.13, value: clamp01(catJobs / 10),
        evidence: `${catJobs} ${job.category} jobs completed`,
      },
      {
        name: "rating", weight: 0.15, value: profile?.avgRating != null ? clamp01((profile.avgRating - 3) / 2) : 0.4,
        evidence: profile?.avgRating != null ? `avg rating ${profile.avgRating}` : "not yet rated",
      },
      {
        name: "quality", weight: 0.1, value: (profile?.qualityScore ?? 50) / 100,
        evidence: `quality score ${profile?.qualityScore ?? 50}/100`,
      },
      {
        name: "pricing_consistency", weight: 0.07, value: profile?.quoteAccuracy ?? 0.5,
        evidence: profile?.quoteAccuracy != null ? `quote accuracy ${(profile.quoteAccuracy * 100).toFixed(0)}%` : "no quote history",
      },
      {
        name: "proximity", weight: 0.1, value: home ? cityMatch(pro, home.address) : 0.4,
        evidence: pro.proProfile?.baseCity ? `based in ${pro.proProfile.baseCity}` : "service area unknown",
      },
      {
        name: "availability", weight: 0.08, value: activeAccepted < 3 ? 1 : activeAccepted < 6 ? 0.5 : 0.1,
        evidence: `${activeAccepted} active jobs on the calendar`,
      },
      {
        name: "emergency_fit", weight: 0.05,
        value: job.urgency !== "emergency" ? 0.7 : pro.proProfile?.emergency ? 1 : 0.1,
        evidence: job.urgency === "emergency" ? (pro.proProfile?.emergency ? "offers 24/7 emergency service" : "no emergency availability") : "not an emergency job",
      },
    ];

    const score = factors.reduce((a, f) => a + f.weight * f.value, 0) / factors.reduce((a, f) => a + f.weight, 0);
    const evidenceCount = (profile?.jobsCompleted ?? 0) + (profile?.avgRating != null ? 3 : 0);

    return {
      contractorId: pro.id,
      business: pro.proProfile?.business ?? pro.name,
      score: Math.round(score * 100),
      confidence: Number(clamp01(evidenceCount / 15).toFixed(2)),
      factors,
    };
  });

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
