/*
 * Payments: escrow lifecycle, partial refunds, idempotency keys,
 * optimistic locking, and ledger integrity (reconciliation).
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.DATA_DIR = "data-t-pay";
process.env.RATE_LIMIT = "10000";

const { createApp } = await import("../src/gateway/app");
const { db } = await import("../src/db/store");

const app = createApp();
const PW = "Str0ng!Pass-2026";

let owner = "";
let pro = "";
let homeId = "";

before(async () => {
  db.reset();
  const o = await request(app).post("/api/auth/signup").send({ email: "o@p.com", password: PW, name: "Owner" });
  owner = o.body.access;
  const p = await request(app)
    .post("/api/auth/signup")
    .send({
      email: "p@p.com",
      password: PW,
      name: "Pro",
      accountType: "pro",
      proProfile: {
        business: "P Co",
        professions: ["Plumber"],
        license: "L1",
        insurance: "I1",
        radiusMi: 10,
        baseCity: "PHX",
        emergency: true,
      },
    });
  pro = p.body.access;
  const h = await request(app)
    .post("/api/users/homes")
    .set("Authorization", `Bearer ${owner}`)
    .send({ address: "9 Pay St" });
  homeId = h.body.id;
});

async function bookJob(desc: string) {
  const job = await request(app)
    .post(`/api/marketplace/homes/${homeId}/jobs`)
    .set("Authorization", `Bearer ${owner}`)
    .send({ description: desc });
  assert.equal(job.status, 201);
  const bid = await request(app)
    .post(`/api/marketplace/jobs/${job.body.id}/bids`)
    .set("Authorization", `Bearer ${pro}`)
    .send({ price: 1000 });
  assert.equal(bid.status, 201);
  const accept = await request(app)
    .post(`/api/marketplace/bids/${bid.body.id}/accept`)
    .set("Authorization", `Bearer ${owner}`)
    .send({});
  assert.equal(accept.status, 200);
  return {
    jobId: job.body.id as string,
    paymentId: accept.body.payment.id as string,
    jobVersion: accept.body.job.version as number,
  };
}

test("partial then full refund; ledger reconciliation stays clean", async () => {
  const { paymentId } = await bookJob("dishwasher drain pump is dead, needs a part swap");

  const part = await request(app)
    .post(`/api/payments/${paymentId}/refund`)
    .set("Authorization", `Bearer ${owner}`)
    .send({ amountCents: 40000 });
  assert.equal(part.status, 200);
  assert.equal(part.body.status, "partially_refunded");
  assert.equal(part.body.refundedCents, 40000);

  const rest = await request(app)
    .post(`/api/payments/${paymentId}/refund`)
    .set("Authorization", `Bearer ${owner}`)
    .send({});
  assert.equal(rest.status, 200);
  assert.equal(rest.body.status, "refunded");
  assert.equal(rest.body.refundedCents, 100000);

  // over-refund is impossible
  const over = await request(app)
    .post(`/api/payments/${paymentId}/refund`)
    .set("Authorization", `Bearer ${owner}`)
    .send({ amountCents: 1 });
  assert.equal(over.status, 409);

  const integ = await request(app).get("/api/payments/integrity").set("Authorization", `Bearer ${owner}`);
  assert.equal(integ.status, 200);
  assert.equal(integ.body.ok, true, JSON.stringify(integ.body.mismatches));
});

test("idempotency key replays the response instead of double-executing", async () => {
  const { paymentId } = await bookJob("bathroom faucet leaking under the sink cabinet");

  const first = await request(app)
    .post(`/api/payments/${paymentId}/release`)
    .set("Authorization", `Bearer ${owner}`)
    .set("Idempotency-Key", "rel-123")
    .send({});
  assert.equal(first.status, 200);

  const replay = await request(app)
    .post(`/api/payments/${paymentId}/release`)
    .set("Authorization", `Bearer ${owner}`)
    .set("Idempotency-Key", "rel-123")
    .send({});
  assert.equal(replay.status, 200);
  assert.equal(replay.headers["idempotency-replay"], "true");

  // exactly one release ledger entry despite two requests
  const entries = db.data.ledger.filter((l) => l.paymentId === paymentId && l.type === "release");
  assert.equal(entries.length, 1);

  // WITHOUT the key, the second release is a state conflict
  const dup = await request(app)
    .post(`/api/payments/${paymentId}/release`)
    .set("Authorization", `Bearer ${owner}`)
    .send({});
  assert.equal(dup.status, 409);
});

test("optimistic locking: stale job version cannot accept a bid", async () => {
  const job = await request(app)
    .post(`/api/marketplace/homes/${homeId}/jobs`)
    .set("Authorization", `Bearer ${owner}`)
    .send({ description: "outlet sparking in the garage near the panel" });
  const bid = await request(app)
    .post(`/api/marketplace/jobs/${job.body.id}/bids`)
    .set("Authorization", `Bearer ${pro}`)
    .send({ price: 300 });

  const stale = await request(app)
    .post(`/api/marketplace/bids/${bid.body.id}/accept`)
    .set("Authorization", `Bearer ${owner}`)
    .send({ jobVersion: 99 });
  assert.equal(stale.status, 409);

  // job is untouched (transaction rolled back), correct version succeeds
  const ok = await request(app)
    .post(`/api/marketplace/bids/${bid.body.id}/accept`)
    .set("Authorization", `Bearer ${owner}`)
    .send({ jobVersion: 1 });
  assert.equal(ok.status, 200);
});

test("state machine: completed job cannot be re-accepted; duplicate bids blocked", async () => {
  const { jobId } = await bookJob("washer is off balance and shakes the whole laundry room");
  const done = await request(app)
    .post(`/api/marketplace/jobs/${jobId}/complete`)
    .set("Authorization", `Bearer ${owner}`)
    .send({});
  assert.equal(done.status, 200);
  const again = await request(app)
    .post(`/api/marketplace/jobs/${jobId}/complete`)
    .set("Authorization", `Bearer ${owner}`)
    .send({});
  assert.equal(again.status, 409); // completed → completed is not a legal transition

  const job2 = await request(app)
    .post(`/api/marketplace/homes/${homeId}/jobs`)
    .set("Authorization", `Bearer ${owner}`)
    .send({ description: "fridge ice maker stopped producing ice cubes" });
  await request(app)
    .post(`/api/marketplace/jobs/${job2.body.id}/bids`)
    .set("Authorization", `Bearer ${pro}`)
    .send({ price: 200 });
  const dupBid = await request(app)
    .post(`/api/marketplace/jobs/${job2.body.id}/bids`)
    .set("Authorization", `Bearer ${pro}`)
    .send({ price: 180 });
  assert.equal(dupBid.status, 409);
});
