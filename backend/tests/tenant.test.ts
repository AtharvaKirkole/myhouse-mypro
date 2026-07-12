/*
 * Tenant isolation: every house is a tenant. Cross-tenant reads/writes must
 * 404 (no existence oracle), ids are unguessable UUIDs, contractor access
 * expires, and server-side ownership is enforced on every endpoint.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.DATA_DIR = "data-t-tenant";
process.env.RATE_LIMIT = "10000";

const { createApp } = await import("../src/gateway/app");
const { db } = await import("../src/db/store");

const app = createApp();
const PW = "Str0ng!Pass-2026";

let alice = "";
let mallory = "";
let contractor = "";
let aliceHome = "";

before(async () => {
  db.reset();
  const a = await request(app).post("/api/auth/signup").send({ email: "alice@t.com", password: PW, name: "Alice" });
  alice = a.body.access;
  const m = await request(app).post("/api/auth/signup").send({ email: "mallory@t.com", password: PW, name: "Mallory" });
  mallory = m.body.access;
  const c = await request(app)
    .post("/api/auth/signup")
    .send({ email: "bob@contractor.com", password: PW, name: "Bob" });
  contractor = c.body.access;

  const home = await request(app)
    .post("/api/users/homes")
    .set("Authorization", `Bearer ${alice}`)
    .send({ address: "1 Alice Way" });
  aliceHome = home.body.id;
  await request(app)
    .post(`/api/assets/homes/${aliceHome}/assets`)
    .set("Authorization", `Bearer ${alice}`)
    .send({ name: "TV", brand: "LG" });
});

test("ids are UUID-based — no sequential guessing surface", () => {
  assert.match(aliceHome, /^home_[0-9a-f-]{36}$/);
});

test("cross-tenant read returns 404, not 403 (no existence oracle)", async () => {
  const r = await request(app).get(`/api/users/homes/${aliceHome}`).set("Authorization", `Bearer ${mallory}`);
  assert.equal(r.status, 404);
  const assets = await request(app)
    .get(`/api/assets/homes/${aliceHome}/assets`)
    .set("Authorization", `Bearer ${mallory}`);
  assert.equal(assets.status, 404);
});

test("cross-tenant write is rejected", async () => {
  const r = await request(app)
    .post(`/api/assets/homes/${aliceHome}/assets`)
    .set("Authorization", `Bearer ${mallory}`)
    .send({ name: "Backdoor" });
  assert.equal(r.status, 404);
  assert.equal(db.data.assets.filter((a) => a.name === "Backdoor").length, 0);
});

test("guessed/nonexistent home id looks identical to a forbidden one", async () => {
  const fake = await request(app)
    .get("/api/users/homes/home_00000000-0000-4000-8000-000000000000")
    .set("Authorization", `Bearer ${mallory}`);
  assert.equal(fake.status, 404);
});

test("client-supplied ownership is never trusted — membership is server-resolved", async () => {
  // Mallory lists her homes: Alice's home is not derivable from any endpoint
  const mine = await request(app).get("/api/users/homes").set("Authorization", `Bearer ${mallory}`);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.length, 0);
});

test("contractor gets scoped, temporary access that expires", async () => {
  const add = await request(app)
    .post(`/api/users/homes/${aliceHome}/members`)
    .set("Authorization", `Bearer ${alice}`)
    .send({ email: "bob@contractor.com", role: "contractor", expiresInDays: 3 });
  assert.equal(add.status, 201);
  assert.ok(add.body.expiresAt, "contractor membership carries an expiry");

  // scoped: can view jobs/assets…
  const view = await request(app)
    .get(`/api/assets/homes/${aliceHome}/assets`)
    .set("Authorization", `Bearer ${contractor}`);
  assert.equal(view.status, 200);

  // …but cannot create/delete anything
  const write = await request(app)
    .post(`/api/assets/homes/${aliceHome}/assets`)
    .set("Authorization", `Bearer ${contractor}`)
    .send({ name: "Sneaky" });
  assert.equal(write.status, 403);

  // expire the membership → access drops to 404 like any outsider
  const member = db.data.members.find((m) => m.homeId === aliceHome && m.role === "contractor")!;
  member.expiresAt = new Date(Date.now() - 1000).toISOString();
  const after = await request(app)
    .get(`/api/assets/homes/${aliceHome}/assets`)
    .set("Authorization", `Bearer ${contractor}`);
  assert.equal(after.status, 404);
});

test("search never leaks another tenant's records", async () => {
  const r = await request(app).get("/api/search?q=tv").set("Authorization", `Bearer ${mallory}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.hits.filter((h: { type: string }) => h.type === "asset").length, 0);
});

test("soft-deleted home disappears from every surface", async () => {
  const del = await request(app).delete(`/api/users/homes/${aliceHome}`).set("Authorization", `Bearer ${alice}`);
  assert.equal(del.status, 200);
  assert.equal(del.body.softDeleted, true);

  const list = await request(app).get("/api/users/homes").set("Authorization", `Bearer ${alice}`);
  assert.equal(list.body.length, 0);

  const get = await request(app).get(`/api/users/homes/${aliceHome}`).set("Authorization", `Bearer ${alice}`);
  assert.equal(get.status, 404);

  // data is retained for recovery (soft delete, not destruction)
  assert.ok(db.data.homes.find((h) => h.id === aliceHome)?.deletedAt);
});
