/*
 * API Gateway — one entry point, modular services mounted behind it.
 * Modular monolith today; each router lifts out to its own deployment later
 * because services only talk through routers + the event queue, never by
 * importing each other's internals (payments.createHold is the one sanctioned
 * cross-call, which becomes an internal API/event when split).
 */

import express from "express";
import cors from "cors";
import { errorHandler, rateLimit, requestContext } from "../core/http";
import { allFlags } from "../core/flags";
import { authRouter, requireAuth } from "../services/auth";
import { usersRouter } from "../services/users";
import { assetsRouter } from "../services/assets";
import { warrantiesRouter, runReminderScan } from "../services/warranties";
import { marketplaceRouter } from "../services/marketplace";
import { notificationsRouter, registerNotificationConsumers } from "../services/notifications";
import { aiRouter } from "../services/ai";
import { paymentsRouter } from "../services/payments";
import { searchRouter } from "../services/search";
import { db } from "../db/store";

export function createApp() {
  registerNotificationConsumers();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(requestContext);
  app.use(rateLimit);

  app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
  app.get("/api/flags", (req, res) => res.json(allFlags(req.userId)));

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/assets", assetsRouter);
  app.use("/api/warranties", warrantiesRouter);
  app.use("/api/marketplace", marketplaceRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/search", searchRouter);

  app.get("/api/analytics/summary", requireAuth, (_req, res) => {
    const counts: Record<string, number> = {};
    for (const e of db.data.analytics) counts[e.event] = (counts[e.event] ?? 0) + 1;
    res.json({ events: counts, activeHomes: db.data.homes.length, jobs: db.data.jobs.length });
  });

  app.use(errorHandler);
  return app;
}

/** hourly warranty reminder scan (cron/worker in production) */
export function startSchedulers() {
  runReminderScan();
  return setInterval(() => runReminderScan(), 60 * 60 * 1000);
}
