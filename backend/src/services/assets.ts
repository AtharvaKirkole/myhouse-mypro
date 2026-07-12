/* Asset Service — inventory CRUD + file metadata (files live in S3 in prod). */

import { Router } from "express";
import { HttpError, service } from "../core/http";
import { requireHomePermission } from "../core/rbac";
import { publish } from "../core/events";
import { audit, requireAuth } from "./auth";
import { db, now, uid } from "../db/store";

export const assetsRouter = Router();
assetsRouter.use(service("assets"), requireAuth);

/* presigned-upload mock: client asks where to PUT the file; prod returns S3 URL */
assetsRouter.post(
  "/homes/:homeId/files",
  requireHomePermission("asset:create", (req) => req.params.homeId),
  (req, res) => {
    const { filename, kind = "product", bytes = 0 } = req.body ?? {};
    if (!filename) throw new HttpError(400, "missing_filename");
    const file = {
      id: uid("file"),
      homeId: req.params.homeId,
      kind,
      filename,
      url: `s3://myhouse-uploads/${req.params.homeId}/${filename}`,
      bytes,
      createdAt: now(),
    };
    db.data.files.push(file);
    db.persist();
    res.status(201).json({ ...file, uploadUrl: `${file.url}?presigned=mock` });
  }
);

assetsRouter.post(
  "/homes/:homeId/assets",
  requireHomePermission("asset:create", (req) => req.params.homeId),
  (req, res) => {
    const { name, category = "Other", brand = "", model = "", serial = "", purchased = "", value = "", room = "", x = 0, y = 0 } = req.body ?? {};
    if (!name) throw new HttpError(400, "missing_name");
    const asset = {
      id: uid("ast"),
      homeId: req.params.homeId,
      name, category, brand, model, serial, purchased, value, room,
      x, y,
      createdBy: req.userId!,
      createdAt: now(),
    };
    db.data.assets.push(asset);
    db.persist();
    audit(req, "asset.create", asset.id);
    publish("asset.created", { userId: req.userId, assetId: asset.id, name, homeId: req.params.homeId });
    res.status(201).json(asset);
  }
);

assetsRouter.get(
  "/homes/:homeId/assets",
  requireHomePermission("asset:view", (req) => req.params.homeId),
  (req, res) => {
    res.json(db.data.assets.filter((a) => a.homeId === req.params.homeId));
  }
);

/* twin arrangement: move an icon */
assetsRouter.patch(
  "/homes/:homeId/assets/:assetId/position",
  requireHomePermission("asset:edit", (req) => req.params.homeId),
  (req, res) => {
    const asset = db.data.assets.find((a) => a.id === req.params.assetId && a.homeId === req.params.homeId);
    if (!asset) throw new HttpError(404, "not_found");
    const { x, y, room } = req.body ?? {};
    if (typeof x === "number") asset.x = x;
    if (typeof y === "number") asset.y = y;
    if (room) asset.room = room;
    db.persist();
    res.json(asset);
  }
);

assetsRouter.delete(
  "/homes/:homeId/assets/:assetId",
  requireHomePermission("asset:delete", (req) => req.params.homeId),
  (req, res) => {
    db.data.assets = db.data.assets.filter((a) => !(a.id === req.params.assetId && a.homeId === req.params.homeId));
    db.persist();
    audit(req, "asset.delete", req.params.assetId);
    res.json({ ok: true });
  }
);
