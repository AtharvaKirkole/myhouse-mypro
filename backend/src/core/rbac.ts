/*
 * RBAC: Role → Permission → Resource. Nothing hardcoded at call sites —
 * services ask `can(role, permission)` or use `requireHomePermission(...)`.
 */

import type { NextFunction, Request, Response } from "express";
import { db } from "../db/store";
import { HttpError } from "./http";

export type Permission =
  | "home:view"
  | "home:edit"
  | "home:delete"
  | "asset:view"
  | "asset:create"
  | "asset:edit"
  | "asset:delete"
  | "warranty:view"
  | "warranty:manage"
  | "utilities:view"
  | "family:manage"
  | "job:create"
  | "job:view"
  | "payment:manage"
  | "audit:view"
  | "chores:view"
  | "emergency:view";

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: [
    "home:view", "home:edit", "home:delete",
    "asset:view", "asset:create", "asset:edit", "asset:delete",
    "warranty:view", "warranty:manage", "utilities:view",
    "family:manage", "job:create", "job:view",
    "payment:manage", "audit:view", "chores:view", "emergency:view",
  ],
  co_owner: [
    "home:view", "home:edit",
    "asset:view", "asset:create", "asset:edit", "asset:delete",
    "warranty:view", "warranty:manage", "utilities:view",
    "family:manage", "job:create", "job:view",
    "payment:manage", "chores:view", "emergency:view",
  ],
  roommate: ["home:view", "asset:view", "utilities:view", "job:create", "job:view", "emergency:view"],
  tenant: ["home:view", "asset:view", "utilities:view", "job:create", "job:view", "emergency:view"],
  child: ["home:view", "chores:view", "emergency:view"],
  guest: ["emergency:view"],
  property_manager: [
    "home:view", "home:edit", "asset:view", "asset:create", "asset:edit",
    "warranty:view", "utilities:view", "job:create", "job:view", "payment:manage",
  ],
};

export function can(role: string, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

export function roleInHome(userId: string, homeId: string): string | null {
  const m = db.data.members.find((x) => x.homeId === homeId && x.userId === userId);
  return m?.role ?? null;
}

/** Express guard: resolves the caller's role in the target home, checks the permission. */
export function requireHomePermission(permission: Permission, homeIdFrom: (req: Request) => string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const homeId = homeIdFrom(req);
    if (!req.userId) throw new HttpError(401, "unauthenticated");
    const role = roleInHome(req.userId, homeId);
    if (!role) throw new HttpError(403, "not_a_member", "You are not a member of this home");
    if (!can(role, permission)) {
      throw new HttpError(403, "forbidden", `Role '${role}' lacks '${permission}'`);
    }
    next();
  };
}
