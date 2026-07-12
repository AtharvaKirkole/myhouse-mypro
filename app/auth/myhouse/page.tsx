"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession } from "@/lib/account";

const METHODS = [
  { id: "google", label: "Continue with Google", icon: "G" },
  { id: "apple", label: "Continue with Apple", icon: "" },
  { id: "phone", label: "Continue with phone", icon: "📱" },
  { id: "email", label: "Continue with email", icon: "✉️" },
];

const PROPERTY_TYPES = ["Single family", "Townhome", "Condo / apartment", "Multi-family", "Vacation home"];

export default function MyHouseAuth() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    address: "",
    propertyType: PROPERTY_TYPES[0],
    ownerType: "Homeowner",
    familySize: "2",
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function finish() {
    saveSession({
      type: "consumer",
      consumer: { ...form, method: method || "email" },
    });
    router.push("/myhouse");
  }

  function login() {
    saveSession({
      type: "consumer",
      consumer: {
        name: form.name || form.email.split("@")[0] || "Homeowner",
        email: form.email,
        method: "email",
        address: "4821 E Maple Hollow Dr, Phoenix, AZ 85018",
        propertyType: "Single family",
        ownerType: "Homeowner",
        familySize: "4",
      },
    });
    router.push("/myhouse");
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="text-center">
        <span className="text-4xl">🏠</span>
        <h1 className="mt-2 text-2xl font-bold text-stone-900">MyHouse</h1>
        <p className="text-sm text-stone-500">Your home&apos;s operating system</p>
      </div>

      {/* mode toggle */}
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

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        {mode === "login" ? (
          <div>
            <label className="block text-sm font-medium text-stone-900">
              Email
              <input
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-stone-900">
              Password
              <input
                type="password"
                placeholder="••••••••"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700"
              />
            </label>
            <button
              onClick={login}
              disabled={!form.email.includes("@")}
              className="mt-5 w-full rounded-full bg-emerald-800 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-emerald-700 disabled:opacity-40"
            >
              Log in
            </button>
            <p className="mt-3 text-center text-xs text-stone-400">
              Demo — any email works, no real password check
            </p>
          </div>
        ) : step === 0 ? (
          <div>
            <p className="text-sm font-semibold text-stone-900">Create your account</p>
            <div className="mt-3 space-y-2">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setMethod(m.id);
                    setStep(1);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-stone-300 bg-white py-2.5 text-sm font-medium text-stone-800 transition hover:bg-stone-50"
                >
                  <span>{m.icon}</span> {m.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-stone-400">
              Demo — OAuth is mocked, every option continues to profile setup
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-stone-900">
              About you &amp; your home
              <span className="ml-2 text-xs font-normal text-stone-400">step 2 of 2</span>
            </p>
            <div className="mt-3 space-y-3">
              <label className="block text-sm font-medium text-stone-700">
                Full name
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Atharva Kirkole"
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700"
                />
              </label>
              <label className="block text-sm font-medium text-stone-700">
                Email
                <input
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700"
                />
              </label>
              <label className="block text-sm font-medium text-stone-700">
                Home address
                <input
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="4821 E Maple Hollow Dr, Phoenix, AZ"
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700"
                />
                <span className="mt-1 block text-xs font-normal text-stone-400">
                  You can add more homes later
                </span>
              </label>
              <label className="block text-sm font-medium text-stone-700">
                Property type
                <select
                  value={form.propertyType}
                  onChange={(e) => set("propertyType", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700"
                >
                  {PROPERTY_TYPES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-sm font-medium text-stone-700">
                  You are a
                  <div className="mt-1 flex rounded-xl bg-stone-100 p-1 text-xs">
                    {["Homeowner", "Renter"].map((o) => (
                      <button
                        key={o}
                        onClick={() => set("ownerType", o)}
                        className={`flex-1 rounded-lg py-2 font-medium transition ${
                          form.ownerType === o ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block text-sm font-medium text-stone-700">
                  Household size
                  <select
                    value={form.familySize}
                    onChange={(e) => set("familySize", e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700"
                  >
                    {["1", "2", "3", "4", "5", "6+"].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <button
              onClick={finish}
              disabled={!form.name || !form.address}
              className="mt-5 w-full rounded-full bg-emerald-800 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-emerald-700 disabled:opacity-40"
            >
              Create account &amp; open my home →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
