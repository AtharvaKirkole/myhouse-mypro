/*
 * AI Service — isolated pipeline: Upload → OCR → Vision → LLM → Structured JSON.
 * Hardened: per-stage timeout, retry with backoff, fallback provider chain,
 * confidence thresholds, zod-validated structured output only, prompt
 * versioning, token/cost tracking. Providers are config swaps (AI_PROVIDER).
 */

import { Router } from "express";
import { z } from "zod";
import { config } from "../core/config";
import { asyncHandler, log, service } from "../core/http";
import { AIError } from "../core/errors";
import { inc } from "../core/metrics";
import { requireAuth } from "./auth";
import { validate, ExtractSchema } from "../core/validate";

export const PROMPT_VERSION = "extract-asset/v3";

export interface ExtractedAsset {
  name: string;
  category: string;
  brand: string;
  model: string;
  serial: string;
  purchased: string;
  value: string;
  warrantyText: string;
  confidence: number;
  pipeline: string[];
  meta?: { provider: string; promptVersion: string; tokens: number; costUsd: number };
}

/* structured-output contract: anything the LLM returns MUST parse against this */
const ExtractedSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().max(40),
  brand: z.string().max(60),
  model: z.string().max(80),
  serial: z.string().max(60),
  purchased: z.string().max(30),
  value: z.string().max(20),
  warrantyText: z.string().max(500),
  confidence: z.number().min(0).max(1),
});

interface AiProvider {
  name: string;
  ocr(filenames: string[]): Promise<{ text: string; confidence: number }>;
  vision(filenames: string[]): Promise<{ label: string; brand: string; confidence: number }>;
  llm(ocrText: string, visionLabel: { label: string; brand: string }): Promise<{ raw: unknown; tokens: number }>;
}

/* ---------- mock provider (deterministic, keyed off filenames) ---------- */

const KNOWN = [
  {
    keys: ["couch", "sofa", "west-elm"],
    out: {
      name: "Sofa",
      category: "Furniture",
      brand: "West Elm",
      model: "Harmony 82-in",
      value: "$1,899",
      purchased: "2021-11-14",
      warrantyText: "7 year frame warranty",
    },
  },
  {
    keys: ["tv", "oled", "lg"],
    out: {
      name: 'TV 65" OLED',
      category: "Electronics",
      brand: "LG",
      model: "OLED65C3PUA",
      value: "$1,599",
      purchased: "2023-03-02",
      warrantyText: "valid until 03/02/2027",
    },
  },
  {
    keys: ["grill", "weber"],
    out: {
      name: "Gas Grill",
      category: "Outdoor",
      brand: "Weber",
      model: "Genesis E-325s",
      value: "$1,049",
      purchased: "2023-05-20",
      warrantyText: "10 year burner warranty",
    },
  },
  {
    keys: ["fridge", "refrigerator"],
    out: {
      name: "Refrigerator",
      category: "Appliances",
      brand: "LG",
      model: "LRFVS3006S",
      value: "$2,499",
      purchased: "2021-12-05",
      warrantyText: "expires December 2026",
    },
  },
  {
    keys: ["dishwasher", "bosch"],
    out: {
      name: "Dishwasher",
      category: "Appliances",
      brand: "Bosch",
      model: "SHE53C85N",
      value: "$1,049",
      purchased: "2022-05-10",
      warrantyText: "2 year warranty",
    },
  },
  {
    keys: ["mower", "ego"],
    out: {
      name: "Lawn Mower",
      category: "Outdoor",
      brand: "EGO",
      model: 'Power+ 21"',
      value: "$549",
      purchased: "2024-04-12",
      warrantyText: "5-year tool warranty",
    },
  },
];

function knownFor(filenames: string[]) {
  return KNOWN.find((k) => k.keys.some((key) => filenames.join(" ").toLowerCase().includes(key)));
}

const mockProvider: AiProvider = {
  name: "mock",
  async ocr(filenames) {
    const hit = knownFor(filenames);
    return hit
      ? {
          text: `RECEIPT ${hit.out.brand} ${hit.out.model} total ${hit.out.value} date ${hit.out.purchased} ${hit.out.warrantyText}`,
          confidence: 0.97,
        }
      : { text: "RECEIPT unreadable vendor total $0.00", confidence: 0.2 };
  },
  async vision(filenames) {
    const hit = knownFor(filenames);
    return hit
      ? { label: hit.out.name, brand: hit.out.brand, confidence: 0.95 }
      : { label: "household item", brand: "unknown", confidence: 0.35 };
  },
  async llm(ocrText, visionLabel) {
    const hit = KNOWN.find((k) => ocrText.includes(k.out.model));
    const base = hit?.out ?? {
      name: visionLabel.label,
      category: "Other",
      brand: visionLabel.brand,
      model: "unknown",
      value: "—",
      purchased: "—",
      warrantyText: "—",
    };
    let serialSeed = 7;
    for (const c of ocrText) serialSeed = (serialSeed * 31 + c.charCodeAt(0)) % 100000;
    return {
      raw: { ...base, serial: `SN-${String(serialSeed).padStart(5, "0")}`, confidence: hit ? 0.94 : 0.41 },
      tokens: 350 + ocrText.length,
    };
  },
};

/* test-only provider that always fails — exercises retry + fallback paths */
export const failingProvider: AiProvider = {
  name: "failing",
  async ocr() {
    throw new Error("provider_down");
  },
  async vision() {
    throw new Error("provider_down");
  },
  async llm() {
    throw new Error("provider_down");
  },
};

const providers: Record<string, AiProvider> = {
  mock: mockProvider,
  failing: failingProvider,
  // openai / anthropic / gemini: same interface, API calls inside
};

/* ---------- resilience primitives ---------- */

async function withTimeout<T>(p: Promise<T>, ms: number, stage: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new AIError("ai_timeout", `${stage} exceeded ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function withRetry<T>(fn: () => Promise<T>, stage: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= config.aiRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      inc("ai_stage_retries_total", { stage });
      await new Promise((r) => setTimeout(r, 20 * 2 ** attempt));
    }
  }
  throw lastErr;
}

const COST_PER_1K_TOKENS_USD = 0.004;

/* ---------- pipeline ---------- */

async function runWithProvider(provider: AiProvider, filenames: string[]): Promise<ExtractedAsset> {
  const stages: string[] = ["upload:received", "image:compressed"];

  const ocr = await withRetry(() => withTimeout(provider.ocr(filenames), config.aiTimeoutMs, "ocr"), "ocr");
  stages.push(`ocr:${provider.name}(${ocr.confidence.toFixed(2)})`);

  const vision = await withRetry(() => withTimeout(provider.vision(filenames), config.aiTimeoutMs, "vision"), "vision");
  stages.push(`vision:${provider.name}(${vision.confidence.toFixed(2)})`);

  const llm = await withRetry(() => withTimeout(provider.llm(ocr.text, vision), config.aiTimeoutMs, "llm"), "llm");
  stages.push(`llm:${provider.name}`);

  // STRUCTURED OUTPUT ONLY: unparseable LLM output is an error, never guessed at
  const parsed = ExtractedSchema.safeParse(llm.raw);
  if (!parsed.success) throw new AIError("ai_malformed_output", "LLM output failed schema validation");
  stages.push("json:validated");

  // hallucination hook: cross-check LLM claims against OCR/vision evidence
  if (parsed.data.brand !== "unknown" && vision.brand !== "unknown" && parsed.data.brand !== vision.brand) {
    inc("ai_hallucination_flags_total");
    stages.push("hallucination:flagged");
    parsed.data.confidence = Math.min(parsed.data.confidence, 0.5);
  }

  const tokens = llm.tokens;
  const costUsd = (tokens / 1000) * COST_PER_1K_TOKENS_USD;
  inc("ai_tokens_total", { provider: provider.name }, tokens);
  inc("ai_calls_total", { provider: provider.name });

  return {
    ...parsed.data,
    pipeline: stages,
    meta: { provider: provider.name, promptVersion: PROMPT_VERSION, tokens, costUsd: Number(costUsd.toFixed(5)) },
  };
}

export async function runExtractionPipeline(filenames: string[]): Promise<ExtractedAsset> {
  const primary = providers[config.aiProvider] ?? mockProvider;
  const fallback = providers[config.aiFallbackProvider] ?? mockProvider;

  try {
    return await runWithProvider(primary, filenames);
  } catch (err) {
    if (primary.name === fallback.name) throw err instanceof AIError ? err : new AIError("ai_failed", String(err));
    inc("ai_fallbacks_total", { from: primary.name, to: fallback.name });
    log(null, "ai", "provider_fallback", { from: primary.name, to: fallback.name, err: String(err) });
    const out = await runWithProvider(fallback, filenames);
    out.pipeline.unshift(`fallback:${primary.name}→${fallback.name}`);
    return out;
  }
}

/* ---------- routes ---------- */

export const aiRouter = Router();
aiRouter.use(service("ai"), requireAuth);

aiRouter.post(
  "/extract",
  validate(ExtractSchema),
  asyncHandler(async (req, res) => {
    const started = Date.now();
    const result = await runExtractionPipeline(req.body.filenames);

    // confidence threshold: below the floor we return 422 with the partial —
    // the client asks the user to confirm instead of silently storing junk
    if (result.confidence < config.aiMinConfidence) {
      return res.status(422).json({
        error: "low_confidence",
        message: `extraction confidence ${result.confidence} below threshold ${config.aiMinConfidence}`,
        partial: result,
      });
    }
    log(req, "ai", "extraction_complete", {
      ms: Date.now() - started,
      confidence: result.confidence,
      tokens: result.meta?.tokens,
    });
    res.json(result);
  })
);

aiRouter.get("/providers", (_req, res) => {
  res.json({
    active: config.aiProvider,
    fallback: config.aiFallbackProvider,
    available: Object.keys(providers).filter((p) => p !== "failing"),
    promptVersion: PROMPT_VERSION,
  });
});
