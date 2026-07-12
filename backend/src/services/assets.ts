/* Asset Service — inventory CRUD + file metadata (files live in S3 in prod). */

import { createHash } from "node:crypto";
import { Router } from "express";
import { service } from "../core/http";
import { ConflictError, NotFoundError } from "../core/errors";
import { authorize } from "../core/rbac";
import { publish } from "../core/events";
import { audit, requireAuth } from "./auth";
import { validate, AssetCreateSchema, AssetPositionSchema, FileCreateSchema, PageQuerySchema } from "../core/validate";
import { db, notDeleted, now, paginate, softDelete, touch, uid } from "../db/store";
import { appendAssetEvent } from "../intelligence/learning";

export const assetsRouter = Router();
assetsRouter.use(service("assets"), requireAuth);

/*
 * File upload security (S3 in production, metadata here):
 *  - schema enforces safe filenames (no traversal), mime whitelist, size cap
 *  - sha256 supports duplicate detection
 *  - stored under a server-generated key — client names never become paths
 *  - production pipeline: magic-byte sniff → virus scan → EXIF strip →
 *    optimize → thumbnail → OCR queue (all behind the presigned URL flow)
 */
assetsRouter.post(
  "/homes/:homeId/files",
  authorize("create", "asset", (req) => req.params.homeId),
  validate(FileCreateSchema),
  (req, res) => {
    const { filename, kind, bytes, mime, sha256 } = req.body;
    if (sha256 && db.data.files.some((f) => f.homeId === req.params.homeId && f.sha256 === sha256 && notDeleted(f))) {
      throw new ConflictError("duplicate_file", "identical file already uploaded");
    }
    const safeKey = createHash("sha256").update(`${req.params.homeId}:${filename}:${now()}`).digest("hex").slice(0, 24);
    const file = {
      id: uid("file"),
      homeId: req.params.homeId,
      kind,
      filename,
      url: `s3://myhouse-uploads/${req.params.homeId}/${safeKey}`,
      bytes,
      mime,
      sha256,
      createdAt: now(),
    };
    db.data.files.push(file);
    db.persist();
    res.status(201).json({ ...file, uploadUrl: `${file.url}?presigned=mock&expires=900` });
  }
);

assetsRouter.post(
  "/homes/:homeId/assets",
  authorize("create", "asset", (req) => req.params.homeId),
  validate(AssetCreateSchema),
  (req, res) => {
    const asset = {
      id: uid("ast"),
      homeId: req.params.homeId,
      ...req.body,
      createdBy: req.userId!,
      createdAt: now(),
      version: 1,
    };
    db.data.assets.push(asset);
    db.persist();
    audit(req, "asset.create", asset.id, { after: { name: asset.name, brand: asset.brand } });
    publish("asset.created", { userId: req.userId, assetId: asset.id, name: asset.name, homeId: req.params.homeId });
    res.status(201).json(asset);
  }
);

assetsRouter.get(
  "/homes/:homeId/assets",
  authorize("view", "asset", (req) => req.params.homeId),
  validate(PageQuerySchema, "query"),
  (req, res) => {
    const all = db.data.assets.filter((a) => a.homeId === req.params.homeId && notDeleted(a));
    res.json(paginate(all, req.query.page as unknown as number, req.query.limit as unknown as number));
  }
);

/* twin arrangement: move an icon (optimistic locking via version) */
assetsRouter.patch(
  "/homes/:homeId/assets/:assetId/position",
  authorize("edit", "asset", (req) => req.params.homeId),
  validate(AssetPositionSchema),
  (req, res) => {
    const asset = db.data.assets.find(
      (a) => a.id === req.params.assetId && a.homeId === req.params.homeId && notDeleted(a)
    );
    if (!asset) throw new NotFoundError();
    const { x, y, room, version } = req.body;
    const before = { x: asset.x, y: asset.y, room: asset.room };
    touch(asset, version); // throws ConflictError on stale version
    if (typeof x === "number") asset.x = x;
    if (typeof y === "number") asset.y = y;
    if (room) asset.room = room;
    db.persist();
    // append-only history: moves accumulate, they never overwrite the past
    appendAssetEvent({
      assetId: asset.id, homeId: asset.homeId, kind: "moved",
      before, after: { x: asset.x, y: asset.y, room: asset.room },
      actorId: req.userId, requestId: req.requestId,
    });
    res.json(asset);
  }
);

/* full append-only history for one asset: lifecycle events + repairs */
assetsRouter.get(
  "/homes/:homeId/assets/:assetId/history",
  authorize("view", "asset", (req) => req.params.homeId),
  (req, res) => {
    const asset = db.data.assets.find((a) => a.id === req.params.assetId && a.homeId === req.params.homeId);
    if (!asset) throw new NotFoundError();
    const events = db.data.assetEvents
      .filter((e) => e.assetId === asset.id)
      .sort((a, b) => (a.ts < b.ts ? 1 : -1));
    const repairs = db.data.repairRecords
      .filter((r) => r.assetId === asset.id)
      .map((r) => ({
        jobId: r.jobId, issueCategory: r.issueCategory, rootCause: r.rootCause,
        partsReplaced: r.partsReplaced, costCents: r.costCents, createdAt: r.createdAt,
      }));
    res.json({ assetId: asset.id, events, repairs });
  }
);

assetsRouter.delete(
  "/homes/:homeId/assets/:assetId",
  authorize("delete", "asset", (req) => req.params.homeId),
  (req, res) => {
    const asset = db.data.assets.find(
      (a) => a.id === req.params.assetId && a.homeId === req.params.homeId && notDeleted(a)
    );
    if (!asset) throw new NotFoundError();
    softDelete(asset);
    db.persist();
    audit(req, "asset.delete", asset.id, { before: { name: asset.name } });
    appendAssetEvent({
      assetId: asset.id, homeId: asset.homeId, kind: "deleted",
      before: { name: asset.name }, actorId: req.userId, requestId: req.requestId,
    });
    res.json({ ok: true, softDeleted: true });
  }
);
