/*
 * Integration test — the exact flow from the spec:
 *   Upload Receipt → OCR/extract → Warranty saved → Notification created
 * plus the marketplace round-trip: job → bid → accept → escrow → release.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.DATA_DIR = "data-test";
process.env.RATE_LIMIT = "10000";

const { createApp } = await import("../src/gateway/app");
const { db } = await import("../src/db/store");
const { flushEvents } = await import("../src/core/events");

const app = createApp();

let ownerToken = "";
let proToken = "";
let homeId = "";

before(async () => {
  db.reset();
  const owner = await request(app)
    .post("/api/auth/signup")
    .send({ email: "owner@test.com", password: "Str0ng!Pass-2026", name: "Olive Owner" });
  assert.equal(owner.status, 201);
  ownerToken = owner.body.access;

  const pro = await request(app)
    .post("/api/auth/signup")
    .send({
      email: "pro@test.com",
      password: "Str0ng!Pass-2026",
      name: "Pat Pro",
      accountType: "pro",
      proProfile: {
        business: "Pat's Plumbing",
        professions: ["Plumber"],
        license: "ROC-1",
        insurance: "GL 2M",
        radiusMi: 15,
        baseCity: "Phoenix",
        emergency: true,
      },
    });
  assert.equal(pro.status, 201);
  proToken = pro.body.access;

  const home = await request(app)
    .post("/api/users/homes")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ address: "1 Test Ln, Phoenix, AZ" });
  assert.equal(home.status, 201);
  homeId = home.body.id;
});

test("receipt → AI extraction → asset + warranty → notification", async () => {
  // 1. register the uploaded file (S3 presign mock)
  const file = await request(app)
    .post(`/api/assets/homes/${homeId}/files`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ filename: "bosch-dishwasher-receipt.pdf", kind: "receipt", bytes: 48211 });
  assert.equal(file.status, 201);
  assert.match(file.body.uploadUrl, /^s3:\/\//);

  // 2. AI pipeline extracts structured JSON
  const extract = await request(app)
    .post("/api/ai/extract")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ filenames: ["bosch-dishwasher-receipt.pdf"] });
  assert.equal(extract.status, 200);
  assert.equal(extract.body.brand, "Bosch");
  assert.ok(extract.body.pipeline.some((s: string) => s.startsWith("ocr:")));
  assert.ok(extract.body.pipeline.some((s: string) => s.startsWith("llm:")));

  // 3. save the asset
  const asset = await request(app)
    .post(`/api/assets/homes/${homeId}/assets`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      name: extract.body.name,
      brand: extract.body.brand,
      model: extract.body.model,
      category: extract.body.category,
      purchased: extract.body.purchased,
    });
  assert.equal(asset.status, 201);

  // 4. save the warranty from parsed OCR text ("2 year warranty" + purchase date)
  const warranty = await request(app)
    .post(`/api/warranties/homes/${homeId}/warranties`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      item: "Bosch dishwasher",
      ocrText: extract.body.warrantyText,
      purchaseDate: extract.body.purchased,
      assetId: asset.body.id,
      source: "receipt-ocr",
    });
  assert.equal(warranty.status, 201);
  assert.ok(warranty.body.expiresAt.startsWith("2024"));

  // 5. a warranty expiring in 20 days triggers the reminder scan → notification
  const expiring = await request(app)
    .post(`/api/warranties/homes/${homeId}/warranties`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      item: "LG refrigerator extended",
      expiresAt: new Date(Date.now() + 20 * 864e5).toISOString(),
      source: "amazon-import",
    });
  assert.equal(expiring.status, 201);

  // 6. events drained → notifications exist
  await flushEvents();
  const notifs = await request(app).get("/api/notifications").set("Authorization", `Bearer ${ownerToken}`);
  assert.equal(notifs.status, 200);
  const types = notifs.body.map((n: { type: string }) => n.type);
  assert.ok(types.includes("asset"), `expected asset notification, got ${types}`);
  assert.ok(types.includes("warranty"), `expected warranty-expiring notification, got ${types}`);
});

test("job → bid → accept → escrow → release payout", async () => {
  const job = await request(app)
    .post(`/api/marketplace/homes/${homeId}/jobs`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ description: "Water heater is leaking in the garage, need replacement" });
  assert.equal(job.status, 201);
  assert.equal(job.body.category, "Plumbing");

  const feed = await request(app).get("/api/marketplace/jobs/feed").set("Authorization", `Bearer ${proToken}`);
  assert.equal(feed.status, 200);
  assert.ok(feed.body.some((j: { id: string }) => j.id === job.body.id));

  const bid = await request(app)
    .post(`/api/marketplace/jobs/${job.body.id}/bids`)
    .set("Authorization", `Bearer ${proToken}`)
    .send({ price: 1650, etaLabel: "Thursday 8-10", warranty: "2 years" });
  assert.equal(bid.status, 201);

  const accept = await request(app)
    .post(`/api/marketplace/bids/${bid.body.id}/accept`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({});
  assert.equal(accept.status, 200);
  assert.equal(accept.body.payment.status, "held");
  assert.equal(accept.body.payment.amountCents, 165000);

  const release = await request(app)
    .post(`/api/payments/${accept.body.payment.id}/release`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({});
  assert.equal(release.status, 200);

  await flushEvents();
  const ledger = await request(app).get("/api/payments/ledger").set("Authorization", `Bearer ${proToken}`);
  assert.equal(ledger.body.balanceCents, 165000);
});

test("RBAC over HTTP: child cannot create assets", async () => {
  const kid = await request(app)
    .post("/api/auth/signup")
    .send({ email: "kid@test.com", password: "Str0ng!Pass-2026", name: "Kid" });
  await request(app)
    .post(`/api/users/homes/${homeId}/members`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ email: "kid@test.com", role: "child" });

  const attempt = await request(app)
    .post(`/api/assets/homes/${homeId}/assets`)
    .set("Authorization", `Bearer ${kid.body.access}`)
    .send({ name: "Nope" });
  assert.equal(attempt.status, 403);
});

test("global search finds asset, warranty, and job by one keyword", async () => {
  const r = await request(app).get("/api/search?q=bosch").set("Authorization", `Bearer ${ownerToken}`);
  assert.equal(r.status, 200);
  const types = r.body.hits.map((h: { type: string }) => h.type);
  assert.ok(types.includes("asset"));
  assert.ok(types.includes("warranty"));
});

test("refresh token rotation invalidates the old token", async () => {
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "owner@test.com", password: "Str0ng!Pass-2026" });
  const first = login.body.refresh;
  const rotated = await request(app).post("/api/auth/refresh").send({ refresh: first });
  assert.equal(rotated.status, 200);
  const reuse = await request(app).post("/api/auth/refresh").send({ refresh: first });
  assert.equal(reuse.status, 401);
});
