import { test } from "node:test";
import assert from "node:assert/strict";
import { can } from "../src/core/rbac";

test("owner can edit house", () => {
  assert.equal(can("owner", "home:edit"), true);
});

test("child cannot delete house", () => {
  assert.equal(can("child", "home:delete"), false);
});

test("roommate can view utilities", () => {
  assert.equal(can("roommate", "utilities:view"), true);
});

test("guest sees only emergency info", () => {
  assert.equal(can("guest", "emergency:view"), true);
  assert.equal(can("guest", "asset:view"), false);
  assert.equal(can("guest", "utilities:view"), false);
});

test("unknown role has no permissions", () => {
  assert.equal(can("hacker", "home:view"), false);
});

test("property manager can operate but not delete", () => {
  assert.equal(can("property_manager", "job:create"), true);
  assert.equal(can("property_manager", "home:delete"), false);
});
