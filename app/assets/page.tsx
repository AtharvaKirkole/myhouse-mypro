"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SYSTEMS } from "@/lib/data";
import { ROOMS } from "@/lib/myhouse";
import {
  CustomAsset,
  DEFAULT_FURNITURE,
  DOC_KINDS,
  DocKind,
  RecognitionResult,
  getCustomAssets,
  guessKind,
  recognize,
  saveCustomAssets,
} from "@/lib/assets";

interface Upload {
  name: string;
  kind: DocKind;
  url?: string;
}

type WizStep = "closed" | "upload" | "scanning" | "review" | "done";

const SCAN_STAGES = [
  "Reading documents (OCR)…",
  "Identifying product from photos…",
  "Matching receipt ↔ product…",
  "Looking up warranty & manuals…",
  "Building maintenance plan…",
];

const SAMPLES: { label: string; files: Upload[] }[] = [
  {
    label: "🛋️ Couch photo + receipt",
    files: [
      { name: "living-room-couch.jpg", kind: "product" },
      { name: "west-elm-receipt.pdf", kind: "receipt" },
    ],
  },
  {
    label: "📺 TV + warranty papers",
    files: [
      { name: "tv-oled-wall.jpg", kind: "product" },
      { name: "lg-warranty-card.jpg", kind: "warranty" },
    ],
  },
  {
    label: "🍖 Grill receipt only",
    files: [{ name: "weber-grill-invoice.pdf", kind: "receipt" }],
  },
  {
    label: "🌱 Mower + serial sticker",
    files: [
      { name: "ego-lawn-mower.jpg", kind: "product" },
      { name: "serial-sticker.jpg", kind: "serial" },
    ],
  },
];

const ROOM_OPTIONS = [...ROOMS.map((r) => r.name), "Backyard"];

export default function AssetsPage() {
  const [custom, setCustom] = useState<CustomAsset[]>([]);
  const [step, setStep] = useState<WizStep>("closed");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [stage, setStage] = useState(0);
  const [rec, setRec] = useState<RecognitionResult | null>(null);
  const [room, setRoom] = useState(ROOM_OPTIONS[3]);
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setCustom(getCustomAssets());
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  function onFiles(list: FileList | null) {
    if (!list) return;
    const next: Upload[] = [...uploads];
    for (const f of Array.from(list)) {
      next.push({ name: f.name, kind: guessKind(f.name), url: URL.createObjectURL(f) });
    }
    setUploads(next);
  }

  function startScan() {
    setStep("scanning");
    setStage(0);
    SCAN_STAGES.forEach((_, i) => {
      timers.current.push(
        setTimeout(() => {
          setStage(i + 1);
          if (i === SCAN_STAGES.length - 1) {
            setRec(
              recognize(
                uploads.map((u) => u.name),
                uploads.map((u) => u.kind)
              )
            );
            setStep("review");
          }
        }, 650 * (i + 1))
      );
    });
  }

  function addAsset() {
    if (!rec) return;
    const targetRoom = ROOMS.find((r) => r.name === room);
    const x = targetRoom ? targetRoom.rect.x + targetRoom.rect.w / 2 : 770;
    const y = targetRoom ? targetRoom.rect.y + targetRoom.rect.h / 2 : 90;
    const asset: CustomAsset = {
      id: `c-${Date.now()}`,
      name: rec.name,
      icon: rec.icon,
      category: rec.category,
      room,
      x,
      y,
      rot: 0,
      scale: 1,
      brand: rec.brand,
      model: rec.model,
      serial: rec.serial,
      purchased: rec.purchased,
      value: rec.value,
      warrantyUntil: rec.warrantyUntil,
      lifespan: rec.lifespan,
      maintenance: rec.maintenance,
      source: uploads.map((u) => DOC_KINDS.find((d) => d.id === u.kind)?.label).join(" + "),
      matched:
        uploads.some((u) => u.kind === "receipt" || u.kind === "warranty") &&
        uploads.some((u) => u.kind === "product" || u.kind === "serial"),
    };
    const next = [asset, ...custom];
    setCustom(next);
    saveCustomAssets(next);
    setStep("done");
  }

  function removeAsset(id: string) {
    const next = custom.filter((a) => a.id !== id);
    setCustom(next);
    saveCustomAssets(next);
  }

  function resetWizard() {
    setUploads([]);
    setRec(null);
    setStep("upload");
  }

  const hasReceiptAndProduct =
    uploads.some((u) => u.kind === "receipt" || u.kind === "warranty") &&
    uploads.some((u) => u.kind === "product" || u.kind === "serial");

  const groups: { title: string; items: { icon: string; name: string; sub: string; extra?: string; custom?: string }[] }[] = [
    {
      title: "Systems (from your Home Passport)",
      items: SYSTEMS.map((s) => ({ icon: "⚙️", name: s.name, sub: s.detail })),
    },
    {
      title: "Furniture & fixtures",
      items: [
        ...DEFAULT_FURNITURE.map((f) => ({ icon: f.icon, name: f.name, sub: `${f.brand} · ${f.value} · ${f.purchased}` })),
        ...custom.filter((c) => c.category === "Furniture").map((c) => ({ icon: c.icon, name: c.name, sub: `${c.brand} ${c.model} · ${c.value}`, extra: c.warrantyUntil, custom: c.id })),
      ],
    },
    {
      title: "Electronics",
      items: custom.filter((c) => c.category === "Electronics").map((c) => ({ icon: c.icon, name: c.name, sub: `${c.brand} ${c.model} · ${c.value}`, extra: c.warrantyUntil, custom: c.id })),
    },
    {
      title: "Outdoor & garage",
      items: custom.filter((c) => c.category === "Outdoor" || c.category === "Garage").map((c) => ({ icon: c.icon, name: c.name, sub: `${c.brand} ${c.model} · ${c.value}`, extra: c.warrantyUntil, custom: c.id })),
    },
    {
      title: "Other",
      items: custom.filter((c) => !["Furniture", "Electronics", "Outdoor", "Garage"].includes(c.category)).map((c) => ({ icon: c.icon, name: c.name, sub: `${c.brand} ${c.model}`, extra: c.warrantyUntil, custom: c.id })),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Assets</h1>
          <p className="mt-1 text-stone-600">
            Everything you own, in one inventory. Add anything with a photo —
            AI reads the receipt, finds the model, and files the warranty.
          </p>
        </div>
        <button
          onClick={resetWizard}
          className="rounded-full bg-emerald-800 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          ✨ Add asset with AI
        </button>
      </div>

      {/* inventory */}
      <div className="mt-8 space-y-8">
        {groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.title}>
              <h2 className="text-sm font-bold uppercase tracking-wide text-stone-400">{g.title}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((it, i) => (
                  <div key={`${it.name}-${i}`} className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4">
                    <span className="text-2xl">{it.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-900">{it.name}</p>
                      <p className="truncate text-xs text-stone-500">{it.sub}</p>
                      {it.extra && it.extra !== "—" && (
                        <p className="mt-1 text-xs font-medium text-emerald-800">Warranty: {it.extra}</p>
                      )}
                    </div>
                    {it.custom && (
                      <button
                        onClick={() => removeAsset(it.custom!)}
                        title="Remove"
                        className="rounded-full px-2 py-1 text-xs text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        {custom.length === 0 && (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
            <p className="font-medium text-stone-700">No custom assets yet</p>
            <p className="mt-1">
              Try &ldquo;Add asset with AI&rdquo; — upload a couch photo and a receipt, watch the fields fill themselves.
            </p>
          </div>
        )}
      </div>

      {/* wizard modal */}
      {step !== "closed" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-4 sm:items-center" onClick={() => setStep("closed")}>
          <div className="my-6 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {step === "upload" && (
              <>
                <h2 className="text-lg font-bold text-stone-900">Add an asset</h2>
                <p className="mt-1 text-sm text-stone-500">
                  Upload any combination — a photo of the item, the receipt, warranty papers, the serial sticker. More documents = higher confidence.
                </p>

                <button
                  onClick={() => fileRef.current?.click()}
                  className="mt-4 flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 py-8 text-sm text-stone-500 transition hover:border-emerald-600 hover:text-stone-700"
                >
                  <span className="text-2xl">📤</span>
                  <span className="font-medium">Click to upload images or PDFs</span>
                  <span className="text-xs">receipt · warranty · product photo · barcode</span>
                </button>
                <input ref={fileRef} type="file" accept="image/*,.pdf" multiple hidden onChange={(e) => onFiles(e.target.files)} />

                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                    or try a sample
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {SAMPLES.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => setUploads(s.files)}
                        className="rounded-full bg-white px-3 py-1.5 text-xs text-stone-600 ring-1 ring-stone-300 transition hover:bg-stone-100"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {uploads.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {uploads.map((u, i) => (
                      <li key={`${u.name}-${i}`} className="flex items-center gap-3 rounded-xl bg-stone-50 p-2.5">
                        {u.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-lg ring-1 ring-stone-200">
                            {DOC_KINDS.find((d) => d.id === u.kind)?.icon}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-stone-800">{u.name}</p>
                          <select
                            value={u.kind}
                            onChange={(e) =>
                              setUploads(uploads.map((x, xi) => (xi === i ? { ...x, kind: e.target.value as DocKind } : x)))
                            }
                            className="mt-0.5 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] text-stone-600"
                          >
                            {DOC_KINDS.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={() => setUploads(uploads.filter((_, xi) => xi !== i))}
                          className="px-2 text-stone-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {hasReceiptAndProduct && (
                  <p className="mt-3 rounded-xl bg-emerald-50 p-2.5 text-xs text-emerald-900 ring-1 ring-emerald-200">
                    ✓ Receipt + product photo detected — they&apos;ll be matched into one record
                  </p>
                )}

                <button
                  onClick={startScan}
                  disabled={uploads.length === 0}
                  className="mt-5 w-full rounded-full bg-emerald-800 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-emerald-700 disabled:opacity-40"
                >
                  Scan with AI →
                </button>
                <p className="mt-2 text-center text-[11px] text-stone-400">
                  Demo — extraction is simulated locally; production uses OCR + a multimodal model server-side
                </p>
              </>
            )}

            {step === "scanning" && (
              <div className="py-6">
                <h2 className="text-center text-lg font-bold text-stone-900">Analyzing {uploads.length} document{uploads.length > 1 ? "s" : ""}…</h2>
                <ul className="mx-auto mt-6 max-w-xs space-y-3">
                  {SCAN_STAGES.map((s, i) => (
                    <li key={s} className="flex items-center gap-3 text-sm">
                      {i < stage ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-[10px] text-white">✓</span>
                      ) : i === stage ? (
                        <span className="live-dot h-5 w-5 rounded-full border-2 border-emerald-700" />
                      ) : (
                        <span className="h-5 w-5 rounded-full border-2 border-stone-200" />
                      )}
                      <span className={i <= stage ? "text-stone-800" : "text-stone-400"}>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step === "review" && rec && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold text-stone-900">
                    {rec.icon} We found: {rec.brand} {rec.name}
                  </h2>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                    {rec.confidence}% match
                  </span>
                </div>
                {hasReceiptAndProduct && (
                  <p className="mt-2 rounded-xl bg-emerald-50 p-2.5 text-xs text-emerald-900 ring-1 ring-emerald-200">
                    ✓ Receipt matched to product photo — purchase date and price pulled from the receipt, condition from the photo
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  {(
                    [
                      ["Model", rec.model],
                      ["Serial", rec.serial],
                      ["Purchased", rec.purchased],
                      ["Value", rec.value],
                      ["Warranty until", rec.warrantyUntil],
                      ["Expected life", rec.lifespan],
                      ["Dimensions", rec.dims],
                      ["Maintenance", rec.maintenance],
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <div key={k} className={k === "Dimensions" || k === "Maintenance" ? "col-span-2" : ""}>
                      <p className="text-xs text-stone-400">{k}</p>
                      <p className="font-medium text-stone-800">{v}</p>
                    </div>
                  ))}
                </div>
                <label className="mt-4 block text-sm font-medium text-stone-700">
                  Place in room
                  <select value={room} onChange={(e) => setRoom(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700">
                    {ROOM_OPTIONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <div className="mt-5 flex gap-2">
                  <button onClick={addAsset} className="flex-1 rounded-full bg-emerald-800 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700">
                    Looks right — add to my home
                  </button>
                  <button onClick={resetWizard} className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-stone-600 ring-1 ring-stone-300 transition hover:bg-stone-50">
                    Retry
                  </button>
                </div>
              </>
            )}

            {step === "done" && (
              <div className="py-4 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">✓</span>
                <h2 className="mt-3 text-xl font-bold text-stone-900">Added to your home</h2>
                <p className="mt-1 text-sm text-stone-600">
                  It&apos;s now in your inventory, placed in the {room}, with maintenance reminders scheduled and the warranty on watch.
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <Link href="/myhouse/twin" className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700">
                    See it on the twin →
                  </Link>
                  <button onClick={() => setStep("closed")} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-stone-600 ring-1 ring-stone-300 transition hover:bg-stone-50">
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
