/* User Service — homes, family membership, roles, audit trail. (PostgreSQL) */

import { Router } from "express";
import { HttpError, service } from "../core/http";
import { requireHomePermission } from "../core/rbac";
import { audit, requireAuth } from "./auth";
import { db, now, uid } from "../db/store";

export const usersRouter = Router();
usersRouter.use(service("users"), requireAuth);

/* create a home — creator becomes owner */
usersRouter.post("/homes", (req, res) => {
  const { name, address, propertyType = "Single family" } = req.body ?? {};
  if (!address) throw new HttpError(400, "missing_address");
  const home = { id: uid("home"), name: name ?? address, address, propertyType, createdBy: req.userId!, createdAt: now() };
  db.data.homes.push(home);
  db.data.members.push({ id: uid("mem"), homeId: home.id, userId: req.userId!, role: "owner" });
  db.persist();
  audit(req, "home.create", home.id);
  res.status(201).json(home);
});

usersRouter.get("/homes", (req, res) => {
  const memberships = db.data.members.filter((m) => m.userId === req.userId);
  const homes = memberships.map((m) => ({
    ...db.data.homes.find((h) => h.id === m.homeId)!,
    role: m.role,
  }));
  res.json(homes);
});

usersRouter.get(
  "/homes/:homeId",
  requireHomePermission("home:view", (req) => req.params.homeId),
  (req, res) => {
    const home = db.data.homes.find((h) => h.id === req.params.homeId);
    if (!home) throw new HttpError(404, "not_found");
    const members = db.data.members
      .filter((m) => m.homeId === home.id)
      .map((m) => {
        const u = db.data.users.find((x) => x.id === m.userId);
        return { userId: m.userId, name: u?.name, role: m.role };
      });
    res.json({ ...home, members });
  }
);

/* family management — owner/co-owner only */
usersRouter.post(
  "/homes/:homeId/members",
  requireHomePermission("family:manage", (req) => req.params.homeId),
  (req, res) => {
    const { email, role = "roommate" } = req.body ?? {};
    const target = db.data.users.find((u) => u.email === email);
    if (!target) throw new HttpError(404, "user_not_found", "invite flow would email them in production");
    if (db.data.members.some((m) => m.homeId === req.params.homeId && m.userId === target.id)) {
      throw new HttpError(409, "already_member");
    }
    const member = { id: uid("mem"), homeId: req.params.homeId, userId: target.id, role };
    db.data.members.push(member);
    db.persist();
    audit(req, `member.add:${role}`, target.id);
    res.status(201).json(member);
  }
);

usersRouter.delete(
  "/homes/:homeId",
  requireHomePermission("home:delete", (req) => req.params.homeId),
  (req, res) => {
    db.data.homes = db.data.homes.filter((h) => h.id !== req.params.homeId);
    db.data.members = db.data.members.filter((m) => m.homeId !== req.params.homeId);
    db.persist();
    audit(req, "home.delete", req.params.homeId);
    res.json({ ok: true });
  }
);

usersRouter.get(
  "/homes/:homeId/audit",
  requireHomePermission("audit:view", (req) => req.params.homeId),
  (req, res) => {
    res.json(db.data.auditLogs.filter((a) => a.resource === req.params.homeId).slice(-100));
  }
);
