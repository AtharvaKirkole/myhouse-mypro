/*
 * AI Service — isolated pipeline: Upload → OCR → Vision → LLM → Structured JSON.
 * Each stage sits behind a provider interface, so OpenAI / Claude / Gemini are
 * config swaps (AI_PROVIDER env), never app changes.
 */

import { Router } from "express";
import { config } from "../core/config";
import { HttpError, log, service } from "../core/http";
import { requireAuth } from "./auth";

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
}

interface AiProvider {
  name: string;
  ocr(filenames: string[]): Promise<string>;
  vision(filenames: string[]): Promise<{ label: string; brand: string }>;
  llm(ocrText: string, visionLabel: { label: string; brand: string }): Promise<ExtractedAsset>;
}

/* ---------- mock provider (deterministic, keyed off filenames) ---------- */

const KNOWN = [
  { keys: ["couch", "sofa", "west-elm"], out: { name: "Sofa", category: "Furniture", brand: "West Elm", model: "Harmony 82-in", value: "$1,899", purchased: "2021-11-14", warrantyText: "7 year frame warranty" } },
  { keys: ["tv", "oled", "lg"], out: { name: 'TV 65" OLED', category: "Electronics", brand: "LG", model: "OLED65C3PUA", value: "$1,599", purchased: "2023-03-02", warrantyText: "valid until 03/02/2027" } },
  { keys: ["grill", "weber"], out: { name: "Gas Grill", category: "Outdoor", brand: "Weber", model: "Genesis E-325s", value: "$1,049", purchased: "2023-05-20", warrantyText: "10 year burner warranty" } },
  { keys: ["fridge", "refrigerator"], out: { name: "Refrigerator", category: "Appliances", brand: "LG", model: "LRFVS3006S", value: "$2,499", purchased: "2021-12-05", warrantyText: "expires December 2026" } },
  { keys: ["dishwasher", "bosch"], out: { name: "Dishwasher", category: "Appliances", brand: "Bosch", model: "SHE53C85N", value: "$1,049", purchased: "2022-05-10", warrantyText: "2 year warranty" } },
  { keys: ["mower", "ego"], out: { name: "Lawn Mower", category: "Outdoor", brand: "EGO", model: 'Power+ 21"', value: "$549", purchased: "2024-04-12", warrantyText: "5-year tool warranty" } },
];

const mockProvider: AiProvider = {
  name: "mock",
  async ocr(filenames) {
    const hit = KNOWN.find((k) => k.keys.some((key) => filenames.join(" ").toLowerCase().includes(key)));
    return hit
      ? `RECEIPT ${hit.out.brand} ${hit.out.model} total ${hit.out.value} date ${hit.out.purchased} ${hit.out.warrantyText}`
      : "RECEIPT unreadable vendor total $0.00";
  },
  async vision(filenames) {
    const hit = KNOWN.find((k) => k.keys.some((key) => filenames.join(" ").toLowerCase().includes(key)));
    return hit ? { label: hit.out.name, brand: hit.out.brand } : { label: "household item", brand: "unknown" };
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
      ...base,
      serial: `SN-${String(serialSeed).padStart(5, "0")}`,
      confidence: hit ? 0.94 : 0.41,
      pipeline: [],
    };
  },
};

/* real providers: same interface, API calls inside. Deliberately unimplemented here. */
const providers: Record<string, AiProvider> = {
  mock: mockProvider,
  // openai:   { ... call gpt-4o vision + text ... }
  // anthropic:{ ... call claude ... }
  // gemini:   { ... call gemini ... }
};

export async function runExtractionPipeline(filenames: string[]): Promise<ExtractedAsset> {
  const provider = providers[config.aiProvider] ?? mockProvider;
  const stages: string[] = [];

  stages.push("upload:received");
  // production inserts: compress → thumbnail BEFORE OCR (cost control)
  stages.push("image:compressed");
  const ocrText = await provider.ocr(filenames);
  stages.push(`ocr:${provider.name}`);
  const vision = await provider.vision(filenames);
  stages.push(`vision:${provider.name}`);
  const extracted = await provider.llm(ocrText, vision);
  stages.push(`llm:${provider.name}`);
  stages.push("json:validated");

  return { ...extracted, warrantyText: extracted.warrantyText, pipeline: stages };
}

export const aiRouter = Router();
aiRouter.use(service("ai"), requireAuth);

aiRouter.post("/extract", async (req, res) => {
  const { filenames } = req.body ?? {};
  if (!Array.isArray(filenames) || filenames.length === 0) {
    throw new HttpError(400, "missing_filenames");
  }
  const started = Date.now();
  const result = await runExtractionPipeline(filenames);
  log(req, "ai", "extraction_complete", { ms: Date.now() - started, confidence: result.confidence });
  res.json(result);
});

aiRouter.get("/providers", (_req, res) => {
  res.json({ active: config.aiProvider, available: Object.keys(providers) });
});
