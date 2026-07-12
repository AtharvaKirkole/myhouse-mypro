/*
 * API Gateway — one entry point, modular services mounted behind it.
 * Middleware chain (order matters):
 *   security headers → CORS whitelist → body limits → request context/logging
 *   → rate limiting → routers (each with authn/authz/validation) → 404 → errors
 */

import express from "express";
import cors from "cors";
import { corsOrigin, errorHandler, rateLimit, requestContext, securityHeaders } from "../core/http";
import { NotFoundError } from "../core/errors";
import { renderPrometheus } from "../core/metrics";
import { getDeadLetters, queueStats } from "../core/events";
import { allFlags } from "../core/flags";
import { config } from "../core/config";
import { authRouter, requireAuth, requireAdmin } from "../services/auth";
import { usersRouter } from "../services/users";
import { assetsRouter } from "../services/assets";
import { warrantiesRouter, runReminderScan } from "../services/warranties";
import { marketplaceRouter } from "../services/marketplace";
import { notificationsRouter, registerNotificationConsumers } from "../services/notifications";
import { aiRouter } from "../services/ai";
import { paymentsRouter } from "../services/payments";
import { searchRouter } from "../services/search";
import { assertDatabaseLoaded, db } from "../db/store";

let consumersRegistered = false;

export function createApp() {
  if (!consumersRegistered) {
    registerNotificationConsumers();
    consumersRegistered = true;
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // behind nginx/ALB

  app.use(securityHeaders);
  app.use(cors({ origin: corsOrigin, credentials: true, maxAge: 600 }));
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(requestContext);

  /* ---------- probes & observability (unauthenticated, not rate-limited) ---------- */

  app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
  app.get("/live", (_req, res) => res.json({ live: true })); // liveness: process is up
  app.get("/ready", (_req, res) => {
    // readiness: dependencies usable — db loaded, queue not drowning
    try {
      assertDatabaseLoaded();
      const dead = getDeadLetters().length;
      res.json({ ready: true, deadLetters: dead, queue: queueStats });
    } catch {
      res.status(503).json({ ready: false });
    }
  });
  app.get("/metrics", (_req, res) => {
    res.setHeader("content-type", "text/plain; version=0.0.4");
    res.send(renderPrometheus());
  });

  app.use(rateLimit);

  /* ---------- services ---------- */

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

  app.get("/api/analytics/summary", requireAuth, requireAdmin, (_req, res) => {
    const counts: Record<string, number> = {};
    for (const e of db.data.analytics) counts[e.event] = (counts[e.event] ?? 0) + 1;
    res.json({
      events: counts,
      activeHomes: db.data.homes.filter((h) => !h.deletedAt).length,
      jobs: db.data.jobs.length,
    });
  });

  app.get("/api/admin/dead-letters", requireAuth, requireAdmin, (_req, res) => {
    res.json(getDeadLetters());
  });

  /* ---------- tail ---------- */

  app.use((_req, _res, next) => next(new NotFoundError("route_not_found")));
  app.use(errorHandler);
  return app;
}

/** hourly warranty reminder scan (cron/worker in production) */
export function startSchedulers() {
  runReminderScan();
  return setInterval(() => runReminderScan(), 60 * 60 * 1000);
}
