"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ENERGY, HOME, STATUS_META, SYSTEMS, DEVICES } from "@/lib/data";
import {
  EMERGENCY,
  FAMILY,
  INSURANCE,
  MAINTENANCE,
  MORTGAGE,
  TIMELINE,
  UTILITY_BILLS,
  VEHICLES,
  WARRANTIES,
} from "@/lib/myhouse";
import { BookingRecord, getBookings } from "@/lib/jobs";
import { Session, getSession } from "@/lib/account";
import { StatusPill } from "@/components/shared";
import EnergyChart from "@/components/EnergyChart";

const SECTIONS = [
  ["systems", "Systems"],
  ["maintenance", "Maintenance"],
  ["warranties", "Warranties"],
  ["utilities", "Utilities"],
  ["money", "Insurance & Mortgage"],
  ["vehicles", "Vehicles"],
  ["family", "Family"],
  ["timeline", "Timeline"],
] as const;

const KIND_STYLE: Record<string, string> = {
  repair: "bg-blue-50 text-blue-800 ring-blue-200",
  install: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  claim: "bg-violet-50 text-violet-800 ring-violet-200",
  inspection: "bg-stone-100 text-stone-600 ring-stone-200",
  purchase: "bg-amber-50 text-amber-800 ring-amber-200",
  imported: "bg-stone-100 text-stone-500 ring-stone-200",
};

export default function MyHousePage() {
  const [emergency, setEmergency] = useState(false);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setBookings(getBookings());
    const sync = () => setSession(getSession());
    sync();
    window.addEventListener("mh-session", sync);
    return () => window.removeEventListener("mh-session", sync);
  }, []);

  useEffect(() => {
    document.body.style.overflow = emergency ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [emergency]);

  const healthScore = Math.round(
    SYSTEMS.reduce((a, s) => a + s.health, 0) / SYSTEMS.length
  );
  const dueNow = MAINTENANCE.filter((m) => m.badge !== "scheduled").length;
  const activeWarranties = WARRANTIES.filter((w) => w.state !== "expired").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            MyHouse · {HOME.passportId} · 1 of 1 properties
            {session?.type === "consumer" && ` · welcome back, ${session.consumer.name.split(" ")[0]}`}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900">
            {HOME.address}
          </h1>
          <p className="mt-1 text-stone-600">
            {HOME.city} · built {HOME.built} · {HOME.sqft.toLocaleString()} sq
            ft · {HOME.beds} bd / {HOME.baths} ba
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/myhouse/twin"
            className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700"
          >
            Open digital twin
          </Link>
          <button
            onClick={() => setEmergency(true)}
            className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-500"
          >
            ⚠ Emergency
          </button>
        </div>
      </div>

      {session?.type !== "consumer" && (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 ring-1 ring-emerald-200">
          You&apos;re browsing the demo home.{" "}
          <Link href="/auth/myhouse" className="font-semibold underline">
            Create your MyHouse account
          </Link>{" "}
          to add your own address, family, and assets.
        </p>
      )}

      {/* stat tiles */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Home health score", value: String(healthScore), hint: `across ${SYSTEMS.length} systems` },
          { label: "Maintenance due", value: String(dueNow), hint: "tasks need action now" },
          { label: "Active warranties", value: String(activeWarranties), hint: "checked before every quote" },
          { label: "Records on file", value: String(TIMELINE.length + bookings.length), hint: "incl. 3 inherited from prior owner" },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">{t.label}</p>
            <p className="mt-1 text-4xl font-bold text-stone-900">{t.value}</p>
            <p className="mt-1 text-xs text-stone-500">{t.hint}</p>
          </div>
        ))}
      </div>

      {/* section nav */}
      <div className="sticky top-14 z-30 -mx-4 mt-8 overflow-x-auto border-b border-stone-200 bg-[var(--page)]/95 px-4 py-2 backdrop-blur">
        <div className="flex gap-2 whitespace-nowrap">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-300 transition hover:bg-stone-100"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* SYSTEMS */}
      <section id="systems" className="scroll-mt-28 pt-10">
        <h2 className="text-xl font-semibold text-stone-900">Systems &amp; appliances</h2>
        <p className="mt-1 text-sm text-stone-600">
          Health estimated from age, service history, climate, and live sensors.
          Click anything in the{" "}
          <Link href="/myhouse/twin" className="font-medium text-emerald-800 underline">
            digital twin
          </Link>{" "}
          for full detail.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {SYSTEMS.map((s) => (
            <div key={s.id} className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-stone-900">{s.name}</p>
                  <p className="text-sm text-stone-500">{s.detail}</p>
                </div>
                <StatusPill status={s.status} />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>Installed {s.installed} · typical life {s.lifespanYears} yrs</span>
                  <span className="font-semibold text-stone-700" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {s.health}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${s.health}%`, backgroundColor: STATUS_META[s.status].color }}
                  />
                </div>
              </div>
              {s.note && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                  {s.note}
                </p>
              )}
              {s.requestPrefill && (
                <Link
                  href={`/request?desc=${encodeURIComponent(s.requestPrefill)}`}
                  className="mt-3 inline-block rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-stone-700"
                >
                  Get bids for this →
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* sensors strip */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm">
          <span className="font-medium text-stone-900">Live sensors:</span>
          {DEVICES.map((d) => (
            <span key={d.name} className="inline-flex items-center gap-1.5 text-stone-600">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--status-good)" }} />
              {d.name.split("·")[0].trim()} · {d.reading}
            </span>
          ))}
        </div>
      </section>

      {/* MAINTENANCE */}
      <section id="maintenance" className="scroll-mt-28 pt-12">
        <h2 className="text-xl font-semibold text-stone-900">Maintenance engine</h2>
        <p className="mt-1 text-sm text-stone-600">
          Generated from your exact equipment, climate zone, and warranty terms — not a generic checklist.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <ul className="divide-y divide-stone-100">
            {MAINTENANCE.map((m) => (
              <li key={m.task} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900">{m.task}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{m.est}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      m.badge === "overdue"
                        ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                        : m.badge === "soon"
                          ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                          : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {m.due}
                  </span>
                  {m.action === "book" && m.prefill ? (
                    <Link
                      href={`/request?desc=${encodeURIComponent(m.prefill)}`}
                      className="rounded-full bg-emerald-800 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                    >
                      Get bids
                    </Link>
                  ) : (
                    <span className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-600 ring-1 ring-stone-300">
                      DIY guide
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* WARRANTIES */}
      <section id="warranties" className="scroll-mt-28 pt-12">
        <h2 className="text-xl font-semibold text-stone-900">Warranty hub</h2>
        <p className="mt-1 text-sm text-stone-600">
          Auto-imported from receipts, email, Amazon and Home Depot orders. One is expiring —
          claims are filed for you where the manufacturer allows it.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {WARRANTIES.map((w) => (
            <div key={w.item} className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-stone-900">{w.item}</p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    w.state === "active"
                      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                      : w.state === "expiring"
                        ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                        : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {w.state === "active" ? `Until ${w.until}` : w.state === "expiring" ? `Expiring ${w.until}` : "Expired"}
                </span>
              </div>
              <p className="mt-1 text-xs text-stone-500">{w.source}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${w.pctUsed}%`,
                    backgroundColor:
                      w.state === "expired"
                        ? "var(--axis)"
                        : w.state === "expiring"
                          ? "var(--status-warning)"
                          : "var(--status-good)",
                  }}
                />
              </div>
              {w.autoClaim && (
                <p className="mt-2 text-xs font-medium text-emerald-800">
                  ⚡ Auto-claim enabled — we file directly with the manufacturer
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* UTILITIES */}
      <section id="utilities" className="scroll-mt-28 pt-12">
        <h2 className="text-xl font-semibold text-stone-900">Utilities</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 lg:col-span-2">
            <h3 className="font-semibold text-stone-900">Energy use — last 12 months</h3>
            <p className="text-sm text-stone-500">kWh · summer cooling drives the peak; solar offsets ~$118/mo.</p>
            <div className="mt-4">
              <EnergyChart months={ENERGY.months} values={ENERGY.values} />
            </div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h3 className="font-semibold text-stone-900">June bills</h3>
            <ul className="mt-3 space-y-3">
              {UTILITY_BILLS.map((b) => (
                <li key={b.name} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-700">{b.name}</span>
                    <span className="font-semibold text-stone-900" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {b.amount}
                    </span>
                  </div>
                  <p className={`text-xs ${b.up ? "text-red-600" : "text-stone-500"}`}>
                    {b.trend}
                    {b.note ? ` · ${b.note}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* INSURANCE & MORTGAGE */}
      <section id="money" className="scroll-mt-28 pt-12">
        <h2 className="text-xl font-semibold text-stone-900">Insurance &amp; mortgage</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h3 className="font-semibold text-stone-900">Insurance</h3>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["Policy", INSURANCE.carrier],
                ["Premium", INSURANCE.premium],
                ["Deductible", INSURANCE.deductible],
                ["Renewal", INSURANCE.renewal],
                ["Claims", INSURANCE.claims],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-stone-500">{k}</dt>
                  <dd className="text-right font-medium text-stone-800">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
              Coverage gap: {INSURANCE.gap}
            </p>
            <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900 ring-1 ring-emerald-200">
              {INSURANCE.discount}
            </p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h3 className="font-semibold text-stone-900">Mortgage &amp; equity</h3>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["Loan", MORTGAGE.lender],
                ["Balance", MORTGAGE.balance],
                ["Payment", MORTGAGE.payment],
                ["Escrow", MORTGAGE.escrow],
                ["Est. value", `${MORTGAGE.value} (${MORTGAGE.valueTrend})`],
                ["Equity", MORTGAGE.equity],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-stone-500">{k}</dt>
                  <dd className="text-right font-medium text-stone-800">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">{MORTGAGE.refi}</p>
          </div>
        </div>
      </section>

      {/* VEHICLES */}
      <section id="vehicles" className="scroll-mt-28 pt-12">
        <h2 className="text-xl font-semibold text-stone-900">Car garage</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {VEHICLES.map((v) => (
            <div key={v.vin} className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="font-semibold text-stone-900">🚗 {v.name}</p>
              <p className="mt-0.5 text-xs text-stone-500">VIN {v.vin} · {v.miles}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-stone-700">
                <li>{v.next}</li>
                <li>Registration: {v.registration}</li>
                <li>Insurance: {v.insurance}</li>
              </ul>
              {v.alert && (
                <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
                  {v.alert}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* FAMILY */}
      <section id="family" className="scroll-mt-28 pt-12">
        <h2 className="text-xl font-semibold text-stone-900">Family workspace</h2>
        <p className="mt-1 text-sm text-stone-600">Role-based access — owners see everything, kids see chores, guests get a door code that expires.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FAMILY.map((f) => (
            <div key={f.name} className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-stone-900">{f.name}</p>
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-600">
                  {f.role}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-stone-500">{f.access}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TIMELINE */}
      <section id="timeline" className="scroll-mt-28 pt-12">
        <h2 className="text-xl font-semibold text-stone-900">Home timeline</h2>
        <p className="mt-1 text-sm text-stone-600">
          Git history for the house — every event permanent, verified, and transferred to the next owner at sale.
        </p>
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
          <ul className="relative space-y-0 border-l-2 border-stone-200 pl-5">
            {bookings.map((b) => (
              <li key={b.ref} className="relative pb-5">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-stone-900">{b.title}</span>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-800 ring-1 ring-blue-200">
                    Scheduled
                  </span>
                </div>
                <p className="text-xs text-stone-500">{b.provider} · {b.when} · {b.price}</p>
              </li>
            ))}
            {TIMELINE.map((e) => (
              <li key={e.id} className="relative pb-5 last:pb-0">
                <span
                  className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white"
                  style={{
                    backgroundColor:
                      e.kind === "purchase" ? "var(--status-warning)" : e.kind === "imported" ? "var(--axis)" : "var(--seq-450)",
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-stone-900">{e.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${KIND_STYLE[e.kind]}`}>
                    {e.kind}
                  </span>
                  <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">{e.id}</code>
                </div>
                <p className="text-xs text-stone-500">
                  {e.date} · {e.actor}
                  {e.cost ? ` · ${e.cost}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* EMERGENCY OVERLAY */}
      {emergency && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/90 p-4 backdrop-blur-sm" onClick={() => setEmergency(false)}>
          <div className="mx-auto my-8 max-w-3xl rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-red-600">⚠ Emergency mode</h2>
              <button
                onClick={() => setEmergency(false)}
                className="rounded-full bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-200"
              >
                Close
              </button>
            </div>

            <h3 className="mt-5 text-sm font-bold uppercase tracking-wide text-stone-500">Shut it off</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {EMERGENCY.shutoffs.map((s) => (
                <div key={s.name} className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
                  <p className="font-bold text-red-800">{s.name}</p>
                  <p className="mt-1 text-sm text-stone-800">{s.where}</p>
                  <p className="mt-1 text-xs text-stone-600">{s.how}</p>
                </div>
              ))}
            </div>
            <Link href="/myhouse/twin" className="mt-2 inline-block text-sm font-medium text-emerald-800 underline">
              Show shutoff locations on the digital twin →
            </Link>

            <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-stone-500">Call</h3>
            <ul className="mt-2 space-y-2">
              {EMERGENCY.contacts.map((c) => (
                <li key={c.name} className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3 text-sm">
                  <span className="font-medium text-stone-900">{c.name}</span>
                  <span className="font-semibold text-stone-700" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {c.phone}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-4 rounded-xl bg-stone-100 p-3 text-xs text-stone-600">
              House access: {EMERGENCY.access}. An emergency job is pre-drafted with your home&apos;s
              details —{" "}
              <Link href="/request?desc=Emergency%20—%20active%20water%20leak%2C%20main%20already%20shut%20off.%20Need%20a%20plumber%20now." className="font-semibold text-emerald-800 underline">
                broadcast it now →
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
