/*
 * Event queue — services publish, consumers subscribe. In-process today,
 * Redis Streams / SQS tomorrow: the publish/subscribe surface stays identical.
 * Notifications are NEVER sent inline by business logic; they are consumers.
 */

import { log } from "./http";

export type EventName =
  | "user.signed_up"
  | "asset.created"
  | "warranty.expiring"
  | "job.created"
  | "bid.placed"
  | "bid.accepted"
  | "job.completed"
  | "payment.released";

export interface AppEvent {
  name: EventName;
  payload: Record<string, unknown>;
  ts: string;
}

type Handler = (e: AppEvent) => void | Promise<void>;

const handlers = new Map<EventName, Handler[]>();
const queue: AppEvent[] = [];
let draining = false;

export function on(name: EventName, h: Handler) {
  handlers.set(name, [...(handlers.get(name) ?? []), h]);
}

export function publish(name: EventName, payload: Record<string, unknown>) {
  queue.push({ name, payload, ts: new Date().toISOString() });
  if (!draining) {
    draining = true;
    setImmediate(drain);
  }
}

async function drain() {
  while (queue.length > 0) {
    const e = queue.shift()!;
    for (const h of handlers.get(e.name) ?? []) {
      try {
        await h(e);
      } catch (err) {
        log(null, "events", `handler_failed:${e.name}`, { err: String(err) });
      }
    }
  }
  draining = false;
}

/** test helper: wait until the queue is empty */
export async function flushEvents(): Promise<void> {
  while (draining || queue.length > 0) {
    await new Promise((r) => setImmediate(r));
  }
}
