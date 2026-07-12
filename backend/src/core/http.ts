import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config";
import { AppError, ForbiddenError, RateLimitError } from "./errors";
import { kv } from "./redis";
import { observeRequest } from "./metrics";

export { HttpError } from "./errors"; // back-compat re-export for services

/** Express 4 does not catch async rejections — every async route wears this. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/* ---------- request context ---------- */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      userId?: string;
      sessionId?: string;
      houseId?: string;
      service?: string;
    }
  }
}

/* ---------- structured leveled logging (PII-safe) ---------- */

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LEVELS)[number];
const threshold = LEVELS.indexOf(config.logLevel);

const PII_KEY = /(password|token|secret|authorization|refresh|mfa|code|email|recovery)/i;

function redact(extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    out[k] = PII_KEY.test(k) ? "[REDACTED]" : v;
  }
  return out;
}

export function logAt(
  level: LogLevel,
  req: Request | null,
  service: string,
  msg: string,
  extra: Record<string, unknown> = {}
) {
  if (LEVELS.indexOf(level) < threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    service,
    requestId: req?.requestId ?? "-",
    userId: req?.userId ?? "-",
    sessionId: req?.sessionId ?? "-",
    houseId: req?.houseId ?? "-",
    ip: req?.ip ?? "-",
    msg,
    ...redact(extra),
  };
  console.log(JSON.stringify(line));
}

/** legacy signature kept: info-level log */
export function log(req: Request | null, service: string, msg: string, extra: Record<string, unknown> = {}) {
  logAt("info", req, service, msg, extra);
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  req.requestId = (req.headers["x-request-id"] as string) ?? randomUUID();
  res.setHeader("x-request-id", req.requestId);
  const started = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - started;
    observeRequest(req.route?.path ?? req.path, req.method, res.statusCode, ms);
    logAt(
      res.statusCode >= 500 ? "error" : "info",
      req,
      req.service ?? "gateway",
      `${req.method} ${req.originalUrl.split("?")[0]}`,
      {
        status: res.statusCode,
        ms,
        userAgent: String(req.headers["user-agent"] ?? "").slice(0, 80),
      }
    );
  });
  next();
}

/** tag which service module handled the request (observability) */
export function service(name: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.service = name;
    next();
  };
}

/* ---------- security headers (helmet-equivalent for an API) ---------- */

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-XSS-Protection", "0"); // modern guidance: rely on CSP
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (config.env === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  next();
}

/* ---------- rate limiting: per-IP always, per-user when authenticated ---------- */

export async function rateLimit(req: Request, _res: Response, next: NextFunction) {
  const limit = config.rateLimitPerMin;
  const window = 60;
  const byIp = await kv.incr(`rl:ip:${req.ip}:${Math.floor(Date.now() / 60000)}`, window);
  if (byIp > limit) return next(new RateLimitError("rate_limited", "per-IP limit exceeded"));
  if (req.userId) {
    const byUser = await kv.incr(`rl:usr:${req.userId}:${Math.floor(Date.now() / 60000)}`, window);
    if (byUser > limit) return next(new RateLimitError("rate_limited", "per-user limit exceeded"));
  }
  next();
}

/* ---------- idempotency keys (replay-safe unsafe methods) ---------- */

export function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["idempotency-key"];
  if (!key || typeof key !== "string" || req.method === "GET") return next();
  const storeKey = `idem:${req.userId ?? "anon"}:${req.method}:${req.path}:${key}`;

  kv.get(storeKey).then((cached) => {
    if (cached) {
      const { status, body } = JSON.parse(cached);
      res.setHeader("Idempotency-Replay", "true");
      return res.status(status).json(body);
    }
    const original = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode < 500) {
        void kv.set(storeKey, JSON.stringify({ status: res.statusCode, body }), 24 * 3600);
      }
      return original(body);
    };
    next();
  }, next);
}

/* ---------- CORS origin check (whitelist) ---------- */

export function corsOrigin(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
  if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
  cb(new ForbiddenError("cors_origin_rejected", `Origin ${origin} is not whitelisted`));
}

/* ---------- error envelope ---------- */

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
      requestId: req.requestId,
    });
  }
  const errorId = randomUUID();
  logAt("error", req, "gateway", "unhandled_error", { errorId, err: String(err) });
  // never expose stack traces or internals
  return res.status(500).json({ error: "internal", errorId, requestId: req.requestId });
}
