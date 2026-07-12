"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROFESSIONS, saveSession } from "@/lib/account";

const STEPS = ["Account", "Business", "Credentials", "Operations"];

export default function MyProAuth() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    email: "",
    business: "",
    professions: [] as string[],
    years: "5–10",
    certifications: "",
    license: "",
    insurance: "",
    ein: "",
    radiusMi: 15,
    baseCity: "Phoenix, AZ",
    emergency: false,
    teamSize: "Just me",
    hours: "Mon–Fri 7 AM – 5 PM",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleProfession(p: string) {
    set(
      "professions",
      form.professions.includes(p)
        ? form.professions.filter((x) => x !== p)
        : [...form.professions, p]
    );
  }

  function finish() {
    saveSession({ type: "pro", pro: { ...form, liveLocation: false } });
    router.push("/mypro");
  }

  function login() {
    saveSession({
      type: "pro",
      pro: {
        name: form.name || "Marcus Rivera",
        email: form.email,
        business: "BlueLine Plumbing Co.",
        professions: ["Plumber"],
        years: "10+",
        certifications: "Rheem certified installer",
        license: "AZ ROC #312448",
        insurance: "GL $2M · Hartford",
        ein: "86-1234567",
        radiusMi: 15,
        baseCity: "Phoenix, AZ",
        emergency: true,
        teamSize: "2–5",
        hours: "Mon–Sat 7 AM – 6 PM",
        liveLocation: false,
      },
    });
    router.push("/mypro");
  }

  const input =
    "mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500";

  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <div className="text-center">
        <span className="text-4xl">🧰</span>
        <h1 className="mt-2 text-2xl font-bold text-stone-900">MyPro</h1>
        <p className="text-sm text-stone-500">The operating system for your service business</p>
      </div>

      <div className="mx-auto mt-6 flex w-fit rounded-full bg-stone-100 p-1 text-sm font-medium">
        {(["signup", "login"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setStep(0);
            }}
            className={`rounded-full px-5 py-1.5 transition ${
              mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
            }`}
          >
            {m === "signup" ? "Sign up" : "Log in"}
          </button>
        ))}
      </div>

      {mode === "signup" && (
        <div className="mt-6 flex items-center justify-center gap-1 text-[11px] font-medium text-stone-400">
          {STEPS.map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              {i > 0 && <span className="h-px w-4 bg-stone-300" />}
              <span className={`rounded-full px-2 py-0.5 ${i === step ? "bg-amber-500 text-white" : i < step ? "bg-stone-200 text-stone-600" : "bg-stone-100"}`}>
                {s}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-6">
        {mode === "login" ? (
          <div>
            <label className="block text-sm font-medium text-stone-900">
              Business email
              <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@yourbusiness.com" className={input} />
            </label>
            <label className="mt-3 block text-sm font-medium text-stone-900">
              Password
              <input type="password" placeholder="••••••••" className={input} />
            </label>
            <button
              onClick={login}
              disabled={!form.email.includes("@")}
              className="mt-5 w-full rounded-full bg-amber-500 py-2.5 text-sm font-bold text-white transition enabled:hover:bg-amber-400 disabled:opacity-40"
            >
              Log in
            </button>
            <p className="mt-3 text-center text-xs text-stone-400">Demo — any email logs into the sample pro account</p>
          </div>
        ) : step === 0 ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-stone-700">
              Your name
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Marcus Rivera" className={input} />
            </label>
            <label className="block text-sm font-medium text-stone-700">
              Business email
              <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="marcus@blueline.com" className={input} />
            </label>
            <label className="block text-sm font-medium text-stone-700">
              Business name
              <input value={form.business} onChange={(e) => set("business", e.target.value)} placeholder="BlueLine Plumbing Co." className={input} />
            </label>
            <button
              onClick={() => setStep(1)}
              disabled={!form.name || !form.business}
              className="mt-2 w-full rounded-full bg-amber-500 py-2.5 text-sm font-bold text-white transition enabled:hover:bg-amber-400 disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        ) : step === 1 ? (
          <div>
            <p className="text-sm font-medium text-stone-700">
              Specialties <span className="text-xs font-normal text-stone-400">— pick every trade you work</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PROFESSIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => toggleProfession(p)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    form.professions.includes(p)
                      ? "bg-amber-500 text-white"
                      : "bg-white text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-stone-700">
                Experience
                <select value={form.years} onChange={(e) => set("years", e.target.value)} className={`${input} bg-white`}>
                  {["<2", "2–5", "5–10", "10+"].map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-stone-700">
                Team size
                <select value={form.teamSize} onChange={(e) => set("teamSize", e.target.value)} className={`${input} bg-white`}>
                  {["Just me", "2–5", "6–15", "16+"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={form.professions.length === 0}
              className="mt-5 w-full rounded-full bg-amber-500 py-2.5 text-sm font-bold text-white transition enabled:hover:bg-amber-400 disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        ) : step === 2 ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-stone-700">
              License number(s)
              <input value={form.license} onChange={(e) => set("license", e.target.value)} placeholder="AZ ROC #312448" className={input} />
              <span className="mt-1 block text-xs font-normal text-stone-400">
                Verified against the state contractor registry before your feed activates
              </span>
            </label>
            <label className="block text-sm font-medium text-stone-700">
              Insurance (carrier + coverage)
              <input value={form.insurance} onChange={(e) => set("insurance", e.target.value)} placeholder="GL $2M · Hartford" className={input} />
            </label>
            <label className="block text-sm font-medium text-stone-700">
              EIN / business registration
              <input value={form.ein} onChange={(e) => set("ein", e.target.value)} placeholder="86-1234567" className={input} />
            </label>
            <label className="block text-sm font-medium text-stone-700">
              Certifications <span className="text-xs font-normal text-stone-400">(optional)</span>
              <input value={form.certifications} onChange={(e) => set("certifications", e.target.value)} placeholder="NATE, Rheem certified, EPA 608…" className={input} />
            </label>
            <button
              onClick={() => setStep(3)}
              disabled={!form.license || !form.insurance}
              className="mt-2 w-full rounded-full bg-amber-500 py-2.5 text-sm font-bold text-white transition enabled:hover:bg-amber-400 disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-stone-700">
              Base location
              <input value={form.baseCity} onChange={(e) => set("baseCity", e.target.value)} className={input} />
            </label>
            <div className="text-sm font-medium text-stone-700">
              Service radius: <span className="font-bold text-amber-600">{form.radiusMi} mi</span>
              <input
                type="range"
                min={5}
                max={40}
                value={form.radiusMi}
                onChange={(e) => set("radiusMi", Number(e.target.value))}
                className="mt-2 w-full accent-amber-500"
              />
            </div>
            <label className="block text-sm font-medium text-stone-700">
              Business hours
              <input value={form.hours} onChange={(e) => set("hours", e.target.value)} className={input} />
            </label>
            <button
              onClick={() => set("emergency", !form.emergency)}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition ${
                form.emergency ? "border-amber-400 bg-amber-50 text-amber-900" : "border-stone-300 text-stone-600"
              }`}
            >
              24/7 emergency availability
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${form.emergency ? "bg-amber-500 text-white" : "bg-stone-200 text-stone-500"}`}>
                {form.emergency ? "ON" : "OFF"}
              </span>
            </button>
            <button
              onClick={finish}
              className="w-full rounded-full bg-amber-500 py-2.5 text-sm font-bold text-white transition hover:bg-amber-400"
            >
              Create pro account &amp; open dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
