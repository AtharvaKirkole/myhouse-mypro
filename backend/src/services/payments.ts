/* Payment Service — double-entry style escrow ledger.
   Stripe/PayPal/Apple/Google adapters sit behind createHold/release/refund;
   the LEDGER is the source of truth, rows are projections of it. */

import { Router } from "express";
import { service, idempotency } from "../core/http";
import { ConflictError, NotFoundError, PaymentError } from "../core/errors";
import { publish } from "../core/events";
import { audit, requireAuth } from "./auth";
import { validate, RefundSchema } from "../core/validate";
import { db, now, touch, uid, type PaymentRow } from "../db/store";

function ledger(paymentId: string, type: "hold" | "release" | "refund", amountCents: number, requestId: string) {
  db.data.ledger.push({ id: uid("led"), paymentId, type, amountCents, ts: now(), requestId });
}

export function createHold(
  jobId: string,
  payerUserId: string,
  payeeUserId: string,
  amountCents: number,
  requestId = "-"
): PaymentRow {
  if (amountCents <= 0) throw new PaymentError("invalid_amount");
  const p: PaymentRow = {
    id: uid("pay"),
    jobId,
    payerUserId,
    payeeUserId,
    amountCents,
    refundedCents: 0,
    status: "held",
    createdAt: now(),
    updatedAt: now(),
    version: 1,
  };
  db.data.payments.push(p);
  ledger(p.id, "hold", amountCents, requestId);
  db.persist();
  return p;
}

export const paymentsRouter = Router();
paymentsRouter.use(service("payments"), requireAuth);

paymentsRouter.post("/:paymentId/release", idempotency, (req, res) => {
  const p = db.data.payments.find((x) => x.id === req.params.paymentId);
  if (!p || p.payerUserId !== req.userId) throw new NotFoundError(); // tenant isolation: no existence oracle
  if (p.status !== "held") throw new ConflictError("not_held");
  db.withTx(() => {
    touch(p);
    p.status = "released";
    ledger(p.id, "release", p.amountCents, req.requestId);
  });
  audit(req, "payment.release", p.id, { after: { amountCents: p.amountCents } });
  publish("payment.released", { paymentId: p.id, payeeUserId: p.payeeUserId, amountCents: p.amountCents });
  res.json(p);
});

/* full or partial refund of held funds */
paymentsRouter.post("/:paymentId/refund", validate(RefundSchema), idempotency, (req, res) => {
  const p = db.data.payments.find((x) => x.id === req.params.paymentId);
  if (!p || p.payerUserId !== req.userId) throw new NotFoundError();
  if (p.status !== "held" && p.status !== "partially_refunded") throw new ConflictError("not_refundable");

  const remaining = p.amountCents - (p.refundedCents ?? 0);
  const amount = req.body.amountCents ?? remaining;
  if (amount > remaining) throw new PaymentError("refund_exceeds_held", `only ${remaining} cents remain in escrow`);

  db.withTx(() => {
    touch(p);
    const refundedTotal = (p.refundedCents ?? 0) + amount;
    p.refundedCents = refundedTotal;
    p.status = refundedTotal >= p.amountCents ? "refunded" : "partially_refunded";
    ledger(p.id, "refund", amount, req.requestId);
  });
  audit(req, "payment.refund", p.id, { after: { amountCents: amount, status: p.status } });
  res.json(p);
});

paymentsRouter.get("/ledger", (req, res) => {
  const mine = db.data.payments.filter((p) => p.payerUserId === req.userId || p.payeeUserId === req.userId);
  const balanceCents = mine
    .filter((p) => p.status === "released" && p.payeeUserId === req.userId)
    .reduce((a, p) => a + p.amountCents, 0);
  const escrowCents = mine
    .filter((p) => p.status === "held" || p.status === "partially_refunded")
    .reduce((a, p) => a + p.amountCents - (p.refundedCents ?? 0), 0);
  res.json({ payments: mine, balanceCents, escrowCents });
});

/* reconciliation: every payment row must be derivable from its ledger entries */
paymentsRouter.get("/integrity", (req, res) => {
  const mine = db.data.payments.filter((p) => p.payerUserId === req.userId || p.payeeUserId === req.userId);
  const mismatches: { paymentId: string; problem: string }[] = [];
  for (const p of mine) {
    const entries = db.data.ledger.filter((l) => l.paymentId === p.id);
    const held = entries.filter((l) => l.type === "hold").reduce((a, l) => a + l.amountCents, 0);
    const released = entries.filter((l) => l.type === "release").reduce((a, l) => a + l.amountCents, 0);
    const refunded = entries.filter((l) => l.type === "refund").reduce((a, l) => a + l.amountCents, 0);
    if (held !== p.amountCents) mismatches.push({ paymentId: p.id, problem: "hold total != amount" });
    if (refunded !== (p.refundedCents ?? 0))
      mismatches.push({ paymentId: p.id, problem: "refund total != refundedCents" });
    if (p.status === "released" && released !== p.amountCents)
      mismatches.push({ paymentId: p.id, problem: "released without full release entry" });
    if (released + refunded > held) mismatches.push({ paymentId: p.id, problem: "outflow exceeds hold" });
  }
  res.json({ ok: mismatches.length === 0, checked: mine.length, mismatches });
});
