import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config";

/* ---------- structured logging: every request gets id/user/ts/service ---------- */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      userId?: string;
      service?: string;
    }
  }
}

export function log(req: Request | null, service: string, msg: string, extra: Record<string, unknown> = {}) {
  const line = {
    ts: new Date().toISOString(),
    service,
    requestId: req?.requestId ?? "-",
    userId: req?.userId ?? "-",
    msg,
    ...extra,
  };
  console.log(JSON.stringify(line));
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  req.requestId = (req.headers["x-request-id"] as string) ?? randomUUID();
  res.setHeader("x-request-id", req.requestId);
  const started = Date.now();
  res.on("finish", () => {
    log(req, req.service ?? "gateway", `${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      ms: Date.now() - started,
    });
  });
  next();
}

/* tag which service module handled the request (observability) */
export function service(name: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.service = name;
    next();
  };
}

/* ---------- rate limiting: in-memory token bucket per IP (Redis in prod) ---------- */

const buckets = new Map<string, { tokens: number; last: number }>();

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: config.rateLimitPerMin, last: now };
  b.tokens = Math.min(config.rateLimitPerMin, b.tokens + ((now - b.last) / 60000) * config.rateLimitPerMin);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return res.status(429).json({ error: "rate_limited", retryAfterMs: 2000 });
  }
  b.tokens -= 1;
  buckets.set(key, b);
  next();
}

/* ---------- error envelope ---------- */

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message, requestId: req.requestId });
  }
  log(req, "gateway", "unhandled_error", { err: String(err) });
  return res.status(500).json({ error: "internal", requestId: req.requestId });
}
