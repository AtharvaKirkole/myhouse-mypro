"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { HOME, STATUS_META, StatusLevel } from "@/lib/data";
import { ROOMS, TWIN_ASSETS, Room } from "@/lib/myhouse";
import {
  Arrangement,
  CustomAsset,
  DEFAULT_FURNITURE,
  getArrangement,
  getCustomAssets,
  saveArrangement,
  saveCustomAssets,
} from "@/lib/assets";
import { StatusPill } from "@/components/shared";

/* ---------- unified movable model ---------- */

interface Movable {
  id: string;
  name: string;
  icon: string;
  kind: "system" | "furniture" | "custom";
  x: number;
  y: number;
  rot: number;
  scale: number;
  status: StatusLevel;
  shutoff?: boolean;
  rows: [string, string][];
  requestPrefill?: string;
  hidden?: boolean;
}

type Selection = { type: "item"; id: string } | { type: "room"; room: Room } | null;
type View = "blueprint" | "iso" | "infra" | "maintenance";

const VIEWS: { id: View; label: string }[] = [
  { id: "blueprint", label: "2D Blueprint" },
  { id: "iso", label: "3D House" },
  { id: "infra", label: "Infrastructure" },
  { id: "maintenance", label: "Maintenance" },
];

/* ---------- infrastructure layers ---------- */

const LAYERS = [
  {
    id: "plumbing",
    label: "Plumbing",
    color: "#2a78d6",
    dash: "",
    paths: [
      "M180,310 L105,362",
      "M180,310 L300,345 L340,352",
      "M300,345 L445,490",
      "M300,345 L480,352 L590,355",
    ],
  },
  {
    id: "electrical",
    label: "Electrical",
    color: "#eda100",
    dash: "",
    paths: [
      "M80,480 L140,150",
      "M80,480 L390,180",
      "M80,480 L335,400",
      "M80,480 L655,180",
      "M80,480 L715,410",
      "M80,480 L200,480",
    ],
  },
  {
    id: "hvac",
    label: "HVAC ducts",
    color: "#1baf7a",
    dash: "7 5",
    paths: [
      "M504,465 L390,200",
      "M504,465 L655,170",
      "M504,465 L715,400",
      "M504,465 L330,380",
      "M504,465 L140,180",
    ],
  },
  {
    id: "internet",
    label: "Internet / mesh",
    color: "#4a3aa7",
    dash: "2 5",
    paths: ["M460,200 L140,160", "M460,200 L650,170"],
  },
];

/* ---------- isometric helpers ---------- */

const ISO_SCALE = 0.6;
const ISO_OX = 330;
const ISO_OY = 60;
const WALL_H = 34;

function iso(x: number, y: number, lift = 0): [number, number] {
  return [
    ISO_OX + (x - y) * 0.866 * ISO_SCALE,
    ISO_OY + (x + y) * 0.5 * ISO_SCALE - lift,
  ];
}

function poly(pts: [number, number][]): string {
  return pts.map((p) => p.join(",")).join(" ");
}

export default function TwinPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>("blueprint");
  const [arrange, setArrange] = useState(false);
  const [sel, setSel] = useState<Selection>(null);
  const [overrides, setOverrides] = useState<Record<string, Arrangement & { hidden?: boolean }>>({});
  const [custom, setCustom] = useState<CustomAsset[]>([]);
  const [layersOn, setLayersOn] = useState<Record<string, boolean>>({ plumbing: true, electrical: true, hvac: true, internet: true });
  const dragId = useRef<string | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    setOverrides(getArrangement());
    setCustom(getCustomAssets());
  }, []);

  const items: Movable[] = useMemo(() => {
    const list: Movable[] = [];
    for (const a of TWIN_ASSETS) {
      list.push({
        id: a.id,
        name: a.name,
        icon: a.icon,
        kind: "system",
        x: a.x,
        y: a.y,
        rot: 0,
        scale: 1,
        status: a.status,
        shutoff: a.shutoff,
        requestPrefill: a.requestPrefill,
        rows: [
          ["Manufacturer", a.detail.manufacturer],
          ["Model", a.detail.model],
          ["Serial", a.detail.serial],
          ["Installed", a.detail.installed],
          ["Warranty", a.detail.warranty],
          ["Lifespan", a.detail.lifespan],
          ["Last service", a.detail.lastService],
          ["Replacement", a.detail.replaceCost],
        ],
      });
    }
    for (const f of DEFAULT_FURNITURE) {
      list.push({
        id: f.id,
        name: f.name,
        icon: f.icon,
        kind: "furniture",
        x: f.x,
        y: f.y,
        rot: 0,
        scale: 1,
        status: "good",
        rows: [
          ["Brand", f.brand],
          ["Value", f.value],
          ["Purchased", f.purchased],
          ["Room", f.room],
        ],
      });
    }
    for (const c of custom) {
      list.push({
        id: c.id,
        name: c.name,
        icon: c.icon,
        kind: "custom",
        x: c.x,
        y: c.y,
        rot: c.rot,
        scale: c.scale,
        status: "good",
        rows: [
          ["Brand", c.brand],
          ["Model", c.model],
          ["Serial", c.serial],
          ["Purchased", c.purchased],
          ["Value", c.value],
          ["Warranty", c.warrantyUntil],
          ["Lifespan", c.lifespan],
          ["Added via", c.source],
        ],
      });
    }
    return list
      .map((m) => {
        const o = overrides[m.id];
        return o ? { ...m, x: o.x, y: o.y, rot: o.rot, scale: o.scale, hidden: o.hidden } : m;
      })
      .filter((m) => !m.hidden);
  }, [custom, overrides]);

  const selectedItem = sel?.type === "item" ? items.find((i) => i.id === sel.id) ?? null : null;

  /* ---------- drag ---------- */

  function svgCoords(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function onItemDown(e: React.PointerEvent, m: Movable) {
    e.stopPropagation();
    setSel({ type: "item", id: m.id });
    if (!arrange || view !== "blueprint") return;
    dragId.current = m.id;
    moved.current = false;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer — dragging still works via svg-level move handler */
    }
  }

  function onMove(e: React.PointerEvent) {
    if (!dragId.current) return;
    moved.current = true;
    const { x, y } = svgCoords(e);
    const id = dragId.current;
    setOverrides((prev) => {
      const cur = items.find((i) => i.id === id);
      const base = prev[id] ?? { x: cur?.x ?? 0, y: cur?.y ?? 0, rot: cur?.rot ?? 0, scale: cur?.scale ?? 1 };
      return {
        ...prev,
        [id]: { ...base, x: Math.min(805, Math.max(20, x)), y: Math.min(545, Math.max(50, y)) },
      };
    });
  }

  function onUp() {
    if (dragId.current) {
      dragId.current = null;
      setOverrides((prev) => {
        saveArrangement(prev);
        return prev;
      });
    }
  }

  function patchSelected(patch: Partial<Arrangement & { hidden: boolean }>) {
    if (!selectedItem) return;
    setOverrides((prev) => {
      const base = prev[selectedItem.id] ?? {
        x: selectedItem.x,
        y: selectedItem.y,
        rot: selectedItem.rot,
        scale: selectedItem.scale,
      };
      const next = { ...prev, [selectedItem.id]: { ...base, ...patch } };
      saveArrangement(next);
      return next;
    });
    if (patch.hidden) setSel(null);
  }

  function duplicateSelected() {
    if (!selectedItem) return;
    const copy: CustomAsset = {
      id: `c-${Date.now()}`,
      name: selectedItem.name,
      icon: selectedItem.icon,
      category: "Furniture",
      room: "—",
      x: selectedItem.x + 34,
      y: selectedItem.y + 26,
      rot: selectedItem.rot,
      scale: selectedItem.scale,
      brand: selectedItem.rows.find(([k]) => k === "Brand")?.[1] ?? "",
      model: selectedItem.rows.find(([k]) => k === "Model")?.[1] ?? "",
      serial: "—",
      purchased: selectedItem.rows.find(([k]) => k === "Purchased")?.[1] ?? "—",
      value: selectedItem.rows.find(([k]) => k === "Value")?.[1] ?? "—",
      warrantyUntil: "—",
      lifespan: "—",
      maintenance: "—",
      source: "Duplicated on twin",
      matched: false,
    };
    const next = [copy, ...custom];
    setCustom(next);
    saveCustomAssets(next);
  }

  function deleteSelected() {
    if (!selectedItem) return;
    if (selectedItem.kind === "custom") {
      const next = custom.filter((c) => c.id !== selectedItem.id);
      setCustom(next);
      saveCustomAssets(next);
      setSel(null);
    } else {
      patchSelected({ hidden: true });
    }
  }

  /* ---------- room tint for maintenance view ---------- */

  function roomTint(r: Room): string {
    const inside = items.filter(
      (m) =>
        m.kind === "system" &&
        m.x >= r.rect.x &&
        m.x <= r.rect.x + r.rect.w &&
        m.y >= r.rect.y &&
        m.y <= r.rect.y + r.rect.h
    );
    if (inside.some((m) => m.status === "serious" || m.status === "critical")) return "#fdeee7";
    if (inside.some((m) => m.status === "warning")) return "#fdf6e3";
    return "#eefaee";
  }

  const sortedRoomsIso = [...ROOMS].sort((a, b) => a.rect.x + a.rect.y - (b.rect.x + b.rect.y));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Digital Twin · {HOME.passportId}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900">{HOME.address}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* view switcher */}
          <div className="flex rounded-full bg-stone-100 p-1 text-xs font-medium">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`rounded-full px-3 py-1.5 transition ${
                  view === v.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {view === "blueprint" && (
            <button
              onClick={() => setArrange((a) => !a)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                arrange ? "bg-emerald-800 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
              }`}
            >
              {arrange ? "✓ Done arranging" : "✥ Arrange"}
            </button>
          )}
        </div>
      </div>

      {arrange && view === "blueprint" && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Arrange mode — drag any icon to move it. Select an item for rotate ↻, resize, duplicate, and delete. Positions save automatically.
        </p>
      )}

      {view === "infra" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {LAYERS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLayersOn((s) => ({ ...s, [l.id]: !s[l.id] }))}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                layersOn[l.id] ? "bg-white text-stone-800 ring-stone-300" : "bg-stone-100 text-stone-400 ring-stone-200"
              }`}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color, opacity: layersOn[l.id] ? 1 : 0.3 }} />
              {l.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4 lg:flex-row">
        {/* canvas */}
        <div className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white p-3">
          <svg
            ref={svgRef}
            viewBox="0 0 820 560"
            className="w-full touch-none"
            role="img"
            aria-label="Interactive house model"
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
          >
            {view === "iso" ? (
              /* ---------- 3D isometric ---------- */
              <>
                <polygon points={poly([iso(-40, -40), iso(880, -40), iso(880, 600), iso(-40, 600)])} fill="#f4f8f2" />
                {sortedRoomsIso.map((r) => {
                  const { x, y, w, h } = r.rect;
                  const f = [iso(x, y), iso(x + w, y), iso(x + w, y + h), iso(x, y + h)];
                  const up = (p: [number, number]): [number, number] => [p[0], p[1] - WALL_H];
                  return (
                    <g key={r.id} onClick={() => setSel({ type: "room", room: r })} className="cursor-pointer">
                      <polygon points={poly(f)} fill="#fbfaf8" stroke="#d6d3d1" strokeWidth={1} />
                      {/* south wall */}
                      <polygon points={poly([f[3], f[2], up(f[2]), up(f[3])])} fill="#e7e4df" stroke="#c9c5bd" strokeWidth={0.8} />
                      {/* east wall */}
                      <polygon points={poly([f[1], f[2], up(f[2]), up(f[1])])} fill="#efece7" stroke="#c9c5bd" strokeWidth={0.8} />
                      <text x={iso(x + w / 2, y + h / 2)[0]} y={iso(x + w / 2, y + h / 2)[1]} textAnchor="middle" fontSize="10" fontWeight={600} fill="var(--ink-2)" className="pointer-events-none select-none">
                        {r.name}
                      </text>
                    </g>
                  );
                })}
                {items.map((m) => {
                  const [px, py] = iso(m.x, m.y);
                  return (
                    <g key={m.id} onClick={() => setSel({ type: "item", id: m.id })} className="cursor-pointer">
                      <line x1={px} y1={py} x2={px} y2={py - 26} stroke="var(--axis)" strokeWidth={1.2} />
                      <circle cx={px} cy={py - 32} r={9} fill="#fff" stroke={STATUS_META[m.status].color} strokeWidth={m.kind === "system" ? 2 : 1.2} />
                      <text x={px} y={py - 28.5} textAnchor="middle" fontSize="9" className="pointer-events-none select-none">
                        {m.icon}
                      </text>
                    </g>
                  );
                })}
                <text x="410" y="548" textAnchor="middle" fontSize="11" fill="var(--ink-muted)">
                  3D isometric view · walk-through mode coming with LiDAR scan import
                </text>
              </>
            ) : (
              /* ---------- 2D-based views ---------- */
              <>
                <rect x="8" y="8" width="804" height="544" rx="14" fill="#f4f8f2" />
                <text x="410" y="34" textAnchor="middle" fontSize="12" fill="var(--ink-muted)">
                  N ↑ · lot 9,100 sq ft · 7.2 kW solar on south roof
                </text>

                {ROOMS.map((r) => {
                  const active = sel?.type === "room" && sel.room.id === r.id;
                  return (
                    <g key={r.id} onClick={() => setSel({ type: "room", room: r })} className="cursor-pointer">
                      <rect
                        x={r.rect.x}
                        y={r.rect.y}
                        width={r.rect.w}
                        height={r.rect.h}
                        fill={view === "maintenance" ? roomTint(r) : active ? "#ecfdf5" : "#ffffff"}
                        stroke={active ? "#047857" : "#d6d3d1"}
                        strokeWidth={active ? 2.5 : 1.5}
                        opacity={view === "infra" ? 0.55 : 1}
                      />
                      <text x={r.rect.x + 10} y={r.rect.y + 20} fontSize="12" fontWeight={600} fill="var(--ink-2)" className="pointer-events-none select-none">
                        {r.name}
                      </text>
                      <text x={r.rect.x + 10} y={r.rect.y + 34} fontSize="10" fill="var(--ink-muted)" className="pointer-events-none select-none">
                        {r.dims}
                      </text>
                    </g>
                  );
                })}

                {view === "infra" &&
                  LAYERS.filter((l) => layersOn[l.id]).map((l) => (
                    <g key={l.id}>
                      {l.paths.map((p) => (
                        <path key={p} d={p} fill="none" stroke={l.color} strokeWidth={2.5} strokeDasharray={l.dash} strokeLinecap="round" opacity={0.85} />
                      ))}
                    </g>
                  ))}

                {items
                  .filter((m) => (view === "infra" ? m.kind === "system" : true))
                  .filter((m) => (view === "maintenance" ? m.kind === "system" : true))
                  .map((m) => {
                    const active = sel?.type === "item" && sel.id === m.id;
                    const draggable = arrange && view === "blueprint";
                    return (
                      <g
                        key={m.id}
                        onPointerDown={(e) => onItemDown(e, m)}
                        className={draggable ? "cursor-move" : "cursor-pointer"}
                        transform={`rotate(${m.rot} ${m.x} ${m.y})`}
                      >
                        {active && (
                          <circle cx={m.x} cy={m.y} r={20 * m.scale} fill="none" stroke={STATUS_META[m.status].color} strokeWidth={2} strokeDasharray="4 3" />
                        )}
                        {m.shutoff ? (
                          <rect x={m.x - 11 * m.scale} y={m.y - 11 * m.scale} width={22 * m.scale} height={22 * m.scale} rx={5} fill="#dc2626" stroke="#fff" strokeWidth={2} />
                        ) : m.kind === "system" ? (
                          <circle
                            cx={m.x}
                            cy={m.y}
                            r={13 * m.scale}
                            fill={view === "maintenance" ? STATUS_META[m.status].color : "#fff"}
                            stroke={view === "maintenance" ? "#fff" : STATUS_META[m.status].color}
                            strokeWidth={2.5}
                          />
                        ) : (
                          <rect
                            x={m.x - 22 * m.scale}
                            y={m.y - 13 * m.scale}
                            width={44 * m.scale}
                            height={26 * m.scale}
                            rx={7}
                            fill="#fff"
                            stroke={active ? "#57534e" : "#a8a29e"}
                            strokeWidth={1.5}
                          />
                        )}
                        <text x={m.x} y={m.y + 4.5 * m.scale} textAnchor="middle" fontSize={12 * m.scale} className="pointer-events-none select-none">
                          {m.icon}
                        </text>
                        {draggable && (
                          <circle cx={m.x} cy={m.y} r={24 * m.scale} fill="transparent" />
                        )}
                      </g>
                    );
                  })}
              </>
            )}
          </svg>
          <p className="px-2 pb-1 text-center text-xs text-stone-400">
            {view === "blueprint" && !arrange && "Tap any icon for its full record · tap a room for finishes · hit Arrange to redecorate"}
            {view === "blueprint" && arrange && "Drag anything — sofa, TV, even the water heater icon. It all saves."}
            {view === "iso" && "Same data, extruded — click anything to inspect"}
            {view === "infra" && "Toggle layers above — plumbing runs, circuits, ducts, and mesh network"}
            {view === "maintenance" && "Rooms tinted by the health of the systems inside them"}
          </p>
        </div>

        {/* drawer */}
        <aside className="w-full shrink-0 lg:w-96">
          {sel === null && (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
              <p className="font-medium text-stone-700">Nothing selected</p>
              <p className="mt-2 leading-relaxed">
                Click the 🔥 water heater, the 🛋️ sofa, or anything you added from the{" "}
                <Link href="/assets" className="font-medium text-emerald-800 underline">
                  Assets
                </Link>{" "}
                page. Switch views up top — including the 3D house.
              </p>
            </div>
          )}

          {sel?.type === "room" && (
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Room</p>
              <h2 className="mt-1 text-xl font-bold text-stone-900">{sel.room.name}</h2>
              <dl className="mt-4 space-y-2.5 text-sm">
                {[
                  ["Dimensions", sel.room.dims],
                  ["Flooring", sel.room.flooring],
                  ["Paint", sel.room.paint],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-stone-500">{k}</dt>
                    <dd className="text-right font-medium text-stone-800">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {selectedItem && (
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                    {selectedItem.kind === "system" ? "Home system" : selectedItem.kind === "furniture" ? "Furniture" : "Your asset"}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-stone-900">
                    {selectedItem.icon} {selectedItem.name}
                  </h2>
                </div>
                {selectedItem.kind === "system" && <StatusPill status={selectedItem.status} />}
              </div>

              <dl className="mt-4 space-y-2.5 text-sm">
                {selectedItem.rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="shrink-0 text-stone-500">{k}</dt>
                    <dd className="text-right font-medium text-stone-800">{v}</dd>
                  </div>
                ))}
              </dl>

              {arrange && view === "blueprint" && (
                <div className="mt-5 rounded-xl bg-stone-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Arrange</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => patchSelected({ rot: (selectedItem.rot + 45) % 360 })} className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100">
                      ↻ Rotate
                    </button>
                    <button
                      onClick={() => patchSelected({ scale: selectedItem.scale >= 1.25 ? 0.8 : selectedItem.scale + 0.225 })}
                      className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
                    >
                      ⤢ Resize ({selectedItem.scale.toFixed(2)}×)
                    </button>
                    {selectedItem.kind !== "system" && (
                      <>
                        <button onClick={duplicateSelected} className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100">
                          ⧉ Duplicate
                        </button>
                        <button onClick={deleteSelected} className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50">
                          ✕ Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {selectedItem.requestPrefill && (
                  <Link href={`/request?desc=${encodeURIComponent(selectedItem.requestPrefill)}`} className="rounded-full bg-emerald-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700">
                    Get bids →
                  </Link>
                )}
                <Link href="/myhouse#timeline" className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-300 transition hover:bg-stone-50">
                  History
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
