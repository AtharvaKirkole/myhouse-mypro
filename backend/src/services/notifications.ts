/*
 * Notification Service — consumes the event queue; business logic never sends
 * notifications directly. Fan-out: in-app row always; push/email/sms channels
 * are console stubs (swap for FCM / SES / Twilio).
 */

import { Router } from "express";
import { on } from "../core/events";
import { log, service } from "../core/http";
import { requireAuth } from "./auth";
import { db, now, uid } from "../db/store";

function notify(userId: string | undefined, type: string, title: string, body: string) {
  if (!userId) return;
  const channels = ["in_app", "push", "email"];
  db.data.notifications.push({
    id: uid("ntf"),
    userId,
    type,
    title,
    body,
    channels,
    read: false,
    createdAt: now(),
  });
  db.persist();
  for (const ch of channels.filter((c) => c !== "in_app")) {
    log(null, "notifications", `deliver:${ch}`, { userId, type, title }); // provider stub
  }
}

/* ---------- queue consumers ---------- */

export function registerNotificationConsumers() {
  on("user.signed_up", (e) =>
    notify(String(e.payload.userId), "welcome", "Welcome to MyHouse", "Add your first home to get started.")
  );
  on("asset.created", (e) =>
    notify(String(e.payload.userId), "asset", `Added: ${e.payload.name}`, "Warranty watch and maintenance reminders are active.")
  );
  on("warranty.expiring", (e) =>
    notify(
      e.payload.userId ? String(e.payload.userId) : undefined,
      "warranty",
      `Warranty expiring: ${e.payload.item}`,
      `Coverage ends ${String(e.payload.expiresAt).slice(0, 10)} — ${e.payload.window} day notice.`
    )
  );
  on("bid.placed", (e) =>
    notify(String(e.payload.userId), "bid", "New bid on your job", `A pro bid $${e.payload.price}. Compare offers side-by-side.`)
  );
  on("bid.accepted", (e) => {
    notify(String(e.payload.proUserId), "job", "You won the job", "Payment is held in escrow — released on completion.");
    notify(String(e.payload.homeownerId), "job", "Pro booked", "Your payment is protected in escrow until you confirm the work.");
  });
  on("payment.released", (e) =>
    notify(String(e.payload.payeeUserId), "payment", "Payout released", `$${(Number(e.payload.amountCents) / 100).toFixed(2)} is on the way.`)
  );
}

/* ---------- routes ---------- */

export const notificationsRouter = Router();
notificationsRouter.use(service("notifications"), requireAuth);

notificationsRouter.get("/", (req, res) => {
  res.json(db.data.notifications.filter((n) => n.userId === req.userId).slice(-50).reverse());
});

notificationsRouter.post("/read-all", (req, res) => {
  for (const n of db.data.notifications) if (n.userId === req.userId) n.read = true;
  db.persist();
  res.json({ ok: true });
});
