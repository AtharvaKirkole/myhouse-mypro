"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORIES, Category, HOME } from "@/lib/data";
import {
  Bid,
  StructuredJob,
  Urgency,
  addBooking,
  makeBids,
  makeRef,
  parseJob,
} from "@/lib/jobs";
import { Avatar, Stars, VerifiedBadges } from "@/components/shared";

type Step = "describe" | "review" | "bids" | "dispatched";

const EXAMPLES = [
  "Water is dripping from the ceiling under the upstairs bathroom",
  "AC is running but the house is not cooling, it's 88° inside",
  "Half the outlets in the kitchen have no power",
  "Need my 2015 water heater replaced before it fails",
  "Deep clean before family visits this weekend",
];

const URGENCY_LABEL: Record<Urgency, string> = {
  emergency: "Emergency — today",
  week: "This week",
  flexible: "Flexible",
};

const DISPATCH_STEPS = [
  "Bid accepted",
  "Technician assigned",
  "En route",
  "On site",
];

export default function RequestPage() {
  const [step, setStep] = useState<Step>("describe");
  const [text, setText] = useState("");
  const [job, setJob] = useState<StructuredJob | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [sort, setSort] = useState<"match" | "price" | "eta">("match");
  const [accepted, setAccepted] = useState<Bid | null>(null);
  const [dispatchIdx, setDispatchIdx] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // prefill from ?desc= (deep link from the Home Passport)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const desc = params.get("desc");
    if (desc) setText(desc);
  }, []);

  // clear timers on unmount
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  function toReview() {
    if (!text.trim()) return;
    setJob(parseJob(text));
    setStep("review");
  }

  function broadcast() {
    if (!job) return;
    const all = makeBids(job);
    setBids([]);
    setPendingCount(all.length);
    setStep("bids");
    all.forEach((b) => {
      timers.current.push(
        setTimeout(() => {
          setBids((prev) => [...prev, b]);
          setPendingCount((n) => Math.max(0, n - 1));
        }, b.delayMs)
      );
    });
  }

  function accept(b: Bid) {
    setAccepted(b);
    setStep("dispatched");
    setDispatchIdx(0);
    addBooking({
      ref: makeRef(),
      title: job?.title ?? "Service job",
      provider: b.provider.business,
      when: b.etaLabel,
      price: `$${b.price}`,
      createdAt: Date.now(),
    });
    [1, 2].forEach((i) =>
      timers.current.push(setTimeout(() => setDispatchIdx(i), i * 2600))
    );
  }

  const sortedBids = useMemo(() => {
    const arr = [...bids];
    if (sort === "price") arr.sort((a, b) => a.price - b.price);
    else if (sort === "eta") arr.sort((a, b) => a.delayMs - b.delayMs);
    else
      arr.sort(
        (a, b) =>
          b.provider.rating * 100 -
          b.provider.distanceMi -
          (a.provider.rating * 100 - a.provider.distanceMi)
      );
    return arr;
  }, [bids, sort]);

  const broadcastCount = useMemo(
    () => 34 + ((job?.description.length ?? 0) % 21),
    [job]
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* stepper */}
      <div className="mb-8 flex items-center gap-2 text-xs font-medium text-stone-500">
        {(["describe", "review", "bids", "dispatched"] as Step[]).map(
          (s, i) => {
            const order: Step[] = ["describe", "review", "bids", "dispatched"];
            const activeIdx = order.indexOf(step);
            const on = i <= activeIdx;
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <span className="h-px w-6 bg-stone-300" />}
                <span
                  className={`rounded-full px-2.5 py-1 capitalize ${
                    on ? "bg-stone-900 text-white" : "bg-stone-100"
                  }`}
                >
                  {s === "bids" ? "live bids" : s}
                </span>
              </div>
            );
          }
        )}
      </div>

      {/* STEP 1 — describe */}
      {step === "describe" && (
        <section>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">
            What&apos;s going on?
          </h1>
          <p className="mt-1 text-stone-600">
            Describe it in plain words. We&apos;ll structure the job — you never
            search for a pro.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder='e.g. "Water is dripping from the ceiling under the upstairs bathroom…"'
            className="mt-6 w-full rounded-2xl border border-stone-300 bg-white p-4 text-base outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setText(ex)}
                className="rounded-full bg-white px-3 py-1.5 text-xs text-stone-600 ring-1 ring-stone-300 transition hover:bg-stone-100"
              >
                {ex}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white p-4 text-sm text-stone-500">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 7h3l2-3h6l2 3h3v13H4V7Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            Add photos (optional) — pros bid more accurately with a picture.
          </div>

          <button
            onClick={toReview}
            disabled={!text.trim()}
            className="mt-6 w-full rounded-full bg-emerald-800 py-3 text-sm font-semibold text-white transition enabled:hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-8"
          >
            Structure my job →
          </button>
        </section>
      )}

      {/* STEP 2 — review structured job */}
      {step === "review" && job && (
        <section>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">
            Your structured job
          </h1>
          <p className="mt-1 text-stone-600">
            Built from your description. Fix anything that&apos;s off, then
            broadcast it.
          </p>

          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold text-stone-900">{job.title}</h2>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                est. ${job.budget.min}–${job.budget.max}
              </span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-stone-900">Category</span>
                <select
                  value={job.category}
                  onChange={(e) =>
                    setJob({ ...job, category: e.target.value as Category })
                  }
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-emerald-700"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>

              <div className="text-sm">
                <span className="font-medium text-stone-900">Urgency</span>
                <div className="mt-1 flex gap-2">
                  {(Object.keys(URGENCY_LABEL) as Urgency[]).map((u) => (
                    <button
                      key={u}
                      onClick={() => setJob({ ...job, urgency: u })}
                      className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                        job.urgency === u
                          ? "bg-emerald-800 text-white"
                          : "bg-white text-stone-600 ring-1 ring-stone-300"
                      }`}
                    >
                      {URGENCY_LABEL[u]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 text-sm">
              <span className="font-medium text-stone-900">Location</span>
              <p className="mt-1 rounded-xl bg-stone-50 px-3 py-2 text-stone-700">
                {job.location} · {HOME.address}, {HOME.city}
              </p>
            </div>

            <div className="mt-4 text-sm">
              <span className="font-medium text-stone-900">Your words</span>
              <p className="mt-1 rounded-xl bg-stone-50 px-3 py-2 italic text-stone-700">
                &ldquo;{job.description}&rdquo;
              </p>
            </div>

            <div className="mt-4 text-sm">
              <span className="font-medium text-stone-900">
                Suggested scope (pros bid against this)
              </span>
              <ul className="mt-2 space-y-1.5">
                {job.scope.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-stone-700">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="mt-0.5 shrink-0 text-emerald-700"
                      aria-hidden
                    >
                      <path
                        d="m5 12 5 5 9-10"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={broadcast}
              className="rounded-full bg-emerald-800 px-8 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Broadcast to {broadcastCount} pros nearby →
            </button>
            <button
              onClick={() => setStep("describe")}
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 transition hover:bg-stone-50"
            >
              ← Edit description
            </button>
          </div>
        </section>
      )}

      {/* STEP 3 — live bids */}
      {step === "bids" && job && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-stone-900">
                <span className="live-dot inline-block h-3 w-3 rounded-full bg-red-500" />
                Live bids
              </h1>
              <p className="mt-1 text-stone-600">
                {job.title} · broadcast to {broadcastCount} verified pros near{" "}
                {HOME.city.split(",")[0]}
              </p>
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm outline-none"
            >
              <option value="match">Best match</option>
              <option value="price">Lowest price</option>
              <option value="eta">Fastest arrival</option>
            </select>
          </div>

          <div className="mt-6 space-y-3">
            {sortedBids.map((b) => (
              <div
                key={b.id}
                className="bid-enter flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 sm:flex-row sm:items-center"
              >
                <div className="flex flex-1 items-start gap-3">
                  <Avatar name={b.provider.name} />
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900">
                      {b.provider.business}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-stone-500">
                      <Stars rating={b.provider.rating} />
                      <span>{b.provider.jobs.toLocaleString()} jobs</span>
                      <span>{b.provider.distanceMi} mi</span>
                    </div>
                    <p className="mt-1.5 text-sm text-stone-600">{b.note}</p>
                    <div className="mt-2">
                      <VerifiedBadges v={b.provider.verified} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-stone-900">${b.price}</p>
                    <p className="text-xs font-medium text-emerald-800">
                      {b.etaLabel}
                    </p>
                  </div>
                  <button
                    onClick={() => accept(b)}
                    className="rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-stone-700"
                  >
                    Accept
                  </button>
                </div>
              </div>
            ))}

            {pendingCount > 0 && (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">
                <span className="live-dot inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />
                {bids.length === 0
                  ? "Pros are reviewing your job…"
                  : `${pendingCount} more pro${pendingCount > 1 ? "s" : ""} typing a bid…`}
              </div>
            )}
          </div>
        </section>
      )}

      {/* STEP 4 — dispatched */}
      {step === "dispatched" && accepted && job && (
        <section>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">
            Dispatched 🚚
          </h1>
          <p className="mt-1 text-stone-600">
            {accepted.provider.business} accepted — {accepted.etaLabel.toLowerCase()}.
          </p>

          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
            <ol className="space-y-4">
              {DISPATCH_STEPS.map((s, i) => {
                const done = i <= dispatchIdx;
                const current = i === dispatchIdx;
                return (
                  <li key={s} className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                        done
                          ? "bg-emerald-800 text-white"
                          : "bg-stone-100 text-stone-400"
                      }`}
                    >
                      {done ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="m5 12 5 5 9-10"
                            stroke="currentColor"
                            strokeWidth="3.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span
                      className={`text-sm ${
                        done ? "font-semibold text-stone-900" : "text-stone-400"
                      }`}
                    >
                      {s}
                      {current && i === 2 && (
                        <span className="ml-2 text-xs font-normal text-emerald-800">
                          live ETA on the day of service
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-6 grid gap-3 rounded-xl bg-stone-50 p-4 text-sm text-stone-600 sm:grid-cols-2">
              <p>
                <span className="font-medium text-stone-900">Job:</span> {job.title}
              </p>
              <p>
                <span className="font-medium text-stone-900">Fixed price:</span>{" "}
                ${accepted.price} — held in escrow, released when you confirm
              </p>
              <p>
                <span className="font-medium text-stone-900">Pro:</span>{" "}
                {accepted.provider.name}, {accepted.provider.business}
              </p>
              <p>
                <span className="font-medium text-stone-900">Address:</span>{" "}
                {HOME.address}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
            When this job completes, the invoice, photos, and parts installed
            are written into your{" "}
            <Link href="/passport" className="font-semibold underline">
              Home Passport
            </Link>{" "}
            automatically — building your home&apos;s verified service history.
          </div>

          <button
            onClick={() => {
              setStep("describe");
              setText("");
              setJob(null);
              setBids([]);
              setAccepted(null);
            }}
            className="mt-6 rounded-full bg-white px-6 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 transition hover:bg-stone-50"
          >
            Post another job
          </button>
        </section>
      )}
    </div>
  );
}
