/*
 * Event queue: retry with exponential backoff, dead-letter queue after max
 * attempts, and idempotent delivery (a succeeding handler is not re-invoked
 * when a sibling handler forces retries).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATA_DIR = "data-t-queue";
process.env.EVENT_BACKOFF_MS = "2";
process.env.EVENT_MAX_ATTEMPTS = "4";

const { on, publish, flushEvents, getDeadLetters, queueStats } = await import("../src/core/events");

test("failing handler retries with backoff then dead-letters", async () => {
  let attempts = 0;
  on(
    "job.completed",
    () => {
      attempts++;
      throw new Error("boom");
    },
    "always-fails"
  );

  publish("job.completed", { jobId: "job_x" });
  await flushEvents();

  assert.equal(attempts, 4, "handler ran maxAttempts times");
  const dead = getDeadLetters();
  assert.equal(dead.length, 1);
  assert.equal(dead[0].event.name, "job.completed");
  assert.equal(dead[0].event.attempts, 4);
  assert.ok(queueStats.retried >= 3);
});

test("idempotent delivery: successful sibling handler is not re-invoked on retries", async () => {
  let goodCalls = 0;
  let badCalls = 0;
  on("payment.released", () => void goodCalls++, "good-handler");
  on(
    "payment.released",
    () => {
      badCalls++;
      throw new Error("flaky");
    },
    "bad-handler"
  );

  publish("payment.released", { paymentId: "pay_x" });
  await flushEvents();

  assert.equal(goodCalls, 1, "good handler exactly once despite sibling retries");
  assert.equal(badCalls, 4, "bad handler exhausted retries");
});

test("handlers that eventually succeed leave the DLQ empty", async () => {
  let n = 0;
  on(
    "bid.placed",
    () => {
      n++;
      if (n < 3) throw new Error("transient");
    },
    "eventually-succeeds"
  );

  const deadBefore = getDeadLetters().length;
  publish("bid.placed", { bidId: "bid_x" });
  await flushEvents();

  assert.equal(n, 3);
  assert.equal(getDeadLetters().length, deadBefore);
});
