/* User Service — homes, family membership, roles, audit trail. (PostgreSQL) */

import { Router } from "express";
import { service } from "../core/http";
import { NotFoundError, ConflictError } from "../core/errors";
import { authorize } from "../core/rbac";
import { audit, requireAuth } from "./auth";
import { validate, HomeCreateSchema, MemberAddSchema, PageQuerySchema } from "../core/validate";
import { db, notDeleted, now, paginate, softDelete, uid } from "../db/store";

export const usersRouter = Router();
usersRouter.use(service("users"), requireAuth);

/* create a home — creator becomes owner */
usersRouter.post("/homes", validate(HomeCreateSchema), (req, res) => {
  const { name, address, propertyType } = req.body;
  const home = {
    id: uid("home"),
    name: name ?? address,
    address,
    propertyType,
    createdBy: req.userId!,
    createdAt: now(),
    version: 1,
  };
  db.data.homes.push(home);
  db.data.members.push({ id: uid("mem"), homeId: home.id, userId: req.userId!, role: "owner" });
  db.persist();
  audit(req, "home.create", home.id, { after: { address, propertyType } });
  res.status(201).json(home);
});

usersRouter.get("/homes", (req, res) => {
  const memberships = db.data.members.filter((m) => m.userId === req.userId && (!m.expiresAt || m.expiresAt > now()));
  const homes = memberships
    .map((m) => ({ home: db.data.homes.find((h) => h.id === m.homeId), role: m.role }))
    .filter((x) => x.home && notDeleted(x.home))
    .map((x) => ({ ...x.home!, role: x.role }));
  res.json(homes);
});

usersRouter.get(
  "/homes/:homeId",
  authorize("view", "home", (req) => req.params.homeId),
  (req, res) => {
    const home = db.data.homes.find((h) => h.id === req.params.homeId && notDeleted(h));
    if (!home) throw new NotFoundError();
    const members = db.data.members
      .filter((m) => m.homeId === home.id && (!m.expiresAt || m.expiresAt > now()))
      .map((m) => {
        const u = db.data.users.find((x) => x.id === m.userId);
        return { userId: m.userId, name: u?.name, role: m.role, expiresAt: m.expiresAt };
      });
    res.json({ ...home, members });
  }
);

/* family management — invite with role; contractor access is time-boxed */
usersRouter.post(
  "/homes/:homeId/members",
  authorize("manage", "family", (req) => req.params.homeId),
  validate(MemberAddSchema),
  (req, res) => {
    const { email, role, expiresInDays } = req.body;
    const target = db.data.users.find((u) => u.email === email);
    if (!target) throw new NotFoundError("user_not_found", "invite flow would email them in production");
    if (db.data.members.some((m) => m.homeId === req.params.homeId && m.userId === target.id)) {
      throw new ConflictError("already_member");
    }
    // contractors always expire; default 7 days if not specified
    const days = role === "contractor" ? (expiresInDays ?? 7) : expiresInDays;
    const member = {
      id: uid("mem"),
      homeId: req.params.homeId,
      userId: target.id,
      role,
      expiresAt: days ? new Date(Date.now() + days * 864e5).toISOString() : undefined,
    };
    db.data.members.push(member);
    db.persist();
    audit(req, "member.add", target.id, { after: { role, expiresAt: member.expiresAt } });
    res.status(201).json(member);
  }
);

usersRouter.delete(
  "/homes/:homeId/members/:memberId",
  authorize("manage", "family", (req) => req.params.homeId),
  (req, res) => {
    const member = db.data.members.find((m) => m.id === req.params.memberId && m.homeId === req.params.homeId);
    if (!member) throw new NotFoundError();
    if (member.role === "owner") throw new ConflictError("cannot_remove_owner");
    db.data.members = db.data.members.filter((m) => m.id !== member.id);
    db.persist();
    audit(req, "member.remove", member.userId, { before: { role: member.role } });
    res.json({ ok: true });
  }
);

/* soft delete — recoverable, memberships expire */
usersRouter.delete(
  "/homes/:homeId",
  authorize("delete", "home", (req) => req.params.homeId),
  (req, res) => {
    const home = db.data.homes.find((h) => h.id === req.params.homeId && notDeleted(h));
    if (!home) throw new NotFoundError();
    softDelete(home);
    for (const m of db.data.members.filter((x) => x.homeId === home.id)) m.expiresAt = now();
    db.persist();
    audit(req, "home.delete", home.id, { before: { address: home.address } });
    res.json({ ok: true, softDeleted: true });
  }
);

usersRouter.get(
  "/homes/:homeId/audit",
  authorize("view", "audit", (req) => req.params.homeId),
  validate(PageQuerySchema, "query"),
  (req, res) => {
    const all = db.data.auditLogs.filter((a) => a.resource === req.params.homeId).reverse();
    res.json(paginate(all, req.query.page as unknown as number, req.query.limit as unknown as number));
  }
);
