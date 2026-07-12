/* Payment Service — escrow ledger. Stripe Connect in production; ledger shape is identical. */

import { Router } from "express";
import { HttpError, service } from "../core/http";
import { publish } from "../core/events";
import { requireAuth } from "./auth";
import { db, now, uid, type PaymentRow } from "../db/store";

export function createHold(jobId: string, payerUserId: string, payeeUserId: string, amountCents: number): PaymentRow {
  const p: PaymentRow = {
    id: uid("pay"),
    jobId,
    payerUserId,
    payeeUserId,
    amountCents,
    status: "held",
    createdAt: now(),
    updatedAt: now(),
  };
  db.data.payments.push(p);
  db.persist();
  return p;
}

export const paymentsRouter = Router();
paymentsRouter.use(service("payments"), requireAuth);

paymentsRouter.post("/:paymentId/release", (req, res) => {
  const p = db.data.payments.find((x) => x.id === req.params.paymentId);
  if (!p) throw new HttpError(404, "not_found");
  if (p.payerUserId !== req.userId) throw new HttpError(403, "only_payer_releases");
  if (p.status !== "held") throw new HttpError(409, "not_held");
  p.status = "released";
  p.updatedAt = now();
  db.persist();
  publish("payment.released", { paymentId: p.id, payeeUserId: p.payeeUserId, amountCents: p.amountCents });
  res.json(p);
});

paymentsRouter.post("/:paymentId/refund", (req, res) => {
  const p = db.data.payments.find((x) => x.id === req.params.paymentId);
  if (!p) throw new HttpError(404, "not_found");
  if (p.payerUserId !== req.userId) throw new HttpError(403, "only_payer_refunds");
  if (p.status !== "held") throw new HttpError(409, "not_held");
  p.status = "refunded";
  p.updatedAt = now();
  db.persist();
  res.json(p);
});

paymentsRouter.get("/ledger", (req, res) => {
  const mine = db.data.payments.filter((p) => p.payerUserId === req.userId || p.payeeUserId === req.userId);
  const balanceCents = mine
    .filter((p) => p.status === "released" && p.payeeUserId === req.userId)
    .reduce((a, p) => a + p.amountCents, 0);
  const escrowCents = mine.filter((p) => p.status === "held").reduce((a, p) => a + p.amountCents, 0);
  res.json({ payments: mine, balanceCents, escrowCents });
});
