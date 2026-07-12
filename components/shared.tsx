import { Provider, STATUS_META, StatusLevel } from "@/lib/data";

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-stone-800">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className="text-amber-500">
        <path
          fill="currentColor"
          d="m12 2 2.9 6.26 6.6.72-4.9 4.55 1.34 6.57L12 16.77 6.06 20.1l1.34-6.57L2.5 8.98l6.6-.72L12 2Z"
        />
      </svg>
      {rating.toFixed(1)}
    </span>
  );
}

export function VerifiedBadges({ v }: { v: Provider["verified"] }) {
  const items = [
    { on: v.license, label: "Licensed" },
    { on: v.insurance, label: "Insured" },
    { on: v.background, label: "Background ✓" },
  ].filter((i) => i.on);

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span
          key={i.label}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900 ring-1 ring-emerald-200"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="m5 12 5 5 9-10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function StatusPill({ status }: { status: StatusLevel }) {
  const meta = STATUS_META[status];
  const icon =
    status === "good" ? (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="m5 12 5 5 9-10"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ) : (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 5v9m0 4v.1"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
    );

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: meta.color }}
    >
      {icon}
      {meta.label}
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-700">
      {initials}
    </span>
  );
}
