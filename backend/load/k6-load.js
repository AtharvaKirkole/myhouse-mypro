/*
 * k6 load test — run: k6 run backend/load/k6-load.js
 * Models the spec's target: 10k concurrent users, ~1000 image-upload
 * registrations/min and ~500 repair requests/min at peak.
 */

import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:4000";

export const options = {
  scenarios: {
    browsing: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 200 },
        { duration: "3m", target: 10000 },
        { duration: "1m", target: 0 },
      ],
      exec: "browse",
    },
    uploads: {
      executor: "constant-arrival-rate",
      rate: 1000,
      timeUnit: "1m",
      duration: "3m",
      preAllocatedVUs: 200,
      exec: "uploadAsset",
    },
    repairs: {
      executor: "constant-arrival-rate",
      rate: 500,
      timeUnit: "1m",
      duration: "3m",
      preAllocatedVUs: 100,
      exec: "requestRepair",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

export function setup() {
  const email = `k6_${Date.now()}@load.test`;
  const signup = http.post(
    `${BASE}/api/auth/signup`,
    JSON.stringify({ email, password: "password123", name: "K6 Load" }),
    { headers: { "Content-Type": "application/json" } }
  );
  const token = signup.json("access");
  const home = http.post(`${BASE}/api/users/homes`, JSON.stringify({ address: "1 Load Ln" }), {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  return { token, homeId: home.json("id") };
}

const auth = (token) => ({ headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });

export function browse(data) {
  const r = http.get(`${BASE}/api/search?q=lg`, auth(data.token));
  check(r, { "search 200": (res) => res.status === 200 });
  sleep(1);
}

export function uploadAsset(data) {
  const extract = http.post(`${BASE}/api/ai/extract`, JSON.stringify({ filenames: ["tv-receipt.pdf"] }), auth(data.token));
  check(extract, { "extract 200": (res) => res.status === 200 });
  const asset = http.post(
    `${BASE}/api/assets/homes/${data.homeId}/assets`,
    JSON.stringify({ name: "TV", brand: "LG", category: "Electronics" }),
    auth(data.token)
  );
  check(asset, { "asset 201": (res) => res.status === 201 });
}

export function requestRepair(data) {
  const r = http.post(
    `${BASE}/api/marketplace/homes/${data.homeId}/jobs`,
    JSON.stringify({ description: "AC not cooling upstairs" }),
    auth(data.token)
  );
  check(r, { "job 201": (res) => res.status === 201 });
}
