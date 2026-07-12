/* Post-deploy smoke test: boots the app on an ephemeral port and walks the
   happy path end-to-end. Exits non-zero on any failure — CI gates on this. */

process.env.DATA_DIR = process.env.DATA_DIR ?? "data-smoke";
process.env.RATE_LIMIT = "10000";

const { createApp } = await import("../src/gateway/app");
const { db } = await import("../src/db/store");
const { flushEvents } = await import("../src/core/events");

db.reset();
const app = createApp();
const server = app.listen(0);
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const health = await call("GET", "/health");
check("health", health.status === 200);

const signup = await call("POST", "/api/auth/signup", { email: "smoke@test.com", password: "password123", name: "Smoke" });
check("signup", signup.status === 201);
const token = signup.json.access as string;

const home = await call("POST", "/api/users/homes", { address: "99 Smoke St" }, token);
check("create home", home.status === 201);

const extract = await call("POST", "/api/ai/extract", { filenames: ["lg-tv-receipt.pdf"] }, token);
check("ai extraction", extract.status === 200 && extract.json.brand === "LG", `brand=${extract.json.brand} conf=${extract.json.confidence}`);

const asset = await call("POST", `/api/assets/homes/${home.json.id}/assets`, { name: extract.json.name, brand: extract.json.brand, model: extract.json.model }, token);
check("create asset", asset.status === 201);

const job = await call("POST", `/api/marketplace/homes/${home.json.id}/jobs`, { description: "burst pipe flooding the laundry" }, token);
check("structured job", job.status === 201 && job.json.category === "Plumbing" && job.json.urgency === "emergency", `${job.json.category}/${job.json.urgency}`);

const search = await call("GET", "/api/search?q=lg", undefined, token);
check("global search", search.status === 200 && search.json.hits.length > 0, `${search.json.hits.length} hits`);

await flushEvents();
const notifs = await call("GET", "/api/notifications", undefined, token);
check("notifications from events", notifs.status === 200 && notifs.json.length >= 2, `${notifs.json.length} notifications`);

server.close();
console.log(failures === 0 ? "\nSMOKE PASS" : `\nSMOKE FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
