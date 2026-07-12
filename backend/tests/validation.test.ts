/*
 * Validation layer: schemas guard every endpoint; malformed input yields a
 * consistent 400 envelope with field-level details and no stack traces.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.DATA_DIR = "data-t-val";
process.env.RATE_LIMIT = "10000";

const { createApp } = await import("../src/gateway/app");
const { db } = await import("../src/db/store");

const app = createApp();
const PW = "Str0ng!Pass-2026";
let token = "";
let homeId = "";

before(async () => {
  db.reset();
  const s = await request(app).post("/api/auth/signup").send({ email: "val@t.com", password: PW, name: "Val" });
  token = s.body.access;
  const h = await request(app)
    .post("/api/users/homes")
    .set("Authorization", `Bearer ${token}`)
    .send({ address: "5 Valid Way" });
  homeId = h.body.id;
});

test("bad email → 400 with field details, no stack", async () => {
  const r = await request(app).post("/api/auth/signup").send({ email: "not-an-email", password: PW, name: "X" });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "validation_error");
  assert.ok(r.body.details.some((d: { path: string }) => d.path === "email"));
  assert.equal(r.body.stack, undefined);
  assert.ok(r.body.requestId);
});

test("job description too short → 400", async () => {
  const r = await request(app)
    .post(`/api/marketplace/homes/${homeId}/jobs`)
    .set("Authorization", `Bearer ${token}`)
    .send({ description: "help" });
  assert.equal(r.status, 400);
});

test("path traversal filename is rejected", async () => {
  const r = await request(app)
    .post(`/api/assets/homes/${homeId}/files`)
    .set("Authorization", `Bearer ${token}`)
    .send({ filename: "../../etc/passwd", kind: "receipt", bytes: 100 });
  assert.equal(r.status, 400);
});

test("disallowed mime type is rejected", async () => {
  const r = await request(app)
    .post(`/api/assets/homes/${homeId}/files`)
    .set("Authorization", `Bearer ${token}`)
    .send({ filename: "evil.exe", kind: "receipt", bytes: 100, mime: "application/x-msdownload" });
  assert.equal(r.status, 400);
});

test("oversize file metadata is rejected", async () => {
  const r = await request(app)
    .post(`/api/assets/homes/${homeId}/files`)
    .set("Authorization", `Bearer ${token}`)
    .send({ filename: "huge.jpg", kind: "product", bytes: 999 * 1024 * 1024 });
  assert.equal(r.status, 400);
});

test("empty search query → 400; over-long query → 400", async () => {
  const empty = await request(app).get("/api/search?q=").set("Authorization", `Bearer ${token}`);
  assert.equal(empty.status, 400);
  const long = await request(app)
    .get(`/api/search?q=${"a".repeat(200)}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(long.status, 400);
});

test("invalid bid price → 400; negative refund → 400", async () => {
  const bid = await request(app)
    .post("/api/marketplace/jobs/job_00000000-0000-4000-8000-000000000000/bids")
    .set("Authorization", `Bearer ${token}`)
    .send({ price: -5 });
  assert.equal(bid.status, 400);
});

test("unknown route → consistent 404 envelope", async () => {
  const r = await request(app).get("/api/does-not-exist").set("Authorization", `Bearer ${token}`);
  assert.equal(r.status, 404);
  assert.equal(r.body.error, "route_not_found");
});

test("AI extract validates filenames array", async () => {
  const none = await request(app)
    .post("/api/ai/extract")
    .set("Authorization", `Bearer ${token}`)
    .send({ filenames: [] });
  assert.equal(none.status, 400);
  const traversal = await request(app)
    .post("/api/ai/extract")
    .set("Authorization", `Bearer ${token}`)
    .send({ filenames: ["../secrets.txt"] });
  assert.equal(traversal.status, 400);
});
