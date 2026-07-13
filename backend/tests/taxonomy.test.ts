/*
 * Service taxonomy: the long tail of home services (gardeners, trash/scrap
 * collection, toilet cleaning, junk removal…) classifies correctly and routes
 * to the right professions — categories are data, not code.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.DATA_DIR = "data-t-taxonomy";
process.env.RATE_LIMIT = "10000";

const { createApp } = await import("../src/gateway/app");
const { db } = await import("../src/db/store");
const { structureJob } = await import("../src/services/marketplace");
const { TAXONOMY } = await import("../src/services/taxonomy");

const app = createApp();
const PW = "Str0ng!Pass-2026";
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

let owner = "";
let gardener = "";
let home = "";

before(async () => {
  db.reset();
  const o = await request(app).post("/api/auth/signup").send({ email: "o@t.com", password: PW, name: "Owner" });
  owner = o.body.access;
  const g = await request(app)
    .post("/api/auth/signup")
    .send({
      email: "g@t.com", password: PW, name: "Gia", accountType: "pro",
      proProfile: { business: "Gia's Gardens", professions: ["Gardener"], license: "-", insurance: "-", radiusMi: 15, baseCity: "Phoenix", emergency: false },
    });
  gardener = g.body.access;
  const h = await request(app).post("/api/users/homes").set(auth(owner)).send({ address: "9 Garden Way, Phoenix" });
  home = h.body.id;
});

test("long-tail services classify to their own categories", () => {
  const cases: [string, string][] = [
    ["The lawn needs mowing and the garden beds are full of weeds", "Gardening & Lawn Care"],
    ["Weekly trash and garbage bin pickup for two large bins", "Trash Collection"],
    ["Scrap metal pickup from my backyard please", "Scrap Collection"],
    ["Deep clean of both toilets and the bathroom grout", "Bathroom & Toilet Cleaning"],
    ["Old couch and mattress junk haul away this weekend", "Junk Removal"],
    ["Gutters are overflowing with debris", "Gutter Cleaning"],
    ["Pool has turned green and the hot tub filter is clogged", "Pool Care"],
    ["Scorpions and ants in the garage, need pest treatment", "Pest Control"],
    ["Pressure wash the driveway and patio", "Pressure Washing"],
    ["Locked out and want to rekey the deadbolt", "Locksmith"],
    ["Install a string lights holiday light display on the roofline", "Holiday Lighting"],
  ];
  for (const [description, expected] of cases) {
    assert.equal(structureJob(description).category, expected, `"${description}"`);
  }
});

test("trade meanings survive: clogged toilet is plumbing, toilet cleaning is cleaning", () => {
  assert.equal(structureJob("The toilet is clogged and the drain is backing up").category, "Plumbing");
  assert.equal(structureJob("Water heater is leaking in the garage, need replacement").category, "Plumbing");
  assert.equal(structureJob("Bosch dishwasher not draining, error code e24").category, "Appliance Repair");
});

test("every taxonomy category maps to at least one profession", () => {
  for (const c of TAXONOMY) {
    assert.ok(c.professions.length > 0, `${c.id} has professions`);
  }
});

test("GET /api/marketplace/categories returns the clustered taxonomy", async () => {
  const r = await request(app).get("/api/marketplace/categories").set(auth(owner));
  assert.equal(r.status, 200);
  const removal = r.body["Removal & Collection"].map((c: { id: string }) => c.id);
  assert.ok(removal.includes("Trash Collection") && removal.includes("Scrap Collection") && removal.includes("Junk Removal"));
  assert.ok(r.body.Cleaning.some((c: { id: string }) => c.id === "Bathroom & Toilet Cleaning"));
  assert.ok(r.body.Outdoor.some((c: { id: string }) => c.id === "Gardening & Lawn Care"));
});

test("job feed routes by taxonomy professions: gardener sees lawn work, not plumbing", async () => {
  await request(app)
    .post(`/api/marketplace/homes/${home}/jobs`)
    .set(auth(owner))
    .send({ description: "The lawn needs mowing and the hedge needs trimming badly" });
  await request(app)
    .post(`/api/marketplace/homes/${home}/jobs`)
    .set(auth(owner))
    .send({ description: "Kitchen faucet has a slow leak under the sink" });

  const feed = await request(app).get("/api/marketplace/jobs/feed").set(auth(gardener));
  assert.equal(feed.status, 200);
  assert.equal(feed.body.length, 1);
  assert.equal(feed.body[0].category, "Gardening & Lawn Care");
});
