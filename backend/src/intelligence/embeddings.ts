/*
 * Issue embeddings + vector search.
 *
 * EmbeddingProvider is the swap point: today a deterministic local
 * feature-hashing embedder (zero deps, stable across runs); in production the
 * same interface fronts OpenAI/Voyage embeddings with the vectors living in
 * pgvector/Pinecone. Callers only ever see embed() + searchSimilar().
 */

import { config } from "../core/config";
import { db, now, uid, type IssueVectorRow } from "../db/store";

export interface EmbeddingProvider {
  name: string;
  embed(text: string): number[];
}

/* fnv1a — cheap, deterministic string hash */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const STOP = new Set(["the", "a", "an", "is", "are", "my", "our", "and", "or", "to", "of", "in", "on", "it", "its"]);

function tokens(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  const grams: string[] = [...words];
  for (let i = 0; i < words.length - 1; i++) grams.push(`${words[i]}_${words[i + 1]}`); // bigrams carry symptoms
  return grams;
}

const hashEmbedder: EmbeddingProvider = {
  name: "feature-hash",
  embed(text: string): number[] {
    const v = new Array<number>(config.embedDim).fill(0);
    for (const t of tokens(text)) {
      const h = fnv1a(t);
      const idx = h % config.embedDim;
      const sign = (h >>> 16) & 1 ? 1 : -1;
      v[idx] += sign;
    }
    const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
    return v.map((x) => Number((x / norm).toFixed(6)));
  },
};

export const embedder: EmbeddingProvider = hashEmbedder;

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot; // vectors are L2-normalized
}

export function upsertIssueVector(
  refId: string,
  homeId: string,
  text: string,
  meta: { brand?: string; model?: string; category: string }
): IssueVectorRow {
  const existing = db.data.issueVectors.find((v) => v.refType === "job" && v.refId === refId);
  const vector = embedder.embed(`${meta.category} ${meta.brand ?? ""} ${meta.model ?? ""} ${text}`);
  if (existing) {
    existing.vector = vector;
    db.persist();
    return existing;
  }
  const row: IssueVectorRow = {
    id: uid("vec"), refType: "job", refId, homeId,
    brand: meta.brand, model: meta.model, category: meta.category,
    vector, createdAt: now(),
  };
  db.data.issueVectors.push(row);
  db.persist();
  return row;
}

export interface SimilarHit {
  refId: string;
  homeId: string;
  score: number;
  category: string;
  brand?: string;
  model?: string;
}

export function searchSimilar(
  vector: number[],
  opts: { topK?: number; excludeRefId?: string; minScore?: number } = {}
): SimilarHit[] {
  const { topK = 10, excludeRefId, minScore = 0.15 } = opts;
  return db.data.issueVectors
    .filter((v) => v.refId !== excludeRefId)
    .map((v) => ({
      refId: v.refId, homeId: v.homeId, score: Number(cosine(vector, v.vector).toFixed(4)),
      category: v.category, brand: v.brand, model: v.model,
    }))
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
