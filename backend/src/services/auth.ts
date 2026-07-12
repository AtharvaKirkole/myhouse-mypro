import { Router, type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "../core/config";
import { HttpError, service } from "../core/http";
import { publish } from "../core/events";
import { db, now, uid, type UserRow } from "../db/store";

/* ---------- password hashing (scrypt, no native deps) ---------- */

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

/* ---------- tokens ---------- */

export function signAccess(user: UserRow): string {
  return jwt.sign(
    { sub: user.id, type: user.accountType, name: user.name },
    config.jwtSecret,
    { expiresIn: config.accessTtl as jwt.SignOptions["expiresIn"] }
  );
}

export function issueRefresh(userId: string, rotatedFrom?: string): string {
  const token = randomBytes(32).toString("hex");
  db.data.refreshTokens.push({
    id: token,
    userId,
    expiresAt: new Date(Date.now() + config.refreshTtlDays * 864e5).toISOString(),
    rotatedFrom,
  });
  db.persist();
  return token;
}

export function rotateRefresh(token: string): { access: string; refresh: string } {
  const row = db.data.refreshTokens.find((t) => t.id === token);
  if (!row || row.expiresAt < now()) throw new HttpError(401, "invalid_refresh");
  const user = db.data.users.find((u) => u.id === row.userId);
  if (!user) throw new HttpError(401, "invalid_refresh");
  // rotation: old token dies, new one is issued
  db.data.refreshTokens = db.data.refreshTokens.filter((t) => t.id !== token);
  const refresh = issueRefresh(user.id, token);
  return { access: signAccess(user), refresh };
}

/* ---------- middleware ---------- */

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "unauthenticated");
  try {
    const claims = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    req.userId = String(claims.sub);
    next();
  } catch {
    throw new HttpError(401, "invalid_token");
  }
}

export function audit(req: Request, action: string, resource: string) {
  db.data.auditLogs.push({
    id: uid("aud"),
    ts: now(),
    requestId: req.requestId,
    userId: req.userId ?? "-",
    action,
    resource,
  });
  db.persist();
}

/* ---------- routes ---------- */

export const authRouter = Router();
authRouter.use(service("auth"));

authRouter.post("/signup", (req, res) => {
  const { email, password, name, accountType = "consumer", proProfile } = req.body ?? {};
  if (!email || !password || !name) throw new HttpError(400, "missing_fields", "email, password, name required");
  if (String(password).length < 8) throw new HttpError(400, "weak_password", "min 8 characters");
  if (db.data.users.some((u) => u.email === email)) throw new HttpError(409, "email_taken");

  const user: UserRow = {
    id: uid("usr"),
    email,
    passwordHash: hashPassword(password),
    name,
    accountType: accountType === "pro" ? "pro" : "consumer",
    mfaEnabled: false,
    proProfile: accountType === "pro" ? proProfile : undefined,
    createdAt: now(),
  };
  db.data.users.push(user);
  db.persist();
  publish("user.signed_up", { userId: user.id, accountType: user.accountType });
  res.status(201).json({
    user: { id: user.id, email, name, accountType: user.accountType },
    access: signAccess(user),
    refresh: issueRefresh(user.id),
  });
});

authRouter.post("/login", (req, res) => {
  const { email, password, mfaCode } = req.body ?? {};
  const user = db.data.users.find((u) => u.email === email);
  if (!user || !verifyPassword(password ?? "", user.passwordHash)) {
    throw new HttpError(401, "bad_credentials");
  }
  if (user.mfaEnabled) {
    // demo TOTP: production swaps in otplib + enrolled secret
    if (mfaCode !== "000000") return res.status(401).json({ error: "mfa_required" });
  }
  res.json({
    user: { id: user.id, email: user.email, name: user.name, accountType: user.accountType },
    access: signAccess(user),
    refresh: issueRefresh(user.id),
  });
});

authRouter.post("/refresh", (req, res) => {
  const { refresh } = req.body ?? {};
  if (!refresh) throw new HttpError(400, "missing_refresh");
  res.json(rotateRefresh(refresh));
});

authRouter.post("/logout", (req, res) => {
  const { refresh } = req.body ?? {};
  db.data.refreshTokens = db.data.refreshTokens.filter((t) => t.id !== refresh);
  db.persist();
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = db.data.users.find((u) => u.id === req.userId);
  if (!user) throw new HttpError(404, "not_found");
  const { passwordHash: _ph, ...safe } = user;
  res.json(safe);
});
