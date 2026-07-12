"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CATEGORIES, Category, HOME, PROVIDERS, Provider } from "@/lib/data";
import { addBooking, makeRef } from "@/lib/jobs";
import { Avatar, Stars, VerifiedBadges } from "@/components/shared";

const SLOTS = ["8–10 AM", "10–12 PM", "1–3 PM", "3–5 PM"];

function nextDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 1; i <= n; i++) {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    out.push(
      day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    );
  }
  return out;
}

export default function Marketplace() {
  const [category, setCategory] = useState<Category | "All">("All");
  const [query, setQuery] = useState("");
  const [booking, setBooking] = useState<Provider | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [confirmedRef, setConfirmedRef] = useState<string | null>(null);

  const days = useMemo(() => nextDays(5), []);

  const results = useMemo(() => {
    return PROVIDERS.filter((p) => {
      if (category !== "All" && p.category !== category) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.business.toLowerCase().includes(q) ||
          p.bio.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [category, query]);

  function openBooking(p: Provider) {
    setBooking(p);
    setDay(null);
    setSlot(null);
    setConfirmedRef(null);
  }

  function confirm() {
    if (!booking || !day || !slot) return;
    const ref = makeRef();
    addBooking({
      ref,
      title: `${booking.category} visit`,
      provider: booking.business,
      when: `${day}, ${slot}`,
      price: `from $${booking.startingPrice}`,
      createdAt: Date.now(),
    });
    setConfirmedRef(ref);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">
            Browse pros
          </h1>
          <p className="mt-1 text-stone-600">
            Verified providers near {HOME.city}. Their prices, your pick.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, trade, keyword…"
          className="w-full max-w-xs rounded-full border border-stone-300 bg-white px-4 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {/* category chips */}
      <div className="mt-6 flex flex-wrap gap-2">
        {(["All", ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              category === c
                ? "bg-stone-900 text-white"
                : "bg-white text-stone-600 ring-1 ring-stone-300 hover:bg-stone-100"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* results */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((p) => (
          <div
            key={p.id}
            className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 transition hover:border-stone-300 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <Avatar name={p.name} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-stone-900">{p.business}</p>
                <p className="text-sm text-stone-500">
                  {p.name} · {p.category}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3 text-sm text-stone-600">
              <Stars rating={p.rating} />
              <span>{p.jobs.toLocaleString()} jobs</span>
              <span>{p.distanceMi} mi</span>
            </div>

            <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-stone-600">
              {p.bio}
            </p>

            <div className="mt-3">
              <VerifiedBadges v={p.verified} />
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-4">
              <div>
                <p className="text-xs text-stone-500">from</p>
                <p className="text-lg font-bold text-stone-900">
                  ${p.startingPrice}
                </p>
              </div>
              <button
                onClick={() => openBooking(p)}
                className="rounded-full bg-emerald-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Instant book
              </button>
            </div>
          </div>
        ))}
      </div>

      {results.length === 0 && (
        <div className="mt-16 rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
          <p>No pros match that search.</p>
          <p className="mt-2 text-sm">
            Try the{" "}
            <Link href="/request" className="font-medium text-emerald-800 underline">
              reverse marketplace
            </Link>{" "}
            — describe the job and let providers come to you.
          </p>
        </div>
      )}

      {/* booking modal */}
      {booking && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setBooking(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmedRef ? (
              <div className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="m5 12 5 5 9-10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <h2 className="mt-3 text-xl font-bold text-stone-900">Booked</h2>
                <p className="mt-1 text-sm text-stone-600">
                  {booking.business} · {day}, {slot}
                </p>
                <p className="mt-1 text-xs text-stone-500">Ref {confirmedRef}</p>
                <div className="mt-4 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                  This visit was saved to your{" "}
                  <Link
                    href="/passport"
                    className="font-medium text-emerald-800 underline"
                  >
                    Home Passport
                  </Link>{" "}
                  — the invoice and photos will attach automatically when the
                  job completes.
                </div>
                <button
                  onClick={() => setBooking(null)}
                  className="mt-5 w-full rounded-full bg-stone-900 py-2.5 text-sm font-semibold text-white"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <Avatar name={booking.name} />
                  <div>
                    <p className="font-semibold text-stone-900">{booking.business}</p>
                    <p className="text-sm text-stone-500">
                      {booking.category} · from ${booking.startingPrice} ·
                      responds in ~{booking.responseMin} min
                    </p>
                  </div>
                </div>

                <p className="mt-5 text-sm font-medium text-stone-900">Pick a day</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {days.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDay(d)}
                      className={`rounded-full px-3 py-1.5 text-sm transition ${
                        day === d
                          ? "bg-emerald-800 text-white"
                          : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>

                <p className="mt-4 text-sm font-medium text-stone-900">Time window</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SLOTS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSlot(s)}
                      className={`rounded-full px-3 py-1.5 text-sm transition ${
                        slot === s
                          ? "bg-emerald-800 text-white"
                          : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-xl bg-stone-50 p-3 text-xs text-stone-500">
                  Service address: {HOME.address}, {HOME.city}. Payment is held
                  in escrow and released when you confirm the job is done.
                </div>

                <button
                  disabled={!day || !slot}
                  onClick={confirm}
                  className="mt-5 w-full rounded-full bg-emerald-800 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Confirm booking
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
