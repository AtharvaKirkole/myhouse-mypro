export interface ConsumerProfile {
  name: string;
  email: string;
  method: string;
  address: string;
  propertyType: string;
  ownerType: string;
  familySize: string;
}

export interface ProProfile {
  name: string;
  email: string;
  business: string;
  professions: string[];
  years: string;
  certifications: string;
  license: string;
  insurance: string;
  ein: string;
  radiusMi: number;
  baseCity: string;
  emergency: boolean;
  teamSize: string;
  hours: string;
  liveLocation: boolean;
}

export type Session =
  | { type: "consumer"; consumer: ConsumerProfile }
  | { type: "pro"; pro: ProProfile };

const KEY = "mh_session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("mh-session"));
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("mh-session"));
  } catch {
    /* ignore */
  }
}

export function updateProProfile(patch: Partial<ProProfile>) {
  const s = getSession();
  if (s?.type !== "pro") return;
  saveSession({ type: "pro", pro: { ...s.pro, ...patch } });
}

export const PROFESSIONS = [
  "Plumber",
  "Electrician",
  "HVAC",
  "Carpenter",
  "Appliance Repair",
  "Painter",
  "Roofer",
  "Flooring",
  "Handyman",
  "Pool Technician",
  "Locksmith",
  "Landscaper",
  "Pest Control",
  "Solar Installer",
  "Smart Home",
  "Garage Door",
];
