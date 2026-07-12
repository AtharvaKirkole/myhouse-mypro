/*
 * Search Service — one global search across assets, warranties, jobs, files,
 * and providers ("samsung" → the TV → its warranty → its repairs → its manual).
 * In-memory scan today; OpenSearch/pg_trgm behind the same endpoint later.
 */

import { Router } from "express";
import { service } from "../core/http";
import { requireAuth } from "./auth";
import { db } from "../db/store";

interface Hit {
  type: "asset" | "warranty" | "job" | "file" | "provider";
  id: string;
  title: string;
  snippet: string;
  score: number;
}

export function globalSearch(userId: string, q: string): Hit[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const myHomes = new Set(db.data.members.filter((m) => m.userId === userId).map((m) => m.homeId));

  const score = (text: string): number => {
    const t = text.toLowerCase();
    let s = 0;
    for (const term of terms) {
      if (t.includes(term)) s += term.length > 3 ? 2 : 1;
    }
    return s;
  };

  const hits: Hit[] = [];

  for (const a of db.data.assets.filter((x) => myHomes.has(x.homeId))) {
    const s = score(`${a.name} ${a.brand} ${a.model} ${a.serial} ${a.category} ${a.room}`);
    if (s > 0) hits.push({ type: "asset", id: a.id, title: `${a.brand} ${a.name}`, snippet: `${a.model} · ${a.room}`, score: s + 1 });
  }
  for (const w of db.data.warranties.filter((x) => myHomes.has(x.homeId))) {
    const s = score(`${w.item} ${w.provider} warranty`);
    if (s > 0) hits.push({ type: "warranty", id: w.id, title: `Warranty: ${w.item}`, snippet: `expires ${w.expiresAt.slice(0, 10)}`, score: s });
  }
  for (const j of db.data.jobs.filter((x) => myHomes.has(x.homeId))) {
    const s = score(`${j.title} ${j.description} ${j.category} repair`);
    if (s > 0) hits.push({ type: "job", id: j.id, title: j.title, snippet: `${j.status} · ${j.createdAt.slice(0, 10)}`, score: s });
  }
  for (const f of db.data.files.filter((x) => myHomes.has(x.homeId))) {
    const s = score(`${f.filename} ${f.kind} manual receipt`);
    if (s > 0) hits.push({ type: "file", id: f.id, title: f.filename, snippet: f.kind, score: s });
  }
  for (const p of db.data.users.filter((u) => u.accountType === "pro")) {
    const s = score(`${p.name} ${p.proProfile?.business ?? ""} ${p.proProfile?.professions.join(" ") ?? ""}`);
    if (s > 0) hits.push({ type: "provider", id: p.id, title: p.proProfile?.business ?? p.name, snippet: p.proProfile?.professions.join(", ") ?? "", score: s });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, 25);
}

export const searchRouter = Router();
searchRouter.use(service("search"), requireAuth);

searchRouter.get("/", (req, res) => {
  const q = String(req.query.q ?? "");
  const hits = globalSearch(req.userId!, q);
  // analytics: track search failures to improve the product
  db.data.analytics.push({
    id: `evt_${Date.now()}`,
    ts: new Date().toISOString(),
    event: hits.length === 0 ? "search.no_results" : "search.results",
    userId: req.userId,
    props: { q, hits: hits.length },
  });
  db.persist();
  res.json({ q, hits });
});
