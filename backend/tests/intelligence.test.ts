/*
 * Intelligence platform: knowledge graph, append-only histories, repair
 * learning, contractor profiles, matching, similarity, predictions,
 * recommendations — and the privacy/tenancy guarantees wrapped around them.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.DATA_DIR = "data-t-intel";
process.env.RATE_LIMIT = "10000";
process.env.INTEL_MIN_COHORT = "2";

const { createApp } = await import("../src/gateway/app");
const { db, uid, now } = await import("../src/db/store");
const { flushEvents } = await import("../src/core/events");

const app = createApp();
const PW = "Str0ng!Pass-2026";

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

let alice = "", bella = "", cara = "", mallory = "", childTok = "", dave = "";
let h1 = "", h2 = "", h3 = "";
let a1 = "", a3 = "";
let caraJob = "", aliceJob = "";

async function signup(email: string, name: string, pro = false) {
  const r = await request(app)
    .post("/api/auth/signup")
    .send({
      email, password: PW, name,
      ...(pro
        ? {
            accountType: "pro",
            proProfile: {
              business: `${name} Repair Co.`, professions: ["Appliance Repair"], license: "ROC-1",
              insurance: "GL-2M", radiusMi: 20, baseCity: "Phoenix", emergency: true,
            },
          }
        : {}),
    });
  return r.body.access as string;
}

async function makeHome(token: string, address: string) {
  const r = await request(app).post("/api/users/homes").set(auth(token)).send({ address });
  return r.body.id as string;
}

async function makeDishwasher(token: string, homeId: string) {
  const r = await request(app).post(`/api/assets/homes/${homeId}/assets`).set(auth(token)).send({
    name: "Dishwasher", category: "Appliances", brand: "Bosch", model: "SHE53C85N",
    serial: "BSH-1", purchased: "2018-05-10", room: "Kitchen",
  });
  return r.body.id as string;
}

/** full marketplace loop: job → bid → accept → complete with repair capture */
async function repairLoop(ownerTok: string, homeId: string, assetId: string, proTok: string) {
  const job = await request(app)
    .post(`/api/marketplace/homes/${homeId}/jobs`)
    .set(auth(ownerTok))
    .send({ description: "Bosch dishwasher not draining, error code e24 and standing water" });
  const bid = await request(app)
    .post(`/api/marketplace/jobs/${job.body.id}/bids`)
    .set(auth(proTok))
    .send({ price: 210 });
  await request(app).post(`/api/marketplace/bids/${bid.body.id}/accept`).set(auth(ownerTok)).send({});
  const done = await request(app)
    .post(`/api/marketplace/jobs/${job.body.id}/complete`)
    .set(auth(ownerTok))
    .send({
      assetId, rootCause: "drain pump failure", partsReplaced: ["drain pump"],
      laborMinutes: 75, costCents: 21000, rating: 5, warrantyCovered: false, zip: "85018",
      notes: "call me at 602-555-0134 or alice@example.com if it recurs",
    });
  assert.equal(done.status, 200);
  return job.body.id as string;
}

before(async () => {
  db.reset();
  alice = await signup("alice@i.com", "Alice");
  bella = await signup("bella@i.com", "Bella");
  cara = await signup("cara@i.com", "Cara");
  mallory = await signup("mallory@i.com", "Mallory");
  childTok = await signup("kid@i.com", "Kid");
  dave = await signup("dave@pro.com", "Dave", true);

  h1 = await makeHome(alice, "1 First St, Phoenix");
  h2 = await makeHome(bella, "2 Second St, Phoenix");
  h3 = await makeHome(cara, "3 Third St, Phoenix");

  a1 = await makeDishwasher(alice, h1);
  const a2 = await makeDishwasher(bella, h2);
  a3 = await makeDishwasher(cara, h3);

  // two completed repairs across two different homes → cohort of 2 for Bosch
  aliceJob = await repairLoop(alice, h1, a1, dave);
  await repairLoop(bella, h2, a2, dave);

  // cara's identical issue stays OPEN — used by matching + similarity
  const j = await request(app)
    .post(`/api/marketplace/homes/${h3}/jobs`)
    .set(auth(cara))
    .send({ description: "Bosch dishwasher not draining, error code e24 water at the bottom" });
  caraJob = j.body.id;

  // child member of h1 — has home access, but no intel permission
  await request(app)
    .post(`/api/users/homes/${h1}/members`)
    .set(auth(alice))
    .send({ email: "kid@i.com", role: "child" });

  await flushEvents();
});

test("asset creation projects into the knowledge graph with global dedupe", async () => {
  const g = await request(app).get(`/api/intel/homes/${h1}/graph`).set(auth(alice));
  assert.equal(g.status, 200);
  const types = new Set(g.body.nodes.map((n: { type: string }) => n.type));
  assert.ok(types.has("House") && types.has("Asset") && types.has("Manufacturer") && types.has("ModelNode"));
  assert.ok(g.body.edges.some((e: { rel: string }) => e.rel === "HAS_ASSET"));
  assert.ok(g.body.edges.some((e: { rel: string }) => e.rel === "INSTANCE_OF"));
  // Manufacturer "bosch" is ONE global node shared by all three homes
  const mfrs = db.data.graphNodes.filter((n) => n.type === "Manufacturer" && n.key === "manufacturer:bosch");
  assert.equal(mfrs.length, 1);
  assert.equal(mfrs[0].homeId, null);
});

test("asset history is append-only: moves accumulate with before/after", async () => {
  await request(app).patch(`/api/assets/homes/${h1}/assets/${a1}/position`).set(auth(alice)).send({ x: 100, y: 100 });
  await request(app).patch(`/api/assets/homes/${h1}/assets/${a1}/position`).set(auth(alice)).send({ x: 200, y: 150 });
  const r = await request(app).get(`/api/assets/homes/${h1}/assets/${a1}/history`).set(auth(alice));
  assert.equal(r.status, 200);
  const kinds = r.body.events.map((e: { kind: string }) => e.kind);
  assert.ok(kinds.includes("created"), "creation event survives");
  assert.equal(kinds.filter((k: string) => k === "moved").length, 2, "both moves recorded, nothing overwritten");
  const moved = r.body.events.find((e: { kind: string }) => e.kind === "moved");
  assert.ok(moved.before && moved.after, "history entries carry before/after");
  assert.ok(kinds.includes("repaired"), "completed repair appears in asset history");
});

test("completed repairs build structured records with PII scrubbed from notes", () => {
  assert.equal(db.data.repairRecords.length, 2);
  const rec = db.data.repairRecords[0];
  assert.equal(rec.issueCategory, "Appliance Repair");
  assert.equal(rec.rootCause, "drain pump failure");
  assert.deepEqual(rec.partsReplaced, ["drain pump"]);
  assert.equal(rec.brand, "Bosch");
  assert.ok(rec.notes?.includes("[phone]") && rec.notes?.includes("[email]"), "phone + email scrubbed");
  assert.ok(!rec.notes?.includes("602-555"), "raw phone never stored");
});

test("contractor expertise profile learns from every repair", async () => {
  const r = await request(app).get("/api/intel/contractors/me/profile").set(auth(dave));
  assert.equal(r.status, 200);
  assert.equal(r.body.jobsCompleted, 2);
  assert.equal(r.body.brands.Bosch, 2);
  assert.equal(r.body.models.SHE53C85N, 2);
  assert.equal(r.body.avgRating, 5);
  assert.ok(r.body.quoteAccuracy && r.body.quoteAccuracy > 0.9, "bid 21000c vs cost 21000c → near-perfect quote accuracy");
  assert.ok(r.body.skillConfidence > 0, "confidence grows with evidence");
});

test("matching engine ranks model experience above a blank profile, with explainable factors", async () => {
  // a second pro with zero history — should rank below Dave
  await signup("evan@pro.com", "Evan", true);
  const r = await request(app).get(`/api/intel/jobs/${caraJob}/matches`).set(auth(cara));
  assert.equal(r.status, 200);
  const [top] = r.body.matches;
  const daveUser = db.data.users.find((u) => u.email === "dave@pro.com")!;
  assert.equal(top.contractorId, daveUser.id, "experienced contractor wins");
  const modelFactor = top.factors.find((f: { name: string }) => f.name === "model_experience");
  assert.ok(modelFactor.evidence.includes("SHE53C85N"), "match is explainable");
  assert.ok(top.score > r.body.matches[1].score);
});

test("similarity engine returns k-anonymized aggregates, never other homes' rows", async () => {
  const r = await request(app).get(`/api/intel/jobs/${caraJob}/similar`).set(auth(cara));
  assert.equal(r.status, 200);
  assert.equal(r.body.sufficientData, true);
  assert.equal(r.body.aggregates.avgRepairCostCents, 21000);
  assert.equal(r.body.aggregates.topRootCauses[0].key, "drain pump failure");
  assert.ok(r.body.aggregates.recommendedContractor.business.includes("Dave"));
  // no cross-home job rows in the response — own-home list is empty for cara
  assert.equal(r.body.ownHomeMatches.length, 0);
  assert.ok(!JSON.stringify(r.body).includes(h1), "other tenants' home ids never appear");
});

test("model reliability publishes only above the k-anonymity floor", async () => {
  const ok = await request(app).get("/api/intel/reliability/model?brand=Bosch&model=SHE53C85N").set(auth(alice));
  assert.equal(ok.body.sufficientData, true);
  assert.equal(ok.body.cohort, 2);
  assert.equal(ok.body.commonRootCauses[0].key, "drain pump failure");

  // a brand with a single-home cohort must NOT publish statistics
  db.data.repairRecords.push({
    id: uid("rep"), jobId: uid("job"), homeId: h1, contractorId: "x", assetId: null,
    brand: "LG", model: "LRFVS3006S", issueCategory: "Appliance Repair", partsReplaced: [],
    laborMinutes: 60, costCents: 30000, warrantyCovered: false, season: "summer", createdAt: now(),
  });
  const small = await request(app).get("/api/intel/reliability/model?brand=LG").set(auth(alice));
  assert.equal(small.body.sufficientData, false);
  assert.equal(small.body.avgRepairCostCents, undefined, "no stats leak below the cohort floor");

  const region = await request(app).get("/api/intel/analytics/issues-by-region").set(auth(alice));
  assert.ok(region.body.some((row: { region: string }) => row.region === "850xx"), "ZIPs published as 3-digit regions only");
});

test("tenant isolation: outsiders get 404 on every intel surface", async () => {
  const g = await request(app).get(`/api/intel/homes/${h1}/graph`).set(auth(mallory));
  assert.equal(g.status, 404);
  const p = await request(app).get(`/api/intel/homes/${h1}/predictions`).set(auth(mallory));
  assert.equal(p.status, 404);
  const m = await request(app).get(`/api/intel/jobs/${aliceJob}/matches`).set(auth(mallory));
  assert.equal(m.status, 404);
});

test("RBAC: a child member has home access but no intel permission (403, not 404)", async () => {
  const r = await request(app).get(`/api/intel/homes/${h1}/predictions`).set(auth(childTok));
  assert.equal(r.status, 403);
});

test("predictive engine: aging assets rank first and cross the replace threshold", async () => {
  await request(app).post(`/api/assets/homes/${h1}/assets`).set(auth(alice)).send({
    name: "Water Heater", category: "Plumbing", brand: "Rheem", model: "XG50", purchased: "2010-06-01",
  });
  await request(app).post(`/api/assets/homes/${h1}/assets`).set(auth(alice)).send({
    name: "New Fridge", category: "Appliances", brand: "LG", model: "LRFVS3006S", purchased: "2025-01-01",
  });
  const r = await request(app).get(`/api/intel/homes/${h1}/predictions`).set(auth(alice));
  assert.equal(r.status, 200);
  assert.equal(r.body[0].name, "Water Heater", "highest risk first");
  assert.equal(r.body[0].recommendation, "replace");
  const fridge = r.body.find((p: { name: string }) => p.name === "New Fridge");
  assert.ok(r.body[0].failureProbability12mo > fridge.failureProbability12mo);
  assert.ok(r.body[0].reasons.length > 0, "predictions are explainable");
});

test("recommendation engine: recalls and expiring warranties surface proactively", async () => {
  await request(app).post(`/api/assets/homes/${h1}/assets`).set(auth(alice)).send({
    name: "Washer", category: "Appliances", brand: "Samsung", model: "WF45T6000AW", purchased: "2020-07-01",
  });
  db.data.warranties.push({
    id: uid("war"), homeId: h1, item: "Fridge extended warranty", provider: "LG",
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), source: "test",
    remindersSent: [], createdAt: now(),
  });
  const r = await request(app).get(`/api/intel/homes/${h1}/recommendations`).set(auth(alice));
  assert.equal(r.status, 200);
  const kinds = r.body.map((x: { kind: string }) => x.kind);
  assert.ok(kinds.includes("recall"), "recall matched by brand+model prefix");
  assert.ok(kinds.includes("warranty_claim"), "expiring warranty becomes a claim prompt");
  assert.equal(r.body[0].kind, "recall", "recalls always rank first");
});

test("immutable domain-event log: versioned schemas, PII-minimized payloads", () => {
  assert.ok(db.data.domainEvents.length >= 5, "events accumulate");
  const completed = db.data.domainEvents.find((e) => e.name === "job.completed");
  assert.ok(completed);
  assert.equal(completed.schemaVersion, 2);
  for (const e of db.data.domainEvents) {
    assert.ok(!("description" in e.payload), "free text never enters the training log");
    assert.ok(!("notes" in e.payload), "notes never enter the training log");
  }
});

test("AI diagnose pipeline: classification, entities, learned root causes, structured output", async () => {
  const r = await request(app)
    .post("/api/ai/diagnose")
    .set(auth(alice))
    .send({ description: "My Bosch dishwasher is not draining and shows error code e24", homeId: h1 });
  assert.equal(r.status, 200);
  assert.equal(r.body.schemaVersion, "diagnose/v1");
  assert.equal(r.body.category, "Appliance Repair");
  assert.equal(r.body.entities.brand, "Bosch");
  assert.ok(r.body.symptoms.includes("not draining"));
  assert.equal(r.body.probableRootCauses[0].cause, "drain pump failure");
  assert.ok(r.body.probableRootCauses[0].basis.includes("learned"), "root causes come from repair records");
  assert.ok(Array.isArray(r.body.recommendedContractors) && r.body.recommendedContractors.length > 0);

  // tenant guard: mallory cannot diagnose against alice's home context
  const denied = await request(app)
    .post("/api/ai/diagnose")
    .set(auth(mallory))
    .send({ description: "My Bosch dishwasher is not draining water everywhere", homeId: h1 });
  assert.equal(denied.status, 404);
});
