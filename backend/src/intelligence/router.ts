/*
 * Intelligence Service router — all endpoints ride the existing security
 * stack: JWT auth → policy engine (tenant isolation, 404-not-403) →
 * zod validation → rate limits from the gateway.
 *
 * Two access tiers:
 *   home-scoped  → authorize("view", "intel", …) — members only
 *   cross-home   → authenticated, but ONLY k-anonymized aggregates
 */

import { Router } from "express";
import { service } from "../core/http";
import { NotFoundError } from "../core/errors";
import { authorize, roleInHome, canAct } from "../core/rbac";
import { requireAuth } from "../services/auth";
import {
  validate,
  ContractorSuccessQuerySchema,
  RegionQuerySchema,
  ReliabilityQuerySchema,
  RepeatRepairsQuerySchema,
} from "../core/validate";
import { db, notDeleted } from "../db/store";
import { neighbors, subgraphForHome } from "./graph";
import { contractorSuccessOnBrand, issuesByRegion, manufacturerRanking, modelReliability, repeatRepairsForHomes, topFailureModels } from "./analytics";
import { predictionsForHome } from "./predictive";
import { recommendationsForHome } from "./recommend";
import { matchContractors } from "./matching";
import { similarIssues } from "./similarity";
import { getContractorProfile, recomputeContractorProfile } from "./learning";

export const intelRouter = Router();
intelRouter.use(service("intel"), requireAuth);

/* ---------- home-scoped: knowledge graph ---------- */

intelRouter.get(
  "/homes/:homeId/graph",
  authorize("view", "intel", (req) => req.params.homeId),
  (req, res) => {
    res.json(subgraphForHome(req.params.homeId));
  }
);

intelRouter.get(
  "/homes/:homeId/graph/nodes/:nodeId/neighbors",
  authorize("view", "intel", (req) => req.params.homeId),
  (req, res) => {
    res.json(neighbors(req.params.homeId, req.params.nodeId));
  }
);

/* ---------- home-scoped: predictions & recommendations ---------- */

intelRouter.get(
  "/homes/:homeId/predictions",
  authorize("view", "intel", (req) => req.params.homeId),
  (req, res) => {
    res.json(predictionsForHome(req.params.homeId));
  }
);

intelRouter.get(
  "/homes/:homeId/recommendations",
  authorize("view", "intel", (req) => req.params.homeId),
  (req, res) => {
    res.json(recommendationsForHome(req.params.homeId));
  }
);

/* ---------- job-scoped: matching + similarity ----------
   Ownership rule mirrors the marketplace: only someone who can view intel on
   the job's home may see matches. Everyone else gets 404 — no job oracle. */

function jobForIntel(req: { params: { jobId: string }; userId?: string }) {
  const job = db.data.jobs.find((j) => j.id === req.params.jobId);
  if (!job) throw new NotFoundError();
  const user = db.data.users.find((u) => u.id === req.userId);
  if (!user?.isAdmin) {
    const role = req.userId ? roleInHome(req.userId, job.homeId) : null;
    if (!role || !canAct(role, "view", "intel")) throw new NotFoundError();
  }
  return job;
}

intelRouter.get("/jobs/:jobId/matches", (req, res) => {
  const job = jobForIntel(req);
  res.json({ jobId: job.id, matches: matchContractors(job) });
});

intelRouter.get("/jobs/:jobId/similar", (req, res) => {
  const job = jobForIntel(req);
  res.json(similarIssues(job));
});

/* ---------- personal analytics (caller's homes only) ---------- */

intelRouter.get("/analytics/repeat-repairs", validate(RepeatRepairsQuerySchema, "query"), (req, res) => {
  const myHomes = db.data.members.filter((m) => m.userId === req.userId).map((m) => m.homeId);
  const q = req.query as unknown as { brand?: string; minRepairs: number };
  res.json(repeatRepairsForHomes(myHomes, q.brand, q.minRepairs));
});

/* ---------- cross-home: k-anonymized aggregates only ---------- */

intelRouter.get("/reliability/model", validate(ReliabilityQuerySchema, "query"), (req, res) => {
  const q = req.query as unknown as { brand: string; model?: string };
  res.json(modelReliability(q.brand, q.model));
});

intelRouter.get("/reliability/manufacturers", (_req, res) => {
  res.json(manufacturerRanking());
});

intelRouter.get("/analytics/top-failure-models", validate(RegionQuerySchema, "query"), (req, res) => {
  const q = req.query as unknown as { category?: string };
  res.json(topFailureModels(q.category));
});

intelRouter.get("/analytics/issues-by-region", validate(RegionQuerySchema, "query"), (req, res) => {
  const q = req.query as unknown as { category?: string };
  res.json(issuesByRegion(q.category));
});

intelRouter.get("/analytics/contractor-success", validate(ContractorSuccessQuerySchema, "query"), (req, res) => {
  const q = req.query as unknown as { brand: string; minRate: number };
  res.json(contractorSuccessOnBrand(q.brand, q.minRate));
});

/* ---------- contractor: own expertise profile ---------- */

intelRouter.get("/contractors/me/profile", (req, res) => {
  const me = db.data.users.find((u) => u.id === req.userId && notDeleted(u));
  if (me?.accountType !== "pro") throw new NotFoundError();
  res.json(getContractorProfile(me.id) ?? recomputeContractorProfile(me.id));
});
