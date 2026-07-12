import Link from "next/link";

export default function AuthChooser() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-center text-3xl font-bold tracking-tight text-stone-900">
        Which side are you on?
      </h1>
      <p className="mt-2 text-center text-stone-600">
        Two products, two accounts. Pick where you belong — you can add the
        other later.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Link
          href="/auth/myhouse"
          className="group rounded-2xl border-2 border-emerald-700 bg-white p-8 transition hover:shadow-lg"
        >
          <p className="text-4xl">🏠</p>
          <h2 className="mt-3 text-2xl font-bold text-stone-900">MyHouse</h2>
          <p className="mt-1 text-sm font-medium text-emerald-800">
            I own or rent a home
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-stone-600">
            <li>· Digital twin &amp; asset inventory</li>
            <li>· Warranties, maintenance, timeline</li>
            <li>· Post jobs, pros compete</li>
          </ul>
          <p className="mt-5 inline-block rounded-full bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white transition group-hover:bg-emerald-700">
            Create homeowner account →
          </p>
        </Link>

        <Link
          href="/auth/mypro"
          className="group rounded-2xl border-2 border-amber-400 bg-white p-8 transition hover:shadow-lg"
        >
          <p className="text-4xl">🧰</p>
          <h2 className="mt-3 text-2xl font-bold text-stone-900">MyPro</h2>
          <p className="mt-1 text-sm font-medium text-amber-700">
            I&apos;m a service professional
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-stone-600">
            <li>· Structured jobs with home records attached</li>
            <li>· Optimized routes &amp; instant payouts</li>
            <li>· Free back-office: CRM, invoices, payroll</li>
          </ul>
          <p className="mt-5 inline-block rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition group-hover:bg-amber-400">
            Create pro account →
          </p>
        </Link>
      </div>

      <p className="mt-8 text-center text-sm text-stone-500">
        Already have an account? Sign in from either flow — same buttons, we
        detect your account type.
      </p>
    </div>
  );
}
