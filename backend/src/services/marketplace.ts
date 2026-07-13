/* Marketplace Service — structured jobs, bids, acceptance → escrow hold.
   Robustness: explicit state machine, optimistic locking, duplicate-bid
   detection, ownership verification, fraud hooks, full audit trail. */

import { Router } from "express";
import { service, idempotency } from "../core/http";
import { ConflictError, ForbiddenError, NotFoundError } from "../core/errors";
import { authorize } from "../core/rbac";
import { publish } from "../core/events";
import { audit, requireAuth } from "./auth";
import { validate, JobCreateSchema, BidCreateSchema, AcceptBidSchema, CompleteJobSchema } from "../core/validate";
import { db, now, touch, uid, type JobRow } from "../db/store";
import { createHold } from "./payments";
import { classifierEntries, professionsFor, taxonomyByCluster } from "./taxonomy";

/*
 * Classification reads the service taxonomy (categories are data, not code):
 * score by hit count; ties resolve to the earlier taxonomy entry, whose
 * ordering puts specific services before equipment before trades before
 * generic cleaning — so "dishwasher not draining" is an appliance job even
 * though "drain" is a plumbing word, and "toilet cleaning" is a cleaning job
 * even though "toilet" is a plumbing word.
 */
export function structureJob(description: string): { title: string; category: string; urgency: string } {
  const t = ` ${description.toLowerCase()} `;
  let category = "Handyman";
  let best = 0;
  for (const [name, words] of classifierEntries()) {
    const hits = words.filter((w) => t.includes(w)).length;
    if (hits > best) {
      best = hits;
      category = name;
    }
  }
  const urgency = /(flood|burst|sparking|no power|no heat|emergency|asap)/.test(t) ? "emergency" : "flexible";
  return { title: `${category} — ${description.slice(0, 48)}`, category, urgency };
}

/* explicit job state machine — the only legal transitions */
const TRANSITIONS: Record<JobRow["status"], JobRow["status"][]> = {
  open: ["accepted", "cancelled"],
  accepted: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function transition(job: JobRow, to: JobRow["status"], expectedVersion?: number) {
  if (!TRANSITIONS[job.status].includes(to)) {
    throw new ConflictError("invalid_transition", `${job.status} → ${to} is not allowed`);
  }
  touch(job, expectedVersion); // optimistic locking
  job.status = to;
}

/** fraud hook — velocity/duplicate/risk scoring plugs in here */
export function fraudCheck(_kind: "job" | "bid", _payload: Record<string, unknown>): { ok: boolean; reason?: string } {
  return { ok: true };
}

export const marketplaceRouter = Router();
marketplaceRouter.use(service("marketplace"), requireAuth);

marketplaceRouter.post(
  "/homes/:homeId/jobs",
  authorize("create", "job", (req) => req.params.homeId),
  validate(JobCreateSchema),
  idempotency,
  (req, res) => {
    const { description } = req.body;
    const s = structureJob(description);

    // duplicate detection: identical open job on the same home
    const dup = db.data.jobs.find(
      (j) => j.homeId === req.params.homeId && j.status === "open" && j.description === description
    );
    if (dup) throw new ConflictError("duplicate_job", "an identical open job already exists");

    const fraud = fraudCheck("job", { userId: req.userId, description });
    if (!fraud.ok) throw new ForbiddenError("fraud_suspected", fraud.reason);

    const job: JobRow = {
      id: uid("job"),
      homeId: req.params.homeId,
      createdBy: req.userId!,
      ...s,
      description,
      status: "open",
      createdAt: now(),
      version: 1,
    };
    db.data.jobs.push(job);
    db.persist();
    audit(req, "job.create", job.id, { after: { category: job.category, urgency: job.urgency } });
    publish("job.created", {
      jobId: job.id,
      homeId: job.homeId,
      category: job.category,
      urgency: job.urgency,
      description: job.description,
    });
    res.status(201).json(job);
  }
);

/* the full service taxonomy, grouped by cluster — categories are data */
marketplaceRouter.get("/categories", (_req, res) => {
  res.json(taxonomyByCluster());
});

/* pro job feed: open jobs routed via the taxonomy's category→profession map */
marketplaceRouter.get("/jobs/feed", (req, res) => {
  const me = db.data.users.find((u) => u.id === req.userId);
  if (me?.accountType !== "pro") throw new ForbiddenError("pros_only");
  const mine = (me.proProfile?.professions ?? []).map((p) => p.toLowerCase());
  const open = db.data.jobs.filter((j) => j.status === "open");
  const matched = mine.length
    ? open.filter((j) => professionsFor(j.category).some((p) => mine.includes(p.toLowerCase())))
    : open;
  res.json(matched.length ? matched : open);
});

marketplaceRouter.post("/jobs/:jobId/bids", validate(BidCreateSchema), idempotency, (req, res) => {
  const me = db.data.users.find((u) => u.id === req.userId);
  if (me?.accountType !== "pro") throw new ForbiddenError("pros_only");
  const job = db.data.jobs.find((j) => j.id === req.params.jobId);
  if (!job || job.status !== "open") throw new NotFoundError("job_not_open");
  if (db.data.bids.some((b) => b.jobId === job.id && b.proUserId === me.id)) {
    throw new ConflictError("already_bid", "you already have a bid on this job");
  }
  const { price, etaLabel, warranty } = req.body;
  const bid = { id: uid("bid"), jobId: job.id, proUserId: me.id, price, etaLabel, warranty, createdAt: now() };
  db.data.bids.push(bid);
  db.persist();
  audit(req, "bid.place", bid.id, { after: { jobId: job.id, price } });
  publish("bid.placed", { jobId: job.id, bidId: bid.id, userId: job.createdBy, price });
  res.status(201).json(bid);
});

marketplaceRouter.get("/jobs/:jobId/bids", (req, res) => {
  const job = db.data.jobs.find((j) => j.id === req.params.jobId);
  // ownership check first, 404 for non-owners — no bid data leaks across tenants
  if (!job || job.createdBy !== req.userId) throw new NotFoundError();
  res.json(db.data.bids.filter((b) => b.jobId === job.id));
});

/* acceptance is transactional: state change + escrow hold succeed or fail together */
marketplaceRouter.post("/bids/:bidId/accept", validate(AcceptBidSchema), idempotency, (req, res) => {
  const bid = db.data.bids.find((b) => b.id === req.params.bidId);
  if (!bid) throw new NotFoundError();
  const job = db.data.jobs.find((j) => j.id === bid.jobId);
  if (!job || job.createdBy !== req.userId) throw new NotFoundError();

  const result = db.withTx(() => {
    transition(job, "accepted", req.body.jobVersion);
    job.acceptedBidId = bid.id;
    const payment = createHold(job.id, req.userId!, bid.proUserId, Math.round(bid.price * 100), req.requestId);
    return { job, payment };
  });

  audit(req, "bid.accept", bid.id, { after: { jobId: job.id, amountCents: result.payment.amountCents } });
  publish("bid.accepted", { jobId: job.id, bidId: bid.id, proUserId: bid.proUserId, homeownerId: req.userId });
  res.json(result);
});

/*
 * Completion captures structured repair intelligence (all fields optional —
 * the old bare completion still works). The payload feeds the learning
 * pipeline: repair record → contractor profile → model analytics → graph.
 */
marketplaceRouter.post("/jobs/:jobId/complete", validate(CompleteJobSchema), idempotency, (req, res) => {
  const job = db.data.jobs.find((j) => j.id === req.params.jobId);
  if (!job || job.createdBy !== req.userId) throw new NotFoundError();

  // assetId, if supplied, must belong to the job's own home — no cross-tenant links
  if (req.body.assetId && !db.data.assets.some((a) => a.id === req.body.assetId && a.homeId === job.homeId)) {
    throw new NotFoundError("asset_not_found");
  }

  transition(job, "completed");
  db.persist();
  const bid = job.acceptedBidId ? db.data.bids.find((b) => b.id === job.acceptedBidId) : undefined;
  audit(req, "job.complete", job.id, { after: { rootCause: req.body.rootCause, rating: req.body.rating } });
  publish("job.completed", {
    jobId: job.id,
    homeId: job.homeId,
    contractorId: bid?.proUserId,
    priceCents: bid ? Math.round(bid.price * 100) : undefined,
    category: job.category,
    urgency: job.urgency,
    ...req.body,
  });
  res.json(job);
});
