import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/services/auth";

test("password hash roundtrip", () => {
  const h = hashPassword("correct-horse-battery");
  assert.equal(verifyPassword("correct-horse-battery", h), true);
  assert.equal(verifyPassword("wrong-password", h), false);
});

test("same password hashes differently (salted)", () => {
  assert.notEqual(hashPassword("hunter22"), hashPassword("hunter22"));
});

test("malformed stored hash rejects", () => {
  assert.equal(verifyPassword("anything", "not-a-hash"), false);
});
