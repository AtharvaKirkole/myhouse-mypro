/*
 * Search Service — one global search across assets, warranties, jobs, files,
 * and providers. Hardened: fuzzy matching (edit distance ≤ 1), weighted
 * field ranking, pagination, recent searches, analytics. The scorer is a
 * pure function, so an Elasticsearch/pg_trgm adapter swaps in behind the
 * same endpoint contract.
 */

import { Router } from "express";
import { asyncHandler, service } from "../core/http";
import { kv } from "../core/redis";
import { requireAuth } from "./auth";
import { validate, SearchQuerySchema } from "../core/validate";
import { db, notDeleted, paginate } from "../db/store";

interface Hit {
  type: "asset" | "warranty" | "job" | "file" | "provider";
  id: string;
  title: string;
  snippet: string;
  score: number;
}

/* Damerau-lite edit distance capped at 1 — enough for typo tolerance */
function within1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** weighted, fuzzy scorer: exact-in-name ≫ exact-anywhere > fuzzy */
export function scoreText(fields: { text: string; weight: number }[], terms: string[]): number {
  let score = 0;
  for (const term of terms) {
    for (const { text, weight } of fields) {
      const t = text.toLowerCase();
      if (t.includes(term)) {
        score += weight * (term.length > 3 ? 2 : 1);
      } else if (term.length > 3 && t.split(/[^a-z0-9]+/).some((w) => within1(w, term))) {
        score += weight; // fuzzy hit at reduced weight
      }
    }
  }
  return score;
}

export function globalSearch(userId: string, q: string): Hit[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const myHomes = new Set(db.data.members.filter((m) => m.userId === userId).map((m) => m.homeId));

  const hits: Hit[] = [];

  for (const a of db.data.assets.filter((x) => myHomes.has(x.homeId) && notDeleted(x))) {
    const s = scoreText(
      [
        { text: `${a.name} ${a.brand}`, weight: 3 },
        { text: `${a.model} ${a.serial}`, weight: 2 },
        { text: `${a.category} ${a.room}`, weight: 1 },
      ],
      terms
    );
    if (s > 0)
      hits.push({
        type: "asset",
        id: a.id,
        title: `${a.brand} ${a.name}`,
        snippet: `${a.model} · ${a.room}`,
        score: s + 1,
      });
  }
  for (const w of db.data.warranties.filter((x) => myHomes.has(x.homeId))) {
    const s = scoreText([{ text: `${w.item} ${w.provider} warranty`, weight: 2 }], terms);
    if (s > 0)
      hits.push({
        type: "warranty",
        id: w.id,
        title: `Warranty: ${w.item}`,
        snippet: `expires ${w.expiresAt.slice(0, 10)}`,
        score: s,
      });
  }
  for (const j of db.data.jobs.filter((x) => myHomes.has(x.homeId))) {
    const s = scoreText(
      [
        { text: j.title, weight: 2 },
        { text: `${j.description} ${j.category} repair`, weight: 1 },
      ],
      terms
    );
    if (s > 0)
      hits.push({
        type: "job",
        id: j.id,
        title: j.title,
        snippet: `${j.status} · ${j.createdAt.slice(0, 10)}`,
        score: s,
      });
  }
  for (const f of db.data.files.filter((x) => myHomes.has(x.homeId) && notDeleted(x))) {
    const s = scoreText([{ text: `${f.filename} ${f.kind} manual receipt`, weight: 1 }], terms);
    if (s > 0) hits.push({ type: "file", id: f.id, title: f.filename, snippet: f.kind, score: s });
  }
  for (const p of db.data.users.filter((u) => u.accountType === "pro")) {
    const s = scoreText(
      [{ text: `${p.name} ${p.proProfile?.business ?? ""} ${p.proProfile?.professions.join(" ") ?? ""}`, weight: 2 }],
      terms
    );
    if (s > 0)
      hits.push({
        type: "provider",
        id: p.id,
        title: p.proProfile?.business ?? p.name,
        snippet: p.proProfile?.professions.join(", ") ?? "",
        score: s,
      });
  }

  return hits.sort((a, b) => b.score - a.score);
}

export const searchRouter = Router();
searchRouter.use(service("search"), requireAuth);

searchRouter.get(
  "/",
  validate(SearchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { q, page, limit } = req.query as unknown as { q: string; page: number; limit: number };
    const all = globalSearch(req.userId!, q);
    const paged = paginate(all, page, limit);

    // recent searches (Redis-backed, last 10)
    const key = `recent:${req.userId}`;
    const recent: string[] = JSON.parse((await kv.get(key)) ?? "[]");
    await kv.set(key, JSON.stringify([q, ...recent.filter((r) => r !== q)].slice(0, 10)), 30 * 86400);

    db.data.analytics.push({
      id: `evt_${Date.now()}`,
      ts: new Date().toISOString(),
      event: all.length === 0 ? "search.no_results" : "search.results",
      userId: req.userId,
      props: { q, hits: all.length },
    });
    db.persist();

    res.json({ q, hits: paged.items, page: paged.page, pages: paged.pages, total: paged.total });
  })
);

searchRouter.get(
  "/recent",
  asyncHandler(async (req, res) => {
    res.json({ recent: JSON.parse((await kv.get(`recent:${req.userId}`)) ?? "[]") });
  })
);
