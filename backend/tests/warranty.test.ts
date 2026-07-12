import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWarranty, dueReminders, REMINDER_WINDOWS } from "../src/services/warranties";

test("parser: explicit slash date", () => {
  const r = parseWarranty("Coverage valid until 03/15/2028 for this unit");
  assert.equal(r.expiresAt?.getFullYear(), 2028);
  assert.equal(r.expiresAt?.getMonth(), 2);
  assert.equal(r.expiresAt?.getDate(), 15);
});

test("parser: named month", () => {
  const r = parseWarranty("Warranty expires March 2028");
  assert.equal(r.expiresAt?.getFullYear(), 2028);
  assert.equal(r.expiresAt?.getMonth(), 2);
});

test("parser: duration from purchase date", () => {
  const r = parseWarranty("Includes a 2 year warranty", new Date(2026, 2, 1));
  assert.equal(r.termMonths, 24);
  assert.equal(r.expiresAt?.getFullYear(), 2028);
  assert.equal(r.expiresAt?.getMonth(), 2);
});

test("parser: months duration without purchase date returns term only", () => {
  const r = parseWarranty("24-month coverage included");
  assert.equal(r.termMonths, 24);
  assert.equal(r.expiresAt, null);
});

test("parser: garbage returns nulls", () => {
  const r = parseWarranty("thank you for shopping with us");
  assert.equal(r.expiresAt, null);
  assert.equal(r.termMonths, null);
});

test("reminders: 30-day window fires once", () => {
  const w = { expiresAt: new Date(Date.now() + 20 * 864e5).toISOString(), remindersSent: [90] };
  const due = dueReminders(w, new Date());
  assert.deepEqual(due, [30, 7].filter((x) => 20 <= x)); // 30 due, 7 not yet
  assert.deepEqual(due, [30]);
});

test("reminders: nothing after expiry", () => {
  const w = { expiresAt: new Date(Date.now() - 864e5).toISOString(), remindersSent: [] };
  assert.deepEqual(dueReminders(w, new Date()), []);
});

test("reminders: all windows defined descending", () => {
  assert.deepEqual([...REMINDER_WINDOWS].sort((a, b) => b - a), REMINDER_WINDOWS);
});
