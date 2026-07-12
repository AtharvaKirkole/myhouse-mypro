/*
 * Event queue — services publish, consumers subscribe. In-process today;
 * BullMQ / RabbitMQ / Kafka / SQS behind the same publish/on surface later.
 *
 * Production semantics implemented here:
 *  - at-least-once delivery with per-handler idempotency guard
 *  - retry with exponential backoff (EVENT_BACKOFF_MS * 2^attempt)
 *  - dead-letter queue after EVENT_MAX_ATTEMPTS
 *  - delivery stats for the metrics endpoint
 */

import { randomUUID } from "node:crypto";
import { config } from "./config";
import { log } from "./http";
import { inc } from "./metrics";

export type EventName =
  | "user.signed_up"
  | "asset.created"
  | "warranty.expiring"
  | "job.created"
  | "bid.placed"
  | "bid.accepted"
  | "job.completed"
  | "payment.released"
  | "auth.suspicious";

export interface AppEvent {
  id: string;
  name: EventName;
  payload: Record<string, unknown>;
  ts: string;
  attempts: number;
}

export interface DeadLetter {
  event: AppEvent;
  error: string;
  diedAt: string;
}

type Handler = (e: AppEvent) => void | Promise<void>;

const handlers = new Map<EventName, { name: string; fn: Handler }[]>();
const queue: AppEvent[] = [];
const deadLetters: DeadLetter[] = [];
const processed = new Set<string>(); // `${handlerName}:${eventId}` — idempotent delivery
let draining = false;
let pendingRetries = 0;

export const queueStats = { published: 0, delivered: 0, retried: 0, dead: 0 };

export function on(name: EventName, fn: Handler, handlerName = `${name}#${(handlers.get(name)?.length ?? 0) + 1}`) {
  handlers.set(name, [...(handlers.get(name) ?? []), { name: handlerName, fn }]);
}

export function publish(name: EventName, payload: Record<string, unknown>) {
  queue.push({ id: randomUUID(), name, payload, ts: new Date().toISOString(), attempts: 0 });
  queueStats.published++;
  inc("events_published_total", { event: name });
  if (!draining) {
    draining = true;
    setImmediate(drain);
  }
}

async function deliver(e: AppEvent) {
  const subs = handlers.get(e.name) ?? [];
  let failed = false;
  for (const h of subs) {
    const dedupeKey = `${h.name}:${e.id}`;
    if (processed.has(dedupeKey)) continue; // already delivered to this handler
    try {
      await h.fn(e);
      processed.add(dedupeKey);
      queueStats.delivered++;
    } catch (err) {
      failed = true;
      log(null, "events", `handler_failed:${e.name}`, { handler: h.name, attempt: e.attempts, err: String(err) });
    }
  }
  if (!failed) return;

  e.attempts += 1;
  if (e.attempts >= config.eventMaxAttempts) {
    deadLetters.push({ event: e, error: "max_attempts_exceeded", diedAt: new Date().toISOString() });
    queueStats.dead++;
    inc("events_dead_lettered_total", { event: e.name });
    log(null, "events", `dead_letter:${e.name}`, { eventId: e.id, attempts: e.attempts });
    return;
  }
  queueStats.retried++;
  inc("events_retried_total", { event: e.name });
  pendingRetries++;
  const backoff = config.eventBackoffMs * 2 ** (e.attempts - 1);
  setTimeout(() => {
    pendingRetries--;
    queue.push(e);
    if (!draining) {
      draining = true;
      setImmediate(drain);
    }
  }, backoff);
}

async function drain() {
  while (queue.length > 0) {
    await deliver(queue.shift()!);
  }
  draining = false;
}

export function getDeadLetters(): DeadLetter[] {
  return [...deadLetters];
}

/** test/shutdown helper: wait until queue, in-flight work, and retries settle */
export async function flushEvents(): Promise<void> {
  while (draining || queue.length > 0 || pendingRetries > 0) {
    await new Promise((r) => setTimeout(r, 5));
  }
}
