import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATA_DIR = "data-t-auth";

const { hashPassword, verifyPassword, checkPasswordStrength, totp, base32Encode } =
  await import("../src/services/auth");

test("password hash roundtrip", () => {
  const h = hashPassword("correct-horse-battery");
  assert.equal(verifyPassword("correct-horse-battery", h), true);
  assert.equal(verifyPassword("wrong-password", h), false);
});

test("same password hashes differently (per-user salt)", () => {
  assert.notEqual(hashPassword("hunter22"), hashPassword("hunter22"));
});

test("malformed stored hash rejects", () => {
  assert.equal(verifyPassword("anything", "not-a-hash"), false);
});

test("password strength policy", () => {
  assert.ok(checkPasswordStrength("short1!A"), "too short rejected");
  assert.ok(checkPasswordStrength("alllowercase12"), "2 classes rejected");
  assert.ok(checkPasswordStrength("Password123!".slice(0, 9)), "9 chars rejected");
  assert.equal(checkPasswordStrength("Str0ng!Pass-2026"), null, "strong accepted");
  assert.equal(checkPasswordStrength("Tr1cky-Horse-Stapler"), null);
});

test("TOTP is deterministic per time-step and changes across steps", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  const t0 = 59_000; // RFC 6238 test vector time
  const a = totp(secret, t0);
  const b = totp(secret, t0);
  assert.equal(a, b);
  assert.match(a, /^\d{6}$/);
  // RFC 6238 SHA-1 test vector: T=59s → 287082
  assert.equal(a, "287082");
  const later = totp(secret, t0 + 30_000);
  assert.notEqual(a, later);
});
