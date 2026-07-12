/*
 * Config loader — single source of truth for the environment.
 * Validates at import time and FAILS FAST: a misconfigured production
 * process must never start. `.env.example` documents every key.
 */

export type Env = "development" | "test" | "staging" | "production";

function readEnv(): Record<string, string | undefined> {
  return process.env;
}

function fail(problems: string[]): never {
  throw new Error(`Configuration invalid:\n - ${problems.join("\n - ")}`);
}

function num(v: string | undefined, dflt: number): number {
  if (v === undefined || v === "") return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) fail([`expected number, got "${v}"`]);
  return n;
}

function buildConfig() {
  const e = readEnv();
  const env = (e.NODE_ENV ?? "development") as Env;
  const problems: string[] = [];

  const jwtSecret = e.JWT_SECRET ?? (env === "production" ? "" : "dev-only-secret-change-me");
  if (env === "production") {
    if (!e.JWT_SECRET || e.JWT_SECRET.length < 32) problems.push("JWT_SECRET must be set (>=32 chars) in production");
    if (!e.CORS_ORIGINS) problems.push("CORS_ORIGINS must be an explicit whitelist in production");
    if (e.AI_PROVIDER === "mock") problems.push("AI_PROVIDER=mock is not allowed in production");
  }
  if (problems.length) fail(problems);

  return {
    env,
    port: num(e.PORT, 4000),
    dataDir: e.DATA_DIR ?? "data",
    jwtSecret,
    accessTtl: e.ACCESS_TTL ?? "15m",
    refreshTtlDays: num(e.REFRESH_TTL_DAYS, 30),
    logLevel: (e.LOG_LEVEL ?? (env === "test" ? "error" : "info")) as
      "trace" | "debug" | "info" | "warn" | "error" | "fatal",
    bodyLimit: e.BODY_LIMIT ?? "1mb",
    corsOrigins: (e.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()),
    rateLimitPerMin: num(e.RATE_LIMIT, 300),
    lockout: {
      maxAttempts: num(e.LOCKOUT_MAX_ATTEMPTS, 5),
      windowSec: num(e.LOCKOUT_WINDOW_SEC, 900),
      durationSec: num(e.LOCKOUT_DURATION_SEC, 900),
    },
    aiProvider: e.AI_PROVIDER ?? "mock",
    aiFallbackProvider: e.AI_FALLBACK_PROVIDER ?? "mock",
    aiTimeoutMs: num(e.AI_TIMEOUT_MS, 10_000),
    aiRetries: num(e.AI_RETRIES, 2),
    aiMinConfidence: Number(e.AI_MIN_CONFIDENCE ?? 0.3),
    eventBackoffMs: num(e.EVENT_BACKOFF_MS, 50),
    eventMaxAttempts: num(e.EVENT_MAX_ATTEMPTS, 5),
    redisUrl: e.REDIS_URL ?? "", // empty → in-memory KV
    /* intelligence platform */
    intelMinCohort: num(e.INTEL_MIN_COHORT, 3), // k-anonymity floor for cross-home aggregates (raise in prod)
    dpEpsilon: Number(e.DP_EPSILON ?? 0), // >0 → Laplace noise on published aggregates
    embedDim: num(e.EMBED_DIM, 64), // hash-embedding dimensions (pgvector/real model later)
    retentionDays: num(e.RETENTION_DAYS, 365), // domain-event log retention
  };
}

export const config = buildConfig();
