"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Session, clearSession, getSession } from "@/lib/account";

const LINKS = [
  { href: "/myhouse", label: "MyHouse" },
  { href: "/myhouse/twin", label: "Digital Twin" },
  { href: "/assets", label: "Assets" },
  { href: "/request", label: "Post a job" },
  { href: "/marketplace", label: "Browse pros" },
];

const NOTIFS = [
  { icon: "📜", title: "LG fridge warranty expires in 5 months", detail: "Extended coverage available until Dec 26", time: "2h" },
  { icon: "🔧", title: "HVAC filter overdue by 6 days", detail: "10-min DIY · filter size 16×25×1 saved", time: "6h" },
  { icon: "⚠️", title: "Recall: 2018 Honda Civic fuel pump", detail: "Free fix at any Honda dealer (NHTSA 23V-857)", time: "1d" },
  { icon: "🚚", title: "Desert Air arriving Thu 8–10 AM", detail: "AC tune-up · Ray D. · photo ID in app", time: "1d" },
  { icon: "🏦", title: "Insurance renewal in 8 months", detail: "Sensor discount (6%) still unapplied — save $111/yr", time: "3d" },
  { icon: "🏘️", title: "HOA: monsoon-season roof reminder", detail: "Community notice · inspection recommended", time: "4d" },
];

export default function Nav() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [read, setRead] = useState(false);

  useEffect(() => {
    const sync = () => setSession(getSession());
    sync();
    window.addEventListener("mh-session", sync);
    return () => window.removeEventListener("mh-session", sync);
  }, []);

  const who =
    session?.type === "consumer"
      ? session.consumer.name
      : session?.type === "pro"
        ? session.pro.business || session.pro.name
        : null;

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/70 shadow-[0_1px_12px_-6px_rgba(28,25,23,0.1)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-800 text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3 11.5 12 4l9 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.5 10.5V20h13v-9.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="hidden text-lg font-semibold tracking-tight text-stone-900 sm:block">
            MyHouse
          </span>
        </Link>

        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap sm:gap-1.5">
          {LINKS.map((l) => {
            const active =
              l.href === "/myhouse" ? pathname === "/myhouse" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <Link
            href="/mypro"
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition ${
              pathname.startsWith("/mypro")
                ? "bg-amber-500 text-white ring-amber-500"
                : "bg-amber-50 text-amber-900 ring-amber-300 hover:bg-amber-100"
            }`}
          >
            MyPro
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* notifications */}
          <div className="relative">
            <button
              onClick={() => {
                setBellOpen((o) => !o);
                setRead(true);
              }}
              aria-label="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M10 20a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {!read && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>
            {bellOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
                  <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                    Notifications
                  </p>
                  <ul className="max-h-96 overflow-y-auto">
                    {NOTIFS.map((n) => (
                      <li key={n.title} className="flex gap-3 rounded-xl px-3 py-2.5 transition hover:bg-stone-50">
                        <span className="text-lg">{n.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug text-stone-900">{n.title}</p>
                          <p className="mt-0.5 text-xs text-stone-500">{n.detail}</p>
                        </div>
                        <span className="text-[10px] text-stone-400">{n.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>

          {/* account */}
          {who ? (
            <div className="flex items-center gap-1.5">
              <span
                className={`hidden max-w-36 truncate rounded-full px-3 py-1.5 text-xs font-semibold md:block ${
                  session?.type === "pro" ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
                }`}
              >
                {who}
              </span>
              <button
                onClick={() => clearSession()}
                className="rounded-full px-2.5 py-1.5 text-xs font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
              >
                Log out
              </button>
            </div>
          ) : (
            <Link
              href="/auth"
              className="rounded-full bg-stone-900 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-stone-700"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
