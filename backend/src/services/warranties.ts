/* Warranty Service — parser, reminder engine, CRUD. (PostgreSQL; reminders via event queue) */

import { Router } from "express";
import { HttpError, service } from "../core/http";
import { requireHomePermission } from "../core/rbac";
import { publish } from "../core/events";
import { requireAuth } from "./auth";
import { validate, WarrantyCreateSchema } from "../core/validate";
import { db, now, uid, type WarrantyRow } from "../db/store";

/* ---------- warranty text parser (unit-tested) ----------
   Extracts an expiry date from OCR'd receipt / warranty text. Handles:
   - explicit dates ("valid until 03/15/2028", "expires March 2028")
   - durations from a purchase date ("2 year warranty", "24-month coverage") */

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function parseWarranty(
  text: string,
  purchaseDate?: Date
): { expiresAt: Date | null; termMonths: number | null } {
  const t = text.toLowerCase();

  // explicit mm/dd/yyyy or m/d/yy
  const slash = t.match(/(?:until|through|expires?[^\d]*)\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const [, m, d, yRaw] = slash;
    const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    return { expiresAt: new Date(y, Number(m) - 1, Number(d)), termMonths: null };
  }

  // "expires March 2028" / "valid until march 15, 2028"
  const monthRe = new RegExp(`(?:until|through|expires?)[^a-z0-9]*(${MONTHS.join("|")})\\s*(\\d{1,2})?,?\\s*(\\d{4})`);
  const named = t.match(monthRe);
  if (named) {
    const [, mon, d, y] = named;
    return { expiresAt: new Date(Number(y), MONTHS.indexOf(mon), Number(d ?? 1)), termMonths: null };
  }

  // durations: "2 year", "2-year", "24 month(s)"
  const dur = t.match(/(\d{1,3})[\s-]*(year|yr|month|mo)s?\b/);
  if (dur) {
    const n = Number(dur[1]);
    const months = dur[2].startsWith("y") ? n * 12 : n;
    if (purchaseDate) {
      const exp = new Date(purchaseDate);
      exp.setMonth(exp.getMonth() + months);
      return { expiresAt: exp, termMonths: months };
    }
    return { expiresAt: null, termMonths: months };
  }

  return { expiresAt: null, termMonths: null };
}

/* ---------- reminder engine (unit-tested) ----------
   Given a warranty and "now", which reminder windows (days-before) are due
   and not yet sent? */

export const REMINDER_WINDOWS = [90, 30, 7];

export function dueReminders(w: Pick<WarrantyRow, "expiresAt" | "remindersSent">, at: Date): number[] {
  const msLeft = new Date(w.expiresAt).getTime() - at.getTime();
  if (msLeft < 0) return [];
  const daysLeft = msLeft / 864e5;
  return REMINDER_WINDOWS.filter((win) => daysLeft <= win && !w.remindersSent.includes(win));
}

/** scan all warranties, publish expiring events — called by the scheduler */
export function runReminderScan(at = new Date()) {
  for (const w of db.data.warranties) {
    for (const win of dueReminders(w, at)) {
      w.remindersSent.push(win);
      const owner = db.data.members.find((m) => m.homeId === w.homeId && m.role === "owner");
      publish("warranty.expiring", {
        userId: owner?.userId,
        warrantyId: w.id,
        item: w.item,
        expiresAt: w.expiresAt,
        window: win,
      });
    }
  }
  db.persist();
}

/* ---------- routes ---------- */

export const warrantiesRouter = Router();
warrantiesRouter.use(service("warranties"), requireAuth);

warrantiesRouter.post(
  "/homes/:homeId/warranties",
  requireHomePermission("warranty:manage", (req) => req.params.homeId),
  validate(WarrantyCreateSchema),
  (req, res) => {
    const { item, provider, expiresAt, ocrText, purchaseDate, assetId, source } = req.body;

    let expiry = expiresAt ? new Date(expiresAt) : null;
    if (!expiry && ocrText) {
      expiry = parseWarranty(ocrText, purchaseDate ? new Date(purchaseDate) : undefined).expiresAt;
    }
    if (!expiry) throw new HttpError(422, "cannot_determine_expiry", "provide expiresAt or parseable ocrText");

    const w: WarrantyRow = {
      id: uid("war"),
      homeId: req.params.homeId,
      assetId,
      item,
      provider,
      expiresAt: expiry.toISOString(),
      source,
      remindersSent: [],
      createdAt: now(),
    };
    db.data.warranties.push(w);
    db.persist();
    runReminderScan(); // immediate scan so near-expiry uploads notify right away
    res.status(201).json(w);
  }
);

warrantiesRouter.get(
  "/homes/:homeId/warranties",
  requireHomePermission("warranty:view", (req) => req.params.homeId),
  (req, res) => {
    res.json(db.data.warranties.filter((w) => w.homeId === req.params.homeId));
  }
);
