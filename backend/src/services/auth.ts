/*
 * Auth Service — production auth lifecycle:
 *   access JWT (15m) · rotating refresh tokens in FAMILIES (one per device)
 *   reuse detection (a rotated token presented again revokes its family)
 *   per-device sessions, logout-one / logout-all
 *   lockouts + login throttling · password strength/history/reset
 *   email verification · TOTP MFA + recovery codes + trusted devices
 */

import { Router, type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { createHmac, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "../core/config";
import { asyncHandler, service, logAt } from "../core/http";
import { ConflictError, ForbiddenError, RateLimitError, UnauthorizedError, ValidationError } from "../core/errors";
import { kv } from "../core/redis";
import { publish } from "../core/events";
import {
  validate,
  SignupSchema,
  LoginSchema,
  RefreshSchema,
  ForgotSchema,
  ResetSchema,
  ChangePasswordSchema,
  VerifyEmailSchema,
  MfaCodeSchema,
} from "../core/validate";
import { db, now, uid, type RefreshTokenRow, type UserRow } from "../db/store";

/* ================= password security ================= */

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(pw, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "123456789012",
  "qwertyuiop12",
  "letmein12345",
  "iloveyou1234",
  "admin1234567",
]);

/** ≥10 chars, ≥3 of 4 character classes, not a known-common password */
export function checkPasswordStrength(pw: string): string | null {
  if (pw.length < 10) return "password must be at least 10 characters";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) => re.test(pw)).length;
  if (classes < 3) return "use at least 3 of: lowercase, uppercase, digits, symbols";
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return "password is too common";
  return null;
}

/** HIBP abstraction — production impl calls the k-anonymity range API */
export interface BreachChecker {
  isBreached(password: string): Promise<boolean>;
}
export const breachChecker: BreachChecker = {
  async isBreached() {
    return false; // offline default; swap for HIBP range query
  },
};

const PASSWORD_HISTORY_DEPTH = 5;

function violatesHistory(user: UserRow, newPw: string): boolean {
  return (user.passwordHistory ?? []).some((old) => verifyPassword(newPw, old));
}

function setPassword(user: UserRow, newPw: string) {
  user.passwordHistory = [user.passwordHash, ...(user.passwordHistory ?? [])].slice(0, PASSWORD_HISTORY_DEPTH);
  user.passwordHash = hashPassword(newPw);
  user.passwordChangedAt = now();
  user.tokenGeneration = (user.tokenGeneration ?? 0) + 1; // outdates every pre-change JWT
}

/* ================= TOTP (RFC 6238, HMAC-SHA1, 30s / 6 digits) ================= */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0,
    value = 0,
    out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (const c of s.toUpperCase().replace(/=+$/, "")) {
    const idx = B32.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totp(secretB32: string, at = Date.now(), step = 30): string {
  const counter = Math.floor(at / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}

function totpValid(secretB32: string, code: string): boolean {
  // ±1 step clock-drift window
  return [-1, 0, 1].some((w) => totp(secretB32, Date.now() + w * 30_000) === code);
}

/* ================= tokens & sessions ================= */

export function signAccess(user: UserRow, familyId: string): string {
  return jwt.sign(
    { sub: user.id, type: user.accountType, name: user.name, sid: familyId, gen: user.tokenGeneration ?? 0 },
    config.jwtSecret,
    { expiresIn: config.accessTtl as jwt.SignOptions["expiresIn"] }
  );
}

interface DeviceInfo {
  deviceId?: string;
  deviceName?: string;
  ip?: string;
}

export function issueRefresh(userId: string, familyId: string, device: DeviceInfo, rotatedFrom?: string): string {
  const token = randomBytes(32).toString("hex");
  db.data.refreshTokens.push({
    id: token,
    userId,
    familyId,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    ip: device.ip,
    expiresAt: new Date(Date.now() + config.refreshTtlDays * 864e5).toISOString(),
    usedAt: null,
    revokedAt: null,
    rotatedFrom,
    createdAt: now(),
  });
  db.persist();
  return token;
}

function newSession(user: UserRow, req: Request, deviceName?: string) {
  const familyId = randomUUID();
  const deviceId = (req.headers["x-device-id"] as string) ?? randomUUID();
  const refresh = issueRefresh(user.id, familyId, {
    deviceId,
    deviceName: deviceName ?? String(req.headers["user-agent"] ?? "unknown").slice(0, 60),
    ip: req.ip,
  });
  return { access: signAccess(user, familyId), refresh, deviceId, familyId };
}

function revokeFamily(familyId: string, reason: string) {
  for (const t of db.data.refreshTokens) {
    if (t.familyId === familyId && !t.revokedAt) t.revokedAt = now();
  }
  db.persist();
  logAt("warn", null, "auth", `family_revoked:${reason}`, { familyId });
}

export function rotateRefresh(token: string, req: Request): { access: string; refresh: string } {
  const row = db.data.refreshTokens.find((t) => t.id === token);
  if (!row) throw new UnauthorizedError("invalid_refresh");
  if (row.revokedAt) throw new UnauthorizedError("session_revoked");
  if (row.expiresAt < now()) throw new UnauthorizedError("refresh_expired");

  // REUSE DETECTION: a token that was already rotated is being replayed.
  // Standard response: kill the entire family — the legitimate holder
  // re-authenticates, the thief gets nothing.
  if (row.usedAt) {
    revokeFamily(row.familyId, "refresh_reuse_detected");
    audit(req, "auth.refresh_reuse", row.userId);
    publish("auth.suspicious", { userId: row.userId, familyId: row.familyId, kind: "refresh_reuse" });
    throw new UnauthorizedError("reuse_detected", "Session revoked due to token reuse");
  }

  const user = db.data.users.find((u) => u.id === row.userId);
  if (!user) throw new UnauthorizedError("invalid_refresh");

  row.usedAt = now();
  const refresh = issueRefresh(
    user.id,
    row.familyId,
    { deviceId: row.deviceId, deviceName: row.deviceName, ip: req.ip },
    token
  );
  return { access: signAccess(user, row.familyId), refresh };
}

/* ================= middleware ================= */

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new UnauthorizedError());
  try {
    const claims = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    req.userId = String(claims.sub);
    req.sessionId = claims.sid ? String(claims.sid) : undefined;

    // session invalidation: password change / logout-all outdates old JWTs
    const user = db.data.users.find((u) => u.id === req.userId);
    if (!user) return next(new UnauthorizedError("invalid_token"));
    // generation counter (bumped on password change/reset) — deterministic
    // invalidation, immune to jwt iat's second-level precision
    if (Number(claims.gen ?? 0) < (user.tokenGeneration ?? 0)) {
      return next(new UnauthorizedError("session_invalidated", "Re-authentication required"));
    }
    if (req.sessionId) {
      const familyAlive = db.data.refreshTokens.some((t) => t.familyId === req.sessionId && !t.revokedAt);
      if (!familyAlive) return next(new UnauthorizedError("session_revoked"));
    }
    next();
  } catch (e) {
    if (e instanceof UnauthorizedError) return next(e);
    next(new UnauthorizedError("invalid_token"));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const user = db.data.users.find((u) => u.id === req.userId);
  if (!user?.isAdmin) return next(new ForbiddenError("admin_only"));
  next();
}

/** immutable audit trail: who / what / when / where / before / after */
export function audit(req: Request, action: string, resource: string, change?: { before?: unknown; after?: unknown }) {
  db.data.auditLogs.push({
    id: uid("aud"),
    ts: now(),
    requestId: req.requestId ?? "-",
    userId: req.userId ?? "-",
    ip: req.ip,
    action,
    resource,
    before: change?.before,
    after: change?.after,
  });
  db.persist();
}

/* ================= login throttling & lockout ================= */

async function registerFailure(email: string, ip: string | undefined, req: Request): Promise<void> {
  const { maxAttempts, windowSec, durationSec } = config.lockout;
  const byUser = await kv.incr(`lock:u:${email}`, windowSec);
  await kv.incr(`lock:ip:${ip}`, windowSec);
  if (byUser >= maxAttempts) {
    await kv.set(`locked:${email}`, "1", durationSec);
    audit(req, "auth.lockout", email.split("@")[0] + "@…"); // no full PII in audit resource
    logAt("warn", req, "auth", "account_locked", { attempts: byUser });
  }
}

async function assertNotLocked(email: string, ip: string | undefined): Promise<void> {
  if (await kv.get(`locked:${email}`))
    throw new RateLimitError("account_locked", "Too many failed attempts — try again later");
  const ipFails = Number((await kv.get(`lock:ip:${ip}`)) ?? 0);
  if (ipFails >= config.lockout.maxAttempts * 4) throw new RateLimitError("ip_throttled");
}

/* ================= verification tokens ================= */

function issueVerification(userId: string, kind: "email" | "password_reset", ttlMin: number): string {
  const raw = randomBytes(24).toString("hex");
  db.data.verificationTokens.push({
    id: uid("vt"),
    userId,
    kind,
    tokenHash: createHash("sha256").update(raw).digest("hex"),
    expiresAt: new Date(Date.now() + ttlMin * 60_000).toISOString(),
    usedAt: null,
  });
  db.persist();
  return raw;
}

function consumeVerification(raw: string, kind: "email" | "password_reset"): string {
  const hash = createHash("sha256").update(raw).digest("hex");
  const row = db.data.verificationTokens.find((t) => t.tokenHash === hash && t.kind === kind);
  if (!row || row.usedAt || row.expiresAt < now())
    throw new UnauthorizedError("invalid_token", "Token invalid or expired");
  row.usedAt = now();
  db.persist();
  return row.userId;
}

/* ================= routes ================= */

export const authRouter = Router();
authRouter.use(service("auth"));

function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    accountType: u.accountType,
    emailVerified: u.emailVerified ?? false,
  };
}

authRouter.post(
  "/signup",
  validate(SignupSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name, accountType, proProfile, deviceName } = req.body;

    const weak = checkPasswordStrength(password);
    if (weak) throw new ValidationError([{ path: "password", message: weak }], weak);
    if (await breachChecker.isBreached(password)) {
      throw new ValidationError([{ path: "password", message: "password appears in known breaches" }]);
    }
    if (db.data.users.some((u) => u.email === email)) throw new ConflictError("email_taken");

    const user: UserRow = {
      id: uid("usr"),
      email,
      passwordHash: hashPassword(password),
      name,
      accountType,
      mfaEnabled: false,
      emailVerified: false,
      proProfile: accountType === "pro" ? proProfile : undefined,
      createdAt: now(),
    };
    db.data.users.push(user);
    db.persist();

    const verifyToken = issueVerification(user.id, "email", 24 * 60);
    logAt("info", req, "auth", "verification_email_queued", { token: verifyToken }); // email channel stub (redacted in logs)

    audit(req, "auth.signup", user.id);
    publish("user.signed_up", { userId: user.id, accountType: user.accountType });

    const session = newSession(user, req, deviceName);
    res
      .status(201)
      .json({ user: publicUser(user), access: session.access, refresh: session.refresh, deviceId: session.deviceId });
  })
);

authRouter.post(
  "/login",
  validate(LoginSchema),
  asyncHandler(async (req, res) => {
    const { email, password, mfaCode, recoveryCode, deviceId, deviceName } = req.body;
    await assertNotLocked(email, req.ip);

    const user = db.data.users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      await registerFailure(email, req.ip, req);
      throw new UnauthorizedError("bad_credentials");
    }

    if (user.mfaEnabled && user.mfaSecret) {
      const trusted = (user.trustedDevices ?? []).some((d) => d.deviceId === deviceId && d.expiresAt > now());
      if (!trusted) {
        const totpOk = mfaCode ? totpValid(user.mfaSecret, mfaCode) : false;
        const recoveryOk = recoveryCode
          ? (user.recoveryCodes ?? []).some((h, i) => {
              if (verifyPassword(recoveryCode, h)) {
                user.recoveryCodes!.splice(i, 1); // single-use
                db.persist();
                return true;
              }
              return false;
            })
          : false;
        if (!totpOk && !recoveryOk) {
          return res.status(401).json({ error: "mfa_required", message: "TOTP or recovery code required" });
        }
      }
    }

    await kv.del(`lock:u:${email}`);
    audit(req, "auth.login", user.id);
    const session = newSession(user, req, deviceName);

    // trust this device for MFA for 30 days
    if (user.mfaEnabled) {
      user.trustedDevices = [
        ...(user.trustedDevices ?? []).filter((d) => d.expiresAt > now()),
        { deviceId: session.deviceId, expiresAt: new Date(Date.now() + 30 * 864e5).toISOString() },
      ];
      db.persist();
    }

    res.json({ user: publicUser(user), access: session.access, refresh: session.refresh, deviceId: session.deviceId });
  })
);

authRouter.post("/refresh", validate(RefreshSchema), (req, res) => {
  res.json(rotateRefresh(req.body.refresh, req));
});

/* logout THIS device: revoke the presented token's family */
authRouter.post("/logout", validate(RefreshSchema), (req, res) => {
  const row = db.data.refreshTokens.find((t) => t.id === req.body.refresh);
  if (row) {
    revokeFamily(row.familyId, "logout");
    audit(req, "auth.logout", row.userId);
  }
  res.json({ ok: true });
});

/* logout EVERYWHERE */
authRouter.post("/logout-all", requireAuth, (req, res) => {
  const families = new Set(
    db.data.refreshTokens.filter((t) => t.userId === req.userId && !t.revokedAt).map((t) => t.familyId)
  );
  for (const f of families) revokeFamily(f, "logout_all");
  audit(req, "auth.logout_all", req.userId!);
  res.json({ ok: true, sessionsRevoked: families.size });
});

/* device/session management */
authRouter.get("/sessions", requireAuth, (req, res) => {
  const mine = db.data.refreshTokens.filter((t) => t.userId === req.userId && !t.revokedAt && t.expiresAt > now());
  const byFamily = new Map<string, RefreshTokenRow>();
  for (const t of mine) {
    const cur = byFamily.get(t.familyId);
    if (!cur || (t.createdAt ?? "") > (cur.createdAt ?? "")) byFamily.set(t.familyId, t);
  }
  res.json(
    [...byFamily.values()].map((t) => ({
      familyId: t.familyId,
      deviceName: t.deviceName,
      ip: t.ip,
      createdAt: t.createdAt,
      current: t.familyId === req.sessionId,
    }))
  );
});

authRouter.delete("/sessions/:familyId", requireAuth, (req, res) => {
  const owns = db.data.refreshTokens.some((t) => t.familyId === req.params.familyId && t.userId === req.userId);
  if (!owns) throw new ForbiddenError();
  revokeFamily(req.params.familyId, "user_revoked_device");
  audit(req, "auth.session_revoke", req.params.familyId);
  res.json({ ok: true });
});

/* email verification */
authRouter.post("/verify-email", validate(VerifyEmailSchema), (req, res) => {
  const userId = consumeVerification(req.body.token, "email");
  const user = db.data.users.find((u) => u.id === userId);
  if (user) {
    user.emailVerified = true;
    db.persist();
  }
  res.json({ ok: true });
});

/* password reset: request is always 200 (no user-enumeration oracle) */
authRouter.post("/password/forgot", validate(ForgotSchema), (req, res) => {
  const user = db.data.users.find((u) => u.email === req.body.email);
  if (user) {
    const token = issueVerification(user.id, "password_reset", 30);
    logAt("info", req, "auth", "password_reset_email_queued", { token }); // email stub (redacted)
  }
  res.json({ ok: true });
});

authRouter.post("/password/reset", validate(ResetSchema), (req, res) => {
  const weak = checkPasswordStrength(req.body.password);
  if (weak) throw new ValidationError([{ path: "password", message: weak }], weak);
  const userId = consumeVerification(req.body.token, "password_reset");
  const user = db.data.users.find((u) => u.id === userId);
  if (!user) throw new UnauthorizedError("invalid_token");
  if (violatesHistory(user, req.body.password)) {
    throw new ValidationError([
      { path: "password", message: `must differ from your last ${PASSWORD_HISTORY_DEPTH} passwords` },
    ]);
  }
  setPassword(user, req.body.password);
  db.persist();
  // all sessions die on reset
  const families = new Set(db.data.refreshTokens.filter((t) => t.userId === userId).map((t) => t.familyId));
  for (const f of families) revokeFamily(f, "password_reset");
  audit(req, "auth.password_reset", userId);
  res.json({ ok: true });
});

authRouter.post("/password/change", requireAuth, validate(ChangePasswordSchema), (req, res) => {
  const user = db.data.users.find((u) => u.id === req.userId)!;
  if (!verifyPassword(req.body.current, user.passwordHash)) throw new UnauthorizedError("bad_credentials");
  const weak = checkPasswordStrength(req.body.next);
  if (weak) throw new ValidationError([{ path: "next", message: weak }], weak);
  if (violatesHistory(user, req.body.next) || verifyPassword(req.body.next, user.passwordHash)) {
    throw new ValidationError([
      { path: "next", message: `must differ from your last ${PASSWORD_HISTORY_DEPTH} passwords` },
    ]);
  }
  setPassword(user, req.body.next);
  db.persist();
  audit(req, "auth.password_change", user.id);
  res.json({ ok: true, note: "all existing sessions require re-authentication" });
});

/* MFA: enroll → activate (returns recovery codes once) → disable */
authRouter.post("/mfa/enroll", requireAuth, (req, res) => {
  const user = db.data.users.find((u) => u.id === req.userId)!;
  const secret = base32Encode(randomBytes(20));
  user.mfaPendingSecret = secret;
  db.persist();
  res.json({ secret, otpauth: `otpauth://totp/MyHouse:${user.email}?secret=${secret}&issuer=MyHouse` });
});

authRouter.post("/mfa/activate", requireAuth, validate(MfaCodeSchema), (req, res) => {
  const user = db.data.users.find((u) => u.id === req.userId)!;
  if (!user.mfaPendingSecret) throw new ConflictError("no_pending_enrollment");
  if (!totpValid(user.mfaPendingSecret, req.body.code)) throw new UnauthorizedError("invalid_code");
  user.mfaSecret = user.mfaPendingSecret;
  user.mfaPendingSecret = undefined;
  user.mfaEnabled = true;
  const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(6).toString("hex"));
  user.recoveryCodes = recoveryCodes.map((c) => hashPassword(c));
  db.persist();
  audit(req, "auth.mfa_enabled", user.id);
  res.json({ ok: true, recoveryCodes }); // shown exactly once
});

authRouter.post("/mfa/disable", requireAuth, validate(MfaCodeSchema), (req, res) => {
  const user = db.data.users.find((u) => u.id === req.userId)!;
  if (!user.mfaEnabled || !user.mfaSecret) throw new ConflictError("mfa_not_enabled");
  if (!totpValid(user.mfaSecret, req.body.code)) throw new UnauthorizedError("invalid_code");
  user.mfaEnabled = false;
  user.mfaSecret = undefined;
  user.recoveryCodes = [];
  db.persist();
  audit(req, "auth.mfa_disabled", user.id);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = db.data.users.find((u) => u.id === req.userId);
  if (!user) throw new UnauthorizedError("invalid_token");
  const {
    passwordHash: _1,
    passwordHistory: _2,
    mfaSecret: _3,
    mfaPendingSecret: _4,
    recoveryCodes: _5,
    ...safe
  } = user;
  res.json(safe);
});
