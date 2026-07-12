/*
 * Notification Service — consumes the event queue; business logic never sends
 * notifications directly. Hardened: versioned templates, per-user channel
 * preferences, quiet hours, per-channel delivery tracking with retries.
 */

import { Router } from "express";
import { on } from "../core/events";
import { logAt, service } from "../core/http";
import { inc } from "../core/metrics";
import { requireAuth } from "./auth";
import { validate, PreferencesSchema } from "../core/validate";
import { db, now, uid, type PreferencesRow } from "../db/store";

/* ---------- versioned templates ---------- */

export const TEMPLATE_VERSION = 2;

type Template = (p: Record<string, unknown>) => { title: string; body: string };

const TEMPLATES: Record<string, Template> = {
  welcome: () => ({ title: "Welcome to MyHouse", body: "Add your first home to get started." }),
  asset: (p) => ({ title: `Added: ${p.name}`, body: "Warranty watch and maintenance reminders are active." }),
  warranty: (p) => ({
    title: `Warranty expiring: ${p.item}`,
    body: `Coverage ends ${String(p.expiresAt).slice(0, 10)} — ${p.window} day notice.`,
  }),
  bid: (p) => ({ title: "New bid on your job", body: `A pro bid $${p.price}. Compare offers side-by-side.` }),
  job_won: () => ({ title: "You won the job", body: "Payment is held in escrow — released on completion." }),
  job_booked: () => ({ title: "Pro booked", body: "Your payment is protected in escrow until you confirm the work." }),
  payment: (p) => ({ title: "Payout released", body: `$${(Number(p.amountCents) / 100).toFixed(2)} is on the way.` }),
  security: () => ({
    title: "Security alert",
    body: "A session was revoked due to suspicious token reuse. If this wasn't you, change your password.",
  }),
};

/* ---------- channel providers (FCM / SES / Twilio adapters in prod) ---------- */

export interface ChannelProvider {
  send(channel: string, userId: string, title: string): Promise<void>;
}

/** injectable for tests — default logs and succeeds */
export let channelProvider: ChannelProvider = {
  async send(channel, userId, title) {
    logAt("debug", null, "notifications", `deliver:${channel}`, { userId, title });
  },
};
export function setChannelProvider(p: ChannelProvider) {
  channelProvider = p;
}

const MAX_DELIVERY_ATTEMPTS = 3;

async function deliverWithRetry(
  channel: string,
  userId: string,
  title: string
): Promise<{ status: "sent" | "failed"; attempts: number }> {
  for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt++) {
    try {
      await channelProvider.send(channel, userId, title);
      inc("notifications_delivered_total", { channel });
      return { status: "sent", attempts: attempt };
    } catch (err) {
      logAt("warn", null, "notifications", `delivery_retry:${channel}`, { attempt, err: String(err) });
      await new Promise((r) => setTimeout(r, 10 * 2 ** attempt));
    }
  }
  inc("notifications_failed_total", { channel });
  return { status: "failed", attempts: MAX_DELIVERY_ATTEMPTS };
}

/* ---------- preferences & quiet hours ---------- */

function prefsFor(userId: string): PreferencesRow {
  return (
    db.data.preferences.find((p) => p.userId === userId) ?? {
      userId,
      push: true,
      email: true,
      sms: false,
      quietHoursStart: null,
      quietHoursEnd: null,
    }
  );
}

export function inQuietHours(prefs: PreferencesRow, at = new Date()): boolean {
  if (prefs.quietHoursStart === null || prefs.quietHoursEnd === null) return false;
  const h = at.getHours();
  const { quietHoursStart: s, quietHoursEnd: e } = prefs;
  return s <= e ? h >= s && h < e : h >= s || h < e; // supports overnight windows
}

/* ---------- core notify ---------- */

async function notify(userId: string | undefined, type: string, payload: Record<string, unknown>) {
  if (!userId) return;
  const template = TEMPLATES[type];
  if (!template) return;
  const { title, body } = template(payload);

  const prefs = prefsFor(userId);
  const quiet = inQuietHours(prefs);
  const wanted = ["push", "email", "sms"].filter((c) => prefs[c as "push" | "email" | "sms"]);

  const deliveries: { channel: string; status: "sent" | "deferred" | "failed"; attempts: number }[] = [];
  for (const ch of wanted) {
    if (quiet) {
      deliveries.push({ channel: ch, status: "deferred", attempts: 0 }); // flushed after quiet hours by the scheduler
    } else {
      deliveries.push({ channel: ch, ...(await deliverWithRetry(ch, userId, title)) });
    }
  }

  db.data.notifications.push({
    id: uid("ntf"),
    userId,
    type,
    title,
    body,
    channels: ["in_app", ...wanted],
    deliveries,
    read: false,
    createdAt: now(),
  });
  db.persist();
}

/* ---------- queue consumers ---------- */

export function registerNotificationConsumers() {
  on("user.signed_up", (e) => notify(String(e.payload.userId), "welcome", e.payload), "notify:welcome");
  on("asset.created", (e) => notify(String(e.payload.userId), "asset", e.payload), "notify:asset");
  on(
    "warranty.expiring",
    (e) => notify(e.payload.userId ? String(e.payload.userId) : undefined, "warranty", e.payload),
    "notify:warranty"
  );
  on("bid.placed", (e) => notify(String(e.payload.userId), "bid", e.payload), "notify:bid");
  on(
    "bid.accepted",
    async (e) => {
      await notify(String(e.payload.proUserId), "job_won", e.payload);
      await notify(String(e.payload.homeownerId), "job_booked", e.payload);
    },
    "notify:accepted"
  );
  on("payment.released", (e) => notify(String(e.payload.payeeUserId), "payment", e.payload), "notify:payment");
  on("auth.suspicious", (e) => notify(String(e.payload.userId), "security", e.payload), "notify:security");
}

/* ---------- routes ---------- */

export const notificationsRouter = Router();
notificationsRouter.use(service("notifications"), requireAuth);

notificationsRouter.get("/", (req, res) => {
  res.json(
    db.data.notifications
      .filter((n) => n.userId === req.userId)
      .slice(-50)
      .reverse()
  );
});

notificationsRouter.post("/read-all", (req, res) => {
  for (const n of db.data.notifications) if (n.userId === req.userId) n.read = true;
  db.persist();
  res.json({ ok: true });
});

notificationsRouter.get("/preferences", (req, res) => {
  res.json(prefsFor(req.userId!));
});

notificationsRouter.put("/preferences", validate(PreferencesSchema), (req, res) => {
  const next: PreferencesRow = { userId: req.userId!, ...req.body };
  db.data.preferences = [...db.data.preferences.filter((p) => p.userId !== req.userId), next];
  db.persist();
  res.json(next);
});
