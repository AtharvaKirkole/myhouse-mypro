/* Marketplace Service — structured jobs, bids, acceptance → escrow hold. */

import { Router } from "express";
import { HttpError, service } from "../core/http";
import { requireHomePermission } from "../core/rbac";
import { publish } from "../core/events";
import { audit, requireAuth } from "./auth";
import { db, now, uid } from "../db/store";
import { createHold } from "./payments";

const CATEGORY_WORDS: [string, string[]][] = [
  ["Plumbing", ["leak", "pipe", "faucet", "drain", "toilet", "water heater", "clog"]],
  ["Electrical", ["outlet", "breaker", "spark", "wiring", "panel", "no power"]],
  ["HVAC", ["ac ", "air condition", "furnace", "no heat", "not cooling", "hvac", "compressor"]],
  ["Appliance Repair", ["fridge", "refrigerator", "dishwasher", "washer", "dryer", "oven"]],
];

export function structureJob(description: string): { title: string; category: string; urgency: string } {
  const t = ` ${description.toLowerCase()} `;
  const category = CATEGORY_WORDS.find(([, words]) => words.some((w) => t.includes(w)))?.[0] ?? "Handyman";
  const urgency = /(flood|burst|sparking|no power|no heat|emergency|asap)/.test(t) ? "emergency" : "flexible";
  return { title: `${category} — ${description.slice(0, 48)}`, category, urgency };
}

export const marketplaceRouter = Router();
marketplaceRouter.use(service("marketplace"), requireAuth);

marketplaceRouter.post(
  "/homes/:homeId/jobs",
  requireHomePermission("job:create", (req) => req.params.homeId),
  (req, res) => {
    const { description } = req.body ?? {};
    if (!description) throw new HttpError(400, "missing_description");
    const s = structureJob(description);
    const job = {
      id: uid("job"),
      homeId: req.params.homeId,
      createdBy: req.userId!,
      ...s,
      description,
      status: "open" as const,
      createdAt: now(),
    };
    db.data.jobs.push(job);
    db.persist();
    audit(req, "job.create", job.id);
    publish("job.created", { jobId: job.id, category: job.category, urgency: job.urgency });
    res.status(201).json(job);
  }
);

/* pro job feed: open jobs (filtered by the pro's professions when set) */
marketplaceRouter.get("/jobs/feed", (req, res) => {
  const me = db.data.users.find((u) => u.id === req.userId);
  if (me?.accountType !== "pro") throw new HttpError(403, "pros_only");
  const professions = me.proProfile?.professions ?? [];
  const open = db.data.jobs.filter((j) => j.status === "open");
  const matched = professions.length
    ? open.filter((j) => professions.some((p) => j.category.toLowerCase().includes(p.toLowerCase().replace("plumber", "plumbing"))))
    : open;
  res.json(matched.length ? matched : open);
});

marketplaceRouter.post("/jobs/:jobId/bids", (req, res) => {
  const me = db.data.users.find((u) => u.id === req.userId);
  if (me?.accountType !== "pro") throw new HttpError(403, "pros_only");
  const job = db.data.jobs.find((j) => j.id === req.params.jobId);
  if (!job || job.status !== "open") throw new HttpError(404, "job_not_open");
  const { price, etaLabel = "This week", warranty = "1 year" } = req.body ?? {};
  if (!price || price <= 0) throw new HttpError(400, "invalid_price");
  const bid = { id: uid("bid"), jobId: job.id, proUserId: me.id, price, etaLabel, warranty, createdAt: now() };
  db.data.bids.push(bid);
  db.persist();
  publish("bid.placed", { jobId: job.id, bidId: bid.id, userId: job.createdBy, price });
  res.status(201).json(bid);
});

marketplaceRouter.get("/jobs/:jobId/bids", (req, res) => {
  const job = db.data.jobs.find((j) => j.id === req.params.jobId);
  if (!job) throw new HttpError(404, "not_found");
  if (job.createdBy !== req.userId) throw new HttpError(403, "forbidden");
  res.json(db.data.bids.filter((b) => b.jobId === job.id));
});

marketplaceRouter.post("/bids/:bidId/accept", (req, res) => {
  const bid = db.data.bids.find((b) => b.id === req.params.bidId);
  if (!bid) throw new HttpError(404, "not_found");
  const job = db.data.jobs.find((j) => j.id === bid.jobId);
  if (!job || job.status !== "open") throw new HttpError(409, "job_not_open");
  if (job.createdBy !== req.userId) throw new HttpError(403, "forbidden");

  job.status = "accepted";
  job.acceptedBidId = bid.id;
  const payment = createHold(job.id, req.userId!, bid.proUserId, Math.round(bid.price * 100));
  db.persist();
  audit(req, "bid.accept", bid.id);
  publish("bid.accepted", { jobId: job.id, bidId: bid.id, proUserId: bid.proUserId, homeownerId: req.userId });
  res.json({ job, payment });
});

marketplaceRouter.post("/jobs/:jobId/complete", (req, res) => {
  const job = db.data.jobs.find((j) => j.id === req.params.jobId);
  if (!job) throw new HttpError(404, "not_found");
  if (job.createdBy !== req.userId) throw new HttpError(403, "forbidden");
  if (job.status !== "accepted") throw new HttpError(409, "not_in_progress");
  job.status = "completed";
  db.persist();
  publish("job.completed", { jobId: job.id });
  res.json(job);
});
