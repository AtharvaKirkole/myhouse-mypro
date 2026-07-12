"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PRO, PRO_JOBS, PRO_SCHEDULE, ProJob, ROUTE_NOTE } from "@/lib/mypro";
import { ProProfile, getSession, updateProProfile } from "@/lib/account";
import { Stars } from "@/components/shared";

const PIN_COORDS: [number, number][] = [
  [232, 118],
  [148, 212],
  [262, 196],
  [118, 108],
];

const ETAS = ["Today 2–4 PM", "Tomorrow 8–10 AM", "Thursday 8–10 AM", "Saturday AM"];
const WARRANTIES = ["90 days", "1 year", "2 years"];

export default function MyProPage() {
  const [bidding, setBidding] = useState<ProJob | null>(null);
  const [price, setPrice] = useState("");
  const [eta, setEta] = useState(ETAS[0]);
  const [warranty, setWarranty] = useState(WARRANTIES[1]);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState<ProProfile | null>(null);

  useEffect(() => {
    const sync = () => {
      const s = getSession();
      setProfile(s?.type === "pro" ? s.pro : null);
    };
    sync();
    window.addEventListener("mh-session", sync);
    return () => window.removeEventListener("mh-session", sync);
  }, []);

  const businessName = profile?.business || PRO.business;
  const displayName = profile?.name || PRO.name;
  const trade = profile?.professions?.join(" · ") || PRO.trade;
  const radius = profile?.radiusMi ?? 15;
  const live = profile?.liveLocation ?? false;

  function setLive(on: boolean) {
    if (profile) {
      updateProProfile({ liveLocation: on });
      setProfile({ ...profile, liveLocation: on });
    }
  }

  function setRadius(mi: number) {
    if (profile) {
      updateProProfile({ radiusMi: mi });
      setProfile({ ...profile, radiusMi: mi });
    }
  }

  function openBid(j: ProJob) {
    setBidding(j);
    setPrice(String(j.suggestedBid));
    setEta(ETAS[0]);
    setWarranty(WARRANTIES[1]);
  }

  function submitBid() {
    if (!bidding) return;
    setSent((s) => ({ ...s, [bidding.id]: `$${price} · ${eta} · ${warranty} warranty` }));
    setBidding(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            MyPro · business dashboard
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900">
            {businessName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-stone-600">
            <span>{displayName} · {trade}</span>
            <Stars rating={PRO.rating} />
            <span>{PRO.jobs.toLocaleString()} completed jobs</span>
          </div>
          {!profile && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
              Viewing the sample pro account —{" "}
              <Link href="/auth/mypro" className="font-semibold underline">
                create your MyPro account
              </Link>{" "}
              to set your trades, radius, and live location.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm">
          <p className="text-stone-500">This week</p>
          <p className="text-2xl font-bold text-stone-900">{PRO.payouts.week}</p>
          <p className="text-xs text-stone-500">{PRO.payouts.escrow} in escrow · {PRO.payouts.next}</p>
        </div>
      </div>

      {/* stats */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {PRO.stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">{s.label}</p>
            <p className="mt-1 text-4xl font-bold text-stone-900">{s.value}</p>
            <p className="mt-1 text-xs text-stone-500">{s.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-5">
        {/* job feed */}
        <div className="lg:col-span-3">
          <h2 className="text-xl font-semibold text-stone-900">
            Job feed
            <span className="ml-2 align-middle text-xs font-medium text-stone-500">
              structured by the reverse marketplace · home record attached
            </span>
          </h2>
          <div className="mt-4 space-y-4">
            {PRO_JOBS.map((j) => (
              <div key={j.id} className="rounded-2xl border border-stone-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-stone-900">{j.title}</h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`rounded-full px-2.5 py-1 font-semibold ${
                        j.urgency === "Emergency"
                          ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                          : j.urgency === "This week"
                            ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                            : "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {j.urgency}
                    </span>
                    <span className="text-stone-500">{j.distance}</span>
                  </div>
                </div>

                <ul className="mt-3 space-y-1 text-sm text-stone-600">
                  {j.context.map((c) => (
                    <li key={c} className="flex gap-2">
                      <span className="text-stone-300">▸</span>
                      {c}
                    </li>
                  ))}
                </ul>

                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
                  ✦ {j.match}
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
                  <div className="text-sm">
                    <span className="font-semibold text-stone-900">{j.budget}</span>
                    <span className="ml-2 text-xs text-stone-500">{j.bidsSoFar} bids so far</span>
                  </div>
                  {sent[j.id] ? (
                    <span className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                      ✓ Bid sent — {sent[j.id]}
                    </span>
                  ) : (
                    <button
                      onClick={() => openBid(j)}
                      className="rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-stone-700"
                    >
                      Place bid
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* right rail: map + schedule + verifications */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-stone-900">Service area &amp; location</h2>
              <button
                onClick={() => setLive(!live)}
                disabled={!profile}
                title={profile ? "" : "Sign in to enable"}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  live ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                } disabled:opacity-50`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${live ? "live-dot bg-white" : "bg-stone-400"}`} />
                {live ? "Live — on duty" : "Location off"}
              </button>
            </div>

            <svg viewBox="0 0 400 300" className="mt-3 w-full rounded-xl" role="img" aria-label={`Service area map, ${radius} mile radius around ${profile?.baseCity ?? "Phoenix"}`}>
              <rect width="400" height="300" fill="#f2f5f0" />
              {/* street grid */}
              {[40, 80, 120, 160, 200, 240, 280, 320, 360].map((x) => (
                <line key={`v${x}`} x1={x} y1="0" x2={x} y2="300" stroke="#e3e6e0" strokeWidth="1" />
              ))}
              {[40, 80, 120, 160, 200, 240, 280].map((y) => (
                <line key={`h${y}`} x1="0" y1={y} x2="400" y2={y} stroke="#e3e6e0" strokeWidth="1" />
              ))}
              {/* arterials */}
              <line x1="0" y1="160" x2="400" y2="160" stroke="#d5d9d2" strokeWidth="4" />
              <line x1="190" y1="0" x2="190" y2="300" stroke="#d5d9d2" strokeWidth="4" />

              {/* service radius */}
              <circle cx="190" cy="160" r={radius * 6.5} fill="#f59e0b" opacity="0.08" />
              <circle cx="190" cy="160" r={radius * 6.5} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 4" />

              {/* route */}
              <polyline
                points={`190,160 ${PIN_COORDS.map((p) => p.join(",")).join(" ")}`}
                fill="none"
                stroke="#1c5cab"
                strokeWidth="2"
                strokeDasharray="1 6"
                strokeLinecap="round"
              />
              {/* job pins */}
              {PIN_COORDS.map(([x, y], i) => (
                <g key={i}>
                  <circle cx={x} cy={y} r="9" fill="#fff" stroke="#1c5cab" strokeWidth="2" />
                  <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#1c5cab">
                    {i + 1}
                  </text>
                </g>
              ))}
              {/* base / live position */}
              <circle cx="190" cy="160" r="14" fill="#047857" opacity={live ? 0.18 : 0.1} className={live ? "live-dot" : ""} />
              <circle cx="190" cy="160" r="7" fill="#047857" stroke="#fff" strokeWidth="2.5" />
              <text x="200" y="150" fontSize="10" fontWeight="600" fill="#374151">
                {profile?.baseCity?.split(",")[0] ?? "Phoenix"} base
              </text>
            </svg>

            <div className="mt-3 text-xs font-medium text-stone-700">
              Service radius: <span className="font-bold text-amber-600">{radius} mi</span>
              <input
                type="range"
                min={5}
                max={40}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                disabled={!profile}
                className="mt-1.5 w-full accent-amber-500 disabled:opacity-40"
              />
            </div>
            <p className="mt-2 text-xs text-stone-500">
              {live
                ? "Homeowners on today's jobs see your live ETA. Location shares only while on duty, only with matched customers."
                : "Turn on while working — customers get Uber-style arrival tracking, you get jobs matched to where you already are."}
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="font-semibold text-stone-900">Today&apos;s route</h2>
            <p className="mt-1 rounded-xl bg-emerald-50 p-2.5 text-xs text-emerald-900 ring-1 ring-emerald-200">
              {ROUTE_NOTE}
            </p>
            <ol className="mt-4 space-y-3">
              {PRO_SCHEDULE.map((s) => (
                <li key={s.time} className="flex gap-3 text-sm">
                  <span className="w-16 shrink-0 font-semibold text-stone-900" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {s.time}
                  </span>
                  <div>
                    <p className="font-medium text-stone-800">{s.title}</p>
                    <p className="text-xs text-stone-500">{s.where}</p>
                    <p className="text-xs text-stone-400">{s.note}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="font-semibold text-stone-900">Verification vault</h2>
            <p className="mt-1 text-xs text-stone-500">
              Monitored continuously — lapses pause your job feed before they become a liability.
            </p>
            <ul className="mt-3 space-y-2.5">
              {PRO.verifications.map((v) => (
                <li key={v.name} className="flex items-start gap-2 text-sm">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-emerald-700" aria-hidden>
                    <path d="m5 12 5 5 9-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div>
                    <p className="font-medium text-stone-800">{v.name}</p>
                    <p className="text-xs text-stone-500">{v.state}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-600">
            <p className="font-semibold text-stone-900">Also in MyPro</p>
            <p className="mt-1 text-xs leading-relaxed">
              CRM · invoicing · payroll · inventory · parts ordering · customer messaging ·
              photo documentation · tax exports. The full back office, free — the job feed is the business model.
            </p>
          </div>
        </div>
      </div>

      {/* bid modal */}
      {bidding && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setBidding(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-stone-900">Bid: {bidding.title}</h2>
            <p className="mt-1 text-xs text-stone-500">
              Homeowner budget {bidding.budget} · your price is fixed once accepted — no change orders without photos.
            </p>

            <label className="mt-5 block text-sm font-medium text-stone-900">
              Your price
              <div className="mt-1 flex items-center rounded-xl border border-stone-300 bg-white px-3">
                <span className="text-stone-400">$</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  className="w-full bg-transparent px-2 py-2.5 outline-none"
                />
              </div>
              <span className="mt-1 block text-xs font-normal text-stone-500">
                Suggested ${bidding.suggestedBid} — based on 214 similar jobs on this exact model in Phoenix
              </span>
            </label>

            <p className="mt-4 text-sm font-medium text-stone-900">Arrival</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {ETAS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEta(e)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    eta === e ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-300"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>

            <p className="mt-4 text-sm font-medium text-stone-900">Workmanship warranty</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {WARRANTIES.map((w) => (
                <button
                  key={w}
                  onClick={() => setWarranty(w)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    warranty === w ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-300"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>

            <button
              onClick={submitBid}
              disabled={!price}
              className="mt-6 w-full rounded-full bg-amber-500 py-2.5 text-sm font-bold text-white transition enabled:hover:bg-amber-400 disabled:opacity-40"
            >
              Send bid
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
