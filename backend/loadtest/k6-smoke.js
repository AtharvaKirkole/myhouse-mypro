/*
 * k6 load test — models the spec's target load:
 *   ~500 repair requests/min and steady auth/search traffic.
 * Run: k6 run backend/loadtest/k6-smoke.js  (BASE_URL defaults to localhost:4000)
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:4000";
const authLatency = new Trend("auth_latency_ms");
const searchLatency = new Trend("search_latency_ms");

export const options = {
  scenarios: {
    steady: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "1m", target: 200 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"], // <1% errors
    http_req_duration: ["p(95)<500"], // 95th percentile under 500ms
    auth_latency_ms: ["p(95)<400"],
  },
};

const PW = "Str0ng!Pass-2026";

export default function () {
  let token, homeId;

  group("signup + home", () => {
    const email = `load_${__VU}_${__ITER}_${Date.now()}@test.com`;
    const res = http.post(`${BASE}/api/auth/signup`, JSON.stringify({ email, password: PW, name: "Load" }), {
      headers: { "Content-Type": "application/json" },
    });
    authLatency.add(res.timings.duration);
    check(res, { "signup 201": (r) => r.status === 201 });
    token = res.json("access");

    const home = http.post(`${BASE}/api/users/homes`, JSON.stringify({ address: `${__VU}-${__ITER} Load St` }), {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    homeId = home.json("id");
  });

  group("repair request", () => {
    const job = http.post(
      `${BASE}/api/marketplace/homes/${homeId}/jobs`,
      JSON.stringify({ description: "water heater is leaking in the garage and needs replacement soon" }),
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } }
    );
    check(job, { "job 201": (r) => r.status === 201 });
  });

  group("search", () => {
    const res = http.get(`${BASE}/api/search?q=water`, { headers: { Authorization: `Bearer ${token}` } });
    searchLatency.add(res.timings.duration);
    check(res, { "search 200": (r) => r.status === 200 });
  });

  sleep(1);
}
