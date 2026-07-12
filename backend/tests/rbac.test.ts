import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATA_DIR = "data-t-rbac";

const { can, canAct } = await import("../src/core/rbac");

/* the exact policy matrix from the spec */

test("owner can edit house", () => {
  assert.equal(can("owner", "home:edit"), true);
});

test("child cannot delete house", () => {
  assert.equal(can("child", "home:delete"), false);
});

test("roommate can view utilities but NOT warranties (financial docs)", () => {
  assert.equal(can("roommate", "utilities:view"), true);
  assert.equal(can("roommate", "warranty:view"), false);
});

test("guest is read-only, emergency info only", () => {
  assert.equal(can("guest", "emergency:view"), true);
  assert.equal(can("guest", "asset:view"), false);
  assert.equal(can("guest", "utilities:view"), false);
  assert.equal(canAct("guest", "edit", "emergency"), false);
});

test("contractor has temporary scoped access: view jobs/assets, never write", () => {
  assert.equal(canAct("contractor", "view", "job"), true);
  assert.equal(canAct("contractor", "view", "asset"), true);
  assert.equal(canAct("contractor", "create", "asset"), false);
  assert.equal(canAct("contractor", "view", "warranty"), false);
  assert.equal(canAct("contractor", "view", "payment"), false);
});

test("admin has full access to every resource", () => {
  assert.equal(canAct("admin", "delete", "home"), true);
  assert.equal(canAct("admin", "manage", "payment"), true);
  assert.equal(canAct("admin", "view", "audit"), true);
});

test("unknown role has no permissions", () => {
  assert.equal(can("hacker", "home:view"), false);
});

test("property manager can operate but not delete", () => {
  assert.equal(can("property_manager", "job:create"), true);
  assert.equal(can("property_manager", "home:delete"), false);
});

test("malformed permission strings are denied, not crashed", () => {
  assert.equal(can("owner", "bogus"), false);
  assert.equal(can("owner", ""), false);
});
