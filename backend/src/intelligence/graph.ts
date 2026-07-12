/*
 * Universal Home Knowledge Graph.
 *
 * Every entity is a node with a globally unique id; every relationship is an
 * append-only edge (edges are never deleted — retractedAt retires them, so
 * relationship *history* survives). Manufacturer/Model/Part nodes are global
 * (homeId: null) and shared across tenants; everything else is home-scoped
 * and only reachable through the tenant-guarded subgraph query.
 *
 * Neo4j swaps in behind these same functions; today it's typed rows + joins.
 */

import {
  db, now, uid,
  type AssetRow, type GraphEdgeRow, type GraphNodeRow, type JobRow,
  type RepairRecordRow, type WarrantyRow,
} from "../db/store";

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 80);
}

export function ensureNode(
  type: GraphNodeRow["type"],
  key: string,
  label: string,
  homeId: string | null,
  props?: Record<string, unknown>
): GraphNodeRow {
  const k = normKey(key);
  let node = db.data.graphNodes.find((n) => n.type === type && n.key === k && n.homeId === homeId);
  if (!node) {
    node = { id: uid("node"), type, key: k, label, homeId, props, createdAt: now() };
    db.data.graphNodes.push(node);
  } else if (props) {
    node.props = { ...node.props, ...props }; // enrich, never lose
  }
  return node;
}

export function link(
  from: GraphNodeRow,
  to: GraphNodeRow,
  rel: string,
  homeId: string | null,
  requestId?: string
): GraphEdgeRow {
  const active = db.data.graphEdges.find(
    (e) => e.from === from.id && e.to === to.id && e.rel === rel && !e.retractedAt
  );
  if (active) return active;
  const edge: GraphEdgeRow = { id: uid("edge"), from: from.id, to: to.id, rel, homeId, createdAt: now(), requestId };
  db.data.graphEdges.push(edge);
  return edge;
}

/** retire an active edge without erasing history */
export function retract(edgeId: string): void {
  const e = db.data.graphEdges.find((x) => x.id === edgeId && !x.retractedAt);
  if (e) e.retractedAt = now();
}

/* ---------- projections: domain rows → graph ---------- */

export function projectAsset(asset: AssetRow, requestId?: string): void {
  const house = ensureNode("House", asset.homeId, asset.homeId, asset.homeId);
  const node = ensureNode("Asset", asset.id, asset.name, asset.homeId, {
    category: asset.category, serial: asset.serial ? "on-file" : "missing",
  });
  link(house, node, "HAS_ASSET", asset.homeId, requestId);

  if (asset.room) {
    const room = ensureNode("Room", `${asset.homeId}:${asset.room}`, asset.room, asset.homeId);
    link(house, room, "HAS_ROOM", asset.homeId, requestId);
    link(node, room, "LOCATED_IN", asset.homeId, requestId);
  }
  if (asset.brand) {
    const mfr = ensureNode("Manufacturer", `manufacturer:${asset.brand}`, asset.brand, null);
    if (asset.model) {
      const model = ensureNode("ModelNode", `model:${asset.brand}:${asset.model}`, `${asset.brand} ${asset.model}`, null);
      link(model, mfr, "MADE_BY", null, requestId);
      link(node, model, "INSTANCE_OF", asset.homeId, requestId);
    } else {
      link(node, mfr, "MADE_BY", asset.homeId, requestId);
    }
  }
  db.persist();
}

export function projectWarranty(w: WarrantyRow, requestId?: string): void {
  const house = ensureNode("House", w.homeId, w.homeId, w.homeId);
  const node = ensureNode("Warranty", w.id, w.item, w.homeId, { expiresAt: w.expiresAt });
  link(house, node, "HAS_WARRANTY", w.homeId, requestId);
  if (w.assetId) {
    const asset = db.data.graphNodes.find((n) => n.type === "Asset" && n.key === w.assetId && n.homeId === w.homeId);
    if (asset) link(asset, node, "COVERED_BY", w.homeId, requestId);
  }
  db.persist();
}

export function projectJob(job: JobRow, requestId?: string): void {
  const house = ensureNode("House", job.homeId, job.homeId, job.homeId);
  const issue = ensureNode("Issue", job.id, job.title, job.homeId, {
    category: job.category, urgency: job.urgency, status: job.status,
  });
  link(house, issue, "RAISED_ISSUE", job.homeId, requestId);
  db.persist();
}

export function projectRepair(r: RepairRecordRow, requestId?: string): void {
  const issue = ensureNode("Issue", r.jobId, r.issueCategory, r.homeId);
  const contractor = db.data.users.find((u) => u.id === r.contractorId);
  const contractorNode = ensureNode(
    "Contractor", r.contractorId, contractor?.proProfile?.business ?? "contractor", null
  );
  link(issue, contractorNode, "REPAIRED_BY", r.homeId, requestId);

  if (r.assetId) {
    const asset = db.data.graphNodes.find((n) => n.type === "Asset" && n.key === r.assetId && n.homeId === r.homeId);
    if (asset) link(issue, asset, "AFFECTS", r.homeId, requestId);
  }
  for (const part of r.partsReplaced) {
    const partNode = ensureNode("Part", `part:${part}`, part, null);
    link(issue, partNode, "USED_PART", r.homeId, requestId);
  }
  db.persist();
}

/* ---------- tenant-scoped queries ---------- */

export interface Subgraph {
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
}

/**
 * The home's subgraph: its own nodes plus any *global* nodes (Manufacturer /
 * Model / Part / Contractor) reachable over its own edges. Nothing belonging
 * to another home can appear — edges are filtered by homeId first.
 */
export function subgraphForHome(homeId: string, limit = 500): Subgraph {
  const own = db.data.graphNodes.filter((n) => n.homeId === homeId);
  const ownIds = new Set(own.map((n) => n.id));
  const edges = db.data.graphEdges
    .filter((e) => e.homeId === homeId && !e.retractedAt)
    .slice(0, limit);
  const reachable = new Set<string>();
  for (const e of edges) {
    reachable.add(e.from);
    reachable.add(e.to);
  }
  // second hop through the global layer: a reachable Model pulls in its
  // Manufacturer via the global MADE_BY edge. Global edges only ever connect
  // global nodes, so no other tenant's data can ride in through here.
  const globalEdges = db.data.graphEdges.filter(
    (e) => e.homeId === null && !e.retractedAt && (reachable.has(e.from) || reachable.has(e.to))
  );
  for (const e of globalEdges) {
    reachable.add(e.from);
    reachable.add(e.to);
  }
  const globals = db.data.graphNodes.filter((n) => n.homeId === null && reachable.has(n.id));
  return { nodes: [...own, ...globals].slice(0, limit), edges: [...edges, ...globalEdges].slice(0, limit) };
}

export function neighbors(homeId: string, nodeId: string): Subgraph {
  const scope = subgraphForHome(homeId, 2000);
  if (!scope.nodes.some((n) => n.id === nodeId)) return { nodes: [], edges: [] };
  const edges = scope.edges.filter((e) => e.from === nodeId || e.to === nodeId);
  const ids = new Set<string>([nodeId]);
  for (const e of edges) {
    ids.add(e.from);
    ids.add(e.to);
  }
  return { nodes: scope.nodes.filter((n) => ids.has(n.id)), edges };
}
