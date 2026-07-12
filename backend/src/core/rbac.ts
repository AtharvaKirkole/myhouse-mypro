/*
 * Enterprise RBAC: Role → Permission → Resource → Action, evaluated by a
 * single policy engine. Services never scatter permission checks — they mount
 * `authorize(action, resource, homeIdFrom)` middleware.
 *
 * Tenant isolation lives here too: the home is the tenant boundary. A caller
 * who is not a member of the target home receives 404 (never 403) so that
 * home ids cannot be probed for existence (IDOR / BOLA defense). Ids are
 * UUID-based, so sequential guessing is also impossible.
 */

import type { NextFunction, Request, Response } from "express";
import { db } from "../db/store";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "./errors";

export type Action = "view" | "create" | "edit" | "delete" | "manage";
export type Resource =
  | "home" | "asset" | "warranty" | "utilities" | "family" | "job" | "payment" | "audit" | "chores" | "emergency"
  | "intel"; // knowledge graph, predictions, recommendations — home-scoped intelligence

type Policy = Partial<Record<Resource, Action[]>>;

const FULL: Action[] = ["view", "create", "edit", "delete", "manage"];
const READ: Action[] = ["view"];

export const POLICIES: Record<string, Policy> = {
  admin: Object.fromEntries(
    (
      [
        "home",
        "asset",
        "warranty",
        "utilities",
        "family",
        "job",
        "payment",
        "audit",
        "chores",
        "emergency",
        "intel",
      ] as Resource[]
    ).map((r) => [r, FULL])
  ),
  owner: {
    home: FULL,
    asset: FULL,
    warranty: ["view", "create", "edit", "delete", "manage"],
    utilities: READ,
    family: ["view", "manage"],
    job: ["view", "create", "edit", "manage"],
    payment: ["view", "manage"],
    audit: READ,
    chores: ["view", "manage"],
    emergency: READ,
    intel: READ,
  },
  co_owner: {
    home: ["view", "edit"],
    asset: FULL,
    warranty: ["view", "create", "edit", "manage"],
    utilities: READ,
    family: ["view", "manage"],
    job: ["view", "create", "edit", "manage"],
    payment: ["view", "manage"],
    chores: ["view", "manage"],
    emergency: READ,
    intel: READ,
  },
  property_manager: {
    home: ["view", "edit"],
    asset: ["view", "create", "edit"],
    warranty: READ,
    utilities: READ,
    job: ["view", "create", "edit", "manage"],
    payment: ["view", "manage"],
    emergency: READ,
    intel: READ,
  },
  roommate: {
    home: READ,
    asset: READ,
    utilities: READ, // roommates share bills…
    job: ["view", "create"],
    emergency: READ,
    intel: READ, // …predictions/maintenance affect the household they live in
    // …but warranties (financial documents) are deliberately absent
  },
  tenant: {
    home: READ,
    asset: READ,
    utilities: READ,
    job: ["view", "create"],
    emergency: READ,
    // intel deliberately absent: equity/valuation-adjacent data stays with owners
  },
  child: {
    home: READ,
    chores: READ,
    emergency: READ,
  },
  /** contractor: temporary scoped access — membership rows carry expiresAt */
  contractor: {
    job: READ,
    asset: READ,
    emergency: READ,
  },
  /** guest: strictly read-only, emergency info only */
  guest: {
    emergency: READ,
  },
};

export function canAct(role: string, action: Action, resource: Resource): boolean {
  return (POLICIES[role]?.[resource] ?? []).includes(action);
}

/** Back-compat string form: "asset:create" → (asset, create). */
export type Permission = `${Resource}:${Action | "manage"}` | string;

export function can(role: string, permission: Permission): boolean {
  const [resource, action] = permission.split(":") as [Resource, Action];
  if (!resource || !action) return false;
  return canAct(role, action, resource);
}

/** Resolves the caller's role in a home. Expired memberships don't count. */
export function roleInHome(userId: string, homeId: string): string | null {
  const m = db.data.members.find((x) => x.homeId === homeId && x.userId === userId);
  if (!m) return null;
  if (m.expiresAt && m.expiresAt < new Date().toISOString()) return null; // contractor/guest expiry
  return m.role;
}

/**
 * Policy middleware — the only authorization gate in the codebase.
 * Order of checks: authenticated → home exists & caller is a member (404
 * otherwise, tenant isolation) → role allows action on resource (403).
 */
export function authorize(action: Action, resource: Resource, homeIdFrom: (req: Request) => string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.userId) return next(new UnauthorizedError());
    const homeId = homeIdFrom(req);
    req.houseId = homeId;

    const user = db.data.users.find((u) => u.id === req.userId);
    if (user?.isAdmin) return next(); // admin: full access

    const home = db.data.homes.find((h) => h.id === homeId && !h.deletedAt);
    const role = home ? roleInHome(req.userId, homeId) : null;
    if (!home || !role) {
      // non-member and nonexistent look identical — no existence oracle
      return next(new NotFoundError("not_found"));
    }
    if (!canAct(role, action, resource)) {
      return next(new ForbiddenError("forbidden", `Role '${role}' may not ${action} ${resource}`));
    }
    next();
  };
}

/** Back-compat wrapper: "asset:create" string form. */
export function requireHomePermission(permission: Permission, homeIdFrom: (req: Request) => string) {
  const [resource, action] = permission.split(":") as [Resource, Action];
  return authorize(action, resource, homeIdFrom);
}
