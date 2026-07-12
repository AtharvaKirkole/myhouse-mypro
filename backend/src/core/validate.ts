/*
 * Centralized validation — every endpoint declares a schema; controllers
 * never hand-roll checks. Invalid input → ValidationError with field details.
 */

import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { ValidationError } from "./errors";

export function validate<S extends z.ZodTypeAny>(schema: S, source: "body" | "query" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      return next(new ValidationError(details));
    }
    // replace the (possibly getter-backed) source with the parsed, typed data
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}

/* ---------- shared primitives ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** entity ids are `${prefix}_${uuid}` — sequential/guessable ids don't exist */
const ID_RE = /^[a-z]+_[0-9a-f-]{12,}$/;
const SAFE_FILENAME_RE = /^[\w][\w .()-]{0,120}$/; // no path separators, no traversal

export const email = z.string().trim().toLowerCase().regex(EMAIL_RE, "invalid email");
export const entityId = z.string().regex(ID_RE, "invalid id format");
export const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "invalid date");
export const safeFilename = z.string().regex(SAFE_FILENAME_RE, "unsafe filename");

/* ---------- auth ---------- */

export const SignupSchema = z.object({
  email,
  password: z.string().min(10).max(128),
  name: z.string().trim().min(1).max(80),
  accountType: z.enum(["consumer", "pro"]).default("consumer"),
  deviceName: z.string().max(80).optional(),
  proProfile: z
    .object({
      business: z.string().max(120),
      professions: z.array(z.string().max(40)).max(10),
      license: z.string().max(60),
      insurance: z.string().max(120),
      radiusMi: z.number().min(1).max(200),
      baseCity: z.string().max(80),
      emergency: z.boolean(),
    })
    .optional(),
});

export const LoginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
  mfaCode: z.string().max(16).optional(),
  recoveryCode: z.string().max(32).optional(),
  deviceId: z.string().max(64).optional(),
  deviceName: z.string().max(80).optional(),
});

export const RefreshSchema = z.object({ refresh: z.string().min(32).max(128) });

export const ForgotSchema = z.object({ email });
export const ResetSchema = z.object({ token: z.string().min(16).max(128), password: z.string().min(10).max(128) });
export const ChangePasswordSchema = z.object({ current: z.string().min(1), next: z.string().min(10).max(128) });
export const VerifyEmailSchema = z.object({ token: z.string().min(16).max(128) });
export const MfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, "6 digits") });

/* ---------- homes & family ---------- */

export const HomeCreateSchema = z.object({
  name: z.string().trim().max(120).optional(),
  address: z.string().trim().min(3).max(200),
  propertyType: z.enum(["Single family", "Condo", "Townhouse", "Apartment", "Other"]).default("Single family"),
});

export const MemberAddSchema = z.object({
  email,
  role: z
    .enum(["co_owner", "roommate", "tenant", "child", "guest", "property_manager", "contractor"])
    .default("roommate"),
  /** contractor access is temporary — days until membership expires */
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

/* ---------- assets & files ---------- */

export const AssetCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().max(40).default("Other"),
  brand: z.string().max(60).default(""),
  model: z.string().max(80).default(""),
  serial: z.string().max(60).default(""),
  purchased: z.string().max(30).default(""),
  value: z.string().max(20).default(""),
  room: z.string().max(60).default(""),
  x: z.number().min(0).max(2000).default(0),
  y: z.number().min(0).max(2000).default(0),
});

export const AssetPositionSchema = z.object({
  x: z.number().min(0).max(2000).optional(),
  y: z.number().min(0).max(2000).optional(),
  room: z.string().max(60).optional(),
  version: z.number().int().optional(), // optimistic locking
});

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export const FileCreateSchema = z.object({
  filename: safeFilename,
  kind: z.enum(["receipt", "warranty", "product", "manual", "video", "serial"]).default("product"),
  bytes: z
    .number()
    .int()
    .min(1)
    .max(25 * 1024 * 1024),
  mime: z.enum(ALLOWED_MIME as [string, ...string[]]).default("image/jpeg"),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(), // duplicate detection
});

/* ---------- warranties ---------- */

export const WarrantyCreateSchema = z
  .object({
    item: z.string().trim().min(1).max(120),
    provider: z.string().max(80).default("—"),
    expiresAt: isoDate.optional(),
    ocrText: z.string().max(4000).optional(),
    purchaseDate: isoDate.optional(),
    assetId: entityId.optional(),
    source: z.string().max(60).default("manual"),
  })
  .refine((w) => w.expiresAt || w.ocrText, { message: "expiresAt or ocrText required" });

/* ---------- marketplace ---------- */

export const JobCreateSchema = z.object({
  description: z.string().trim().min(10).max(2000),
});

export const BidCreateSchema = z.object({
  price: z.number().positive().max(100000),
  etaLabel: z.string().max(60).default("This week"),
  warranty: z.string().max(40).default("1 year"),
});

export const AcceptBidSchema = z.object({
  jobVersion: z.number().int().optional(), // optimistic locking
});

/** structured repair capture at completion — feeds the intelligence platform */
export const CompleteJobSchema = z.object({
  assetId: entityId.optional(),
  rootCause: z.string().trim().max(120).optional(),
  partsReplaced: z.array(z.string().trim().max(60)).max(10).default([]),
  laborMinutes: z.number().int().min(1).max(960).default(60),
  costCents: z.number().int().min(0).max(10_000_000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  warrantyCovered: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
  zip: z.string().regex(/^\d{5}$/, "5-digit ZIP").optional(),
});

/* ---------- intelligence ---------- */

export const DiagnoseSchema = z.object({
  description: z.string().trim().min(10).max(2000),
  homeId: entityId.optional(),
  assetId: entityId.optional(),
});

export const ReliabilityQuerySchema = z.object({
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().max(80).optional(),
});

export const RegionQuerySchema = z.object({
  category: z.string().trim().max(40).optional(),
});

export const ContractorSuccessQuerySchema = z.object({
  brand: z.string().trim().min(1).max(60),
  minRate: z.coerce.number().min(0).max(1).default(0.9),
});

export const RepeatRepairsQuerySchema = z.object({
  brand: z.string().trim().max(60).optional(),
  minRepairs: z.coerce.number().int().min(1).max(20).default(2),
});

/* ---------- payments ---------- */

export const RefundSchema = z.object({
  amountCents: z.number().int().positive().optional(), // omitted = full refund
});

/* ---------- AI ---------- */

export const ExtractSchema = z.object({
  filenames: z.array(safeFilename).min(1).max(10),
});

/* ---------- search / pagination ---------- */

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export const PageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/* ---------- notifications ---------- */

export const PreferencesSchema = z.object({
  push: z.boolean().default(true),
  email: z.boolean().default(true),
  sms: z.boolean().default(false),
  quietHoursStart: z.number().int().min(0).max(23).nullable().default(null),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().default(null),
});
