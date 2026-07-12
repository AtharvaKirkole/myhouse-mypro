import Link from "next/link";

export default function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="pb-12 pt-16 text-center sm:pt-24">
        <p className="mx-auto mb-4 w-fit rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-200">
          Two products · one shared record of every home in America
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-stone-900 sm:text-6xl">
          The operating system for home ownership.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-stone-600">
          <span className="font-semibold text-stone-900">MyHouse</span> gives
          every home a digital twin, a permanent history, and a maintenance
          brain. <span className="font-semibold text-stone-900">MyPro</span>{" "}
          gives every service professional the business OS — and the two feed
          each other.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/myhouse"
            className="rounded-full bg-emerald-800 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Open MyHouse demo
          </Link>
          <Link
            href="/mypro"
            className="rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-400"
          >
            See MyPro
          </Link>
        </div>
      </section>

      {/* Two products */}
      <section className="grid gap-4 pb-12 md:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Product 1 · for homeowners
          </p>
          <h2 className="mt-2 text-2xl font-bold text-stone-900">MyHouse</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            Apple Health + CarFax + GitHub, for your house. A persistent digital
            identity that outlives every owner.
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-stone-700">
            {[
              "Interactive digital twin",
              "Git-style home timeline",
              "Predictive maintenance",
              "Warranty auto-import",
              "Utilities & energy",
              "Insurance & mortgage",
              "Car garage",
              "Family roles & guests",
              "One-tap emergency mode",
              "Reverse-marketplace jobs",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex gap-2">
            <Link
              href="/myhouse"
              className="rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-stone-700"
            >
              Dashboard →
            </Link>
            <Link
              href="/myhouse/twin"
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 transition hover:bg-stone-50"
            >
              Digital twin →
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-300 bg-white p-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Product 2 · for professionals
          </p>
          <h2 className="mt-2 text-2xl font-bold text-stone-900">MyPro</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            Jobs arrive pre-diagnosed with the home&apos;s full record attached.
            No quoting visits, no marketing, paid on verification.
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-stone-700">
            {[
              "Structured job feed",
              "Bid with full context",
              "Optimized daily routes",
              "First-time-fix analytics",
              "License & insurance vault",
              "Instant payouts + escrow",
              "Repeat-customer engine",
              "Warranty tracking",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <Link
              href="/mypro"
              className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-400"
            >
              Pro dashboard →
            </Link>
          </div>
        </div>
      </section>

      {/* The flywheel */}
      <section className="rounded-2xl border border-stone-200 bg-white p-8">
        <h2 className="text-center text-lg font-semibold text-stone-900">
          Every completed repair makes the whole system smarter
        </h2>
        <div className="mt-6 grid gap-6 text-sm text-stone-600 sm:grid-cols-4">
          {[
            {
              icon: "🏠",
              t: "The home's record grows",
              d: "Invoice, photos, and parts written to the permanent timeline — it transfers with the deed.",
            },
            {
              icon: "🧰",
              t: "The appliance history deepens",
              d: "Every Rheem 50-gal failure teaches the model when the next one fails.",
            },
            {
              icon: "⭐",
              t: "The pro's reputation compounds",
              d: "First-time-fix and callback rates measured on ground truth, not stars.",
            },
            {
              icon: "📈",
              t: "Pricing gets honest",
              d: "Real job costs by task, model, and ZIP — the end of the mystery quote.",
            },
          ].map((x) => (
            <div key={x.t} className="text-center">
              <p className="text-2xl">{x.icon}</p>
              <p className="mt-2 font-medium text-stone-900">{x.t}</p>
              <p className="mt-1">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Property manager teaser */}
      <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6">
        <div>
          <p className="font-semibold text-stone-900">
            Property Manager workspace
          </p>
          <p className="text-sm text-stone-600">
            Hundreds of units, bulk maintenance, vendor analytics — same shared
            record. Third account type, on the roadmap.
          </p>
        </div>
        <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-600">
          Coming soon
        </span>
      </section>
    </div>
  );
}
