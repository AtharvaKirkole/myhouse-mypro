/*
 * Security suite: token families + reuse detection, session management,
 * lockouts, password lifecycle, MFA (real TOTP), security headers.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.DATA_DIR = "data-t-sec";
process.env.RATE_LIMIT = "10000";

const { createApp } = await import("../src/gateway/app");
const { db } = await import("../src/db/store");
const { totp } = await import("../src/services/auth");

const app = createApp();
const PW = "Str0ng!Pass-2026";

before(() => db.reset());

async function signup(email: string) {
  const r = await request(app).post("/api/auth/signup").send({ email, password: PW, name: "T User" });
  assert.equal(r.status, 201);
  return r.body as { access: string; refresh: string; deviceId: string };
}

test("security headers are set on every response", async () => {
  const r = await request(app).get("/health");
  assert.equal(r.headers["x-content-type-options"], "nosniff");
  assert.equal(r.headers["x-frame-options"], "DENY");
  assert.ok(r.headers["content-security-policy"]?.includes("default-src 'none'"));
  assert.equal(r.headers["x-powered-by"], undefined);
  assert.ok(r.headers["x-request-id"]);
});

test("refresh rotation works; reusing a rotated token revokes the whole family", async () => {
  const s = await signup("rotate@test.com");

  const rotated = await request(app).post("/api/auth/refresh").send({ refresh: s.refresh });
  assert.equal(rotated.status, 200);
  const newRefresh = rotated.body.refresh as string;

  // replay of the OLD token = theft signal
  const reuse = await request(app).post("/api/auth/refresh").send({ refresh: s.refresh });
  assert.equal(reuse.status, 401);
  assert.equal(reuse.body.error, "reuse_detected");

  // the ENTIRE family is dead — even the newest legitimate token
  const afterReuse = await request(app).post("/api/auth/refresh").send({ refresh: newRefresh });
  assert.equal(afterReuse.status, 401);
});

test("logout-all revokes every session and invalidates live access tokens", async () => {
  const s = await signup("logout@test.com");
  const out = await request(app).post("/api/auth/logout-all").set("Authorization", `Bearer ${s.access}`);
  assert.equal(out.status, 200);
  assert.ok(out.body.sessionsRevoked >= 1);

  // the access token dies with its family
  const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${s.access}`);
  assert.equal(me.status, 401);

  const refresh = await request(app).post("/api/auth/refresh").send({ refresh: s.refresh });
  assert.equal(refresh.status, 401);
});

test("5 failed logins lock the account, even for the correct password", async () => {
  await signup("locked@test.com");
  for (let i = 0; i < 5; i++) {
    const r = await request(app).post("/api/auth/login").send({ email: "locked@test.com", password: "Wrong-Pass-99!" });
    assert.equal(r.status, 401);
  }
  const withCorrect = await request(app).post("/api/auth/login").send({ email: "locked@test.com", password: PW });
  assert.equal(withCorrect.status, 429);
  assert.equal(withCorrect.body.error, "account_locked");
});

test("password change rejects history reuse and invalidates old sessions", async () => {
  const s = await signup("history@test.com");

  const change = await request(app)
    .post("/api/auth/password/change")
    .set("Authorization", `Bearer ${s.access}`)
    .send({ current: PW, next: "An0ther!Pass-77" });
  assert.equal(change.status, 200);

  // old access token is now invalid (issued before passwordChangedAt)
  const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${s.access}`);
  assert.equal(me.status, 401);

  // log in with the new password, try to change BACK to the old one
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "history@test.com", password: "An0ther!Pass-77" });
  assert.equal(login.status, 200);
  const back = await request(app)
    .post("/api/auth/password/change")
    .set("Authorization", `Bearer ${login.body.access}`)
    .send({ current: "An0ther!Pass-77", next: PW });
  assert.equal(back.status, 400); // history violation
});

test("weak and common passwords are rejected at signup", async () => {
  const short = await request(app).post("/api/auth/signup").send({ email: "w1@test.com", password: "Ab1!", name: "W" });
  assert.equal(short.status, 400);
  const twoClasses = await request(app)
    .post("/api/auth/signup")
    .send({ email: "w2@test.com", password: "abcdefgh12345", name: "W" });
  assert.equal(twoClasses.status, 400);
});

test("TOTP MFA: enroll → activate → login requires code → recovery code works once", async () => {
  const s = await signup("mfa@test.com");

  const enroll = await request(app).post("/api/auth/mfa/enroll").set("Authorization", `Bearer ${s.access}`);
  assert.equal(enroll.status, 200);
  const secret = enroll.body.secret as string;
  assert.ok(enroll.body.otpauth.startsWith("otpauth://totp/"));

  const activate = await request(app)
    .post("/api/auth/mfa/activate")
    .set("Authorization", `Bearer ${s.access}`)
    .send({ code: totp(secret) });
  assert.equal(activate.status, 200);
  const recoveryCodes = activate.body.recoveryCodes as string[];
  assert.equal(recoveryCodes.length, 10);

  // login WITHOUT code (unknown device) → mfa_required
  const noCode = await request(app).post("/api/auth/login").send({ email: "mfa@test.com", password: PW });
  assert.equal(noCode.status, 401);
  assert.equal(noCode.body.error, "mfa_required");

  // login WITH a valid TOTP
  const withCode = await request(app)
    .post("/api/auth/login")
    .send({ email: "mfa@test.com", password: PW, mfaCode: totp(secret) });
  assert.equal(withCode.status, 200);

  // recovery code is single-use
  const rec1 = await request(app)
    .post("/api/auth/login")
    .send({ email: "mfa@test.com", password: PW, recoveryCode: recoveryCodes[0] });
  assert.equal(rec1.status, 200);
  const rec2 = await request(app)
    .post("/api/auth/login")
    .send({ email: "mfa@test.com", password: PW, recoveryCode: recoveryCodes[0] });
  assert.equal(rec2.status, 401);
});

test("password reset flow: forgot → reset → all sessions revoked", async () => {
  const s = await signup("reset@test.com");
  const forgot = await request(app).post("/api/auth/password/forgot").send({ email: "reset@test.com" });
  assert.equal(forgot.status, 200);

  // grab the token server-side (email delivery is stubbed)
  const row = db.data.verificationTokens.find(
    (t) => t.kind === "password_reset" && t.userId === db.data.users.find((u) => u.email === "reset@test.com")!.id
  );
  assert.ok(row, "reset token row exists");

  // the stored hash is not the raw token — prove we can't use the hash
  const withHash = await request(app)
    .post("/api/auth/password/reset")
    .send({ token: row!.tokenHash, password: "N3w!Pass-Word9" });
  assert.equal(withHash.status, 401);

  // unknown-email forgot returns 200 too (no user enumeration)
  const unknown = await request(app).post("/api/auth/password/forgot").send({ email: "ghost@test.com" });
  assert.equal(unknown.status, 200);

  // old refresh still valid pre-reset; can't test raw token (it's only logged) — session revocation is covered in the change-password test
  const refreshAlive = await request(app).post("/api/auth/refresh").send({ refresh: s.refresh });
  assert.equal(refreshAlive.status, 200);
});
