export type Category =
  | "Plumbing"
  | "Electrical"
  | "HVAC"
  | "Appliance Repair"
  | "Cleaning"
  | "Bathroom & Toilet Cleaning"
  | "Gardening"
  | "Landscaping"
  | "Junk Removal"
  | "Trash Collection"
  | "Scrap Collection"
  | "Pest Control"
  | "Pool Care"
  | "Pressure Washing"
  | "Window Cleaning"
  | "Gutter Cleaning"
  | "Snow Removal"
  | "Locksmith"
  | "Moving"
  | "Handyman";

export const CATEGORIES: Category[] = [
  "Plumbing",
  "Electrical",
  "HVAC",
  "Appliance Repair",
  "Cleaning",
  "Bathroom & Toilet Cleaning",
  "Gardening",
  "Landscaping",
  "Junk Removal",
  "Trash Collection",
  "Scrap Collection",
  "Pest Control",
  "Pool Care",
  "Pressure Washing",
  "Window Cleaning",
  "Gutter Cleaning",
  "Snow Removal",
  "Locksmith",
  "Moving",
  "Handyman",
];

export interface Provider {
  id: string;
  name: string;
  business: string;
  category: Category;
  rating: number;
  jobs: number;
  startingPrice: number;
  distanceMi: number;
  responseMin: number;
  verified: { license: boolean; insurance: boolean; background: boolean };
  bio: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: "p1",
    name: "Marcus Rivera",
    business: "BlueLine Plumbing Co.",
    category: "Plumbing",
    rating: 4.9,
    jobs: 1240,
    startingPrice: 95,
    distanceMi: 2.1,
    responseMin: 8,
    verified: { license: true, insurance: true, background: true },
    bio: "Licensed master plumber. Slab leaks, water heaters, repipes. Parts on the truck for most same-day fixes.",
  },
  {
    id: "p2",
    name: "Dana Whitfield",
    business: "Whitfield Plumbing & Drain",
    category: "Plumbing",
    rating: 4.7,
    jobs: 682,
    startingPrice: 85,
    distanceMi: 4.6,
    responseMin: 15,
    verified: { license: true, insurance: true, background: true },
    bio: "Drain and sewer specialist. Camera inspections included with every clearing.",
  },
  {
    id: "p3",
    name: "Tom Okafor",
    business: "Volt Electric",
    category: "Electrical",
    rating: 4.9,
    jobs: 910,
    startingPrice: 110,
    distanceMi: 3.2,
    responseMin: 12,
    verified: { license: true, insurance: true, background: true },
    bio: "Master electrician. Panels, EV chargers, troubleshooting. Photo-documented work on every job.",
  },
  {
    id: "p4",
    name: "Lena Vasquez",
    business: "Sunstate Electrical",
    category: "Electrical",
    rating: 4.6,
    jobs: 431,
    startingPrice: 95,
    distanceMi: 6.8,
    responseMin: 22,
    verified: { license: true, insurance: true, background: false },
    bio: "Residential wiring, ceiling fans, lighting. Weekend availability.",
  },
  {
    id: "p5",
    name: "Ray Delgado",
    business: "Desert Air Mechanical",
    category: "HVAC",
    rating: 4.8,
    jobs: 1105,
    startingPrice: 89,
    distanceMi: 1.8,
    responseMin: 10,
    verified: { license: true, insurance: true, background: true },
    bio: "NATE-certified. AC repair, capacitors, compressors, full system swaps. Same-day in summer.",
  },
  {
    id: "p6",
    name: "Priya Nair",
    business: "CoolPath HVAC",
    category: "HVAC",
    rating: 4.7,
    jobs: 540,
    startingPrice: 79,
    distanceMi: 5.4,
    responseMin: 18,
    verified: { license: true, insurance: true, background: true },
    bio: "Tune-ups, refrigerant, smart thermostat installs. Maintenance plans available.",
  },
  {
    id: "p7",
    name: "Sam Kowalski",
    business: "FixRight Appliance",
    category: "Appliance Repair",
    rating: 4.8,
    jobs: 760,
    startingPrice: 75,
    distanceMi: 3.9,
    responseMin: 14,
    verified: { license: false, insurance: true, background: true },
    bio: "Factory-trained on Bosch, GE, Whirlpool, LG. Warranty-claim paperwork handled for you.",
  },
  {
    id: "p8",
    name: "Grace Lin",
    business: "HomeShine Cleaning",
    category: "Cleaning",
    rating: 4.9,
    jobs: 2050,
    startingPrice: 120,
    distanceMi: 2.7,
    responseMin: 6,
    verified: { license: false, insurance: true, background: true },
    bio: "Deep cleans, move-out cleans, recurring service. Fixed pricing by home size — no surprises.",
  },
  {
    id: "p9",
    name: "Omar Haddad",
    business: "Cactus Movers",
    category: "Moving",
    rating: 4.6,
    jobs: 388,
    startingPrice: 180,
    distanceMi: 7.1,
    responseMin: 25,
    verified: { license: true, insurance: true, background: true },
    bio: "Two-man crew with truck. Apartments, single rooms, in-house furniture moves.",
  },
  {
    id: "p10",
    name: "Jess Munoz",
    business: "Munoz Handyworks",
    category: "Handyman",
    rating: 4.8,
    jobs: 890,
    startingPrice: 70,
    distanceMi: 2.4,
    responseMin: 9,
    verified: { license: false, insurance: true, background: true },
    bio: "Drywall, doors, TV mounts, small fixes. Hourly or fixed-price — your call.",
  },
  {
    id: "p11",
    name: "Bill Tanner",
    business: "Tanner Yard & Tree",
    category: "Landscaping",
    rating: 4.7,
    jobs: 615,
    startingPrice: 65,
    distanceMi: 4.2,
    responseMin: 20,
    verified: { license: false, insurance: true, background: true },
    bio: "Desert landscaping, irrigation repair, palm trimming. Monthly maintenance routes.",
  },
  {
    id: "p12",
    name: "Aiko Tanaka",
    business: "Precision Plumbing AZ",
    category: "Plumbing",
    rating: 4.8,
    jobs: 505,
    startingPrice: 105,
    distanceMi: 5.9,
    responseMin: 17,
    verified: { license: true, insurance: true, background: true },
    bio: "Water heaters and softeners. Rheem & AO Smith certified installer.",
  },
];

export const CATEGORY_BASE: Record<Category, { min: number; max: number }> = {
  Plumbing: { min: 120, max: 340 },
  Electrical: { min: 140, max: 380 },
  HVAC: { min: 110, max: 420 },
  "Appliance Repair": { min: 90, max: 260 },
  Cleaning: { min: 90, max: 220 },
  "Bathroom & Toilet Cleaning": { min: 70, max: 160 },
  Gardening: { min: 60, max: 180 },
  Landscaping: { min: 70, max: 260 },
  "Junk Removal": { min: 90, max: 320 },
  "Trash Collection": { min: 25, max: 90 },
  "Scrap Collection": { min: 30, max: 120 },
  "Pest Control": { min: 80, max: 220 },
  "Pool Care": { min: 80, max: 200 },
  "Pressure Washing": { min: 120, max: 320 },
  "Window Cleaning": { min: 90, max: 260 },
  "Gutter Cleaning": { min: 100, max: 240 },
  "Snow Removal": { min: 60, max: 200 },
  Locksmith: { min: 70, max: 240 },
  Moving: { min: 180, max: 520 },
  Handyman: { min: 80, max: 240 },
};

/* ---------- Home Passport ---------- */

export type StatusLevel = "good" | "warning" | "serious" | "critical";

export const STATUS_META: Record<
  StatusLevel,
  { label: string; color: string }
> = {
  good: { label: "Good", color: "var(--status-good)" },
  warning: { label: "Watch", color: "var(--status-warning)" },
  serious: { label: "Plan ahead", color: "var(--status-serious)" },
  critical: { label: "Act now", color: "var(--status-critical)" },
};

export const HOME = {
  address: "4821 E Maple Hollow Dr",
  city: "Phoenix, AZ 85018",
  owner: "Atharva K.",
  built: 2004,
  sqft: 2340,
  beds: 4,
  baths: 2.5,
  passportId: "STD-AZ-102-4821",
};

export interface HomeSystem {
  id: string;
  name: string;
  detail: string;
  installed: number;
  lifespanYears: number;
  health: number;
  status: StatusLevel;
  warranty: { active: boolean; until?: string; provider?: string };
  lastService?: string;
  note?: string;
  requestPrefill?: string;
}

export const SYSTEMS: HomeSystem[] = [
  {
    id: "roof",
    name: "Roof",
    detail: "Asphalt shingle · GAF Timberline HDZ",
    installed: 2016,
    lifespanYears: 25,
    health: 88,
    status: "good",
    warranty: { active: true, until: "2041", provider: "GAF Lifetime Ltd." },
    lastService: "Nov 2025 · post-monsoon inspection",
  },
  {
    id: "hvac",
    name: "HVAC",
    detail: "Carrier 24ACC6 3-ton AC + gas furnace",
    installed: 2018,
    lifespanYears: 15,
    health: 71,
    status: "warning",
    warranty: { active: false },
    lastService: "Jun 2026 · tune-up, capacitor replaced",
    note: "Runtime data shows compressor cycling 12% above normal for June. Recommend a check before peak season load.",
    requestPrefill:
      "My AC compressor seems to be cycling on and off more than usual and cooling feels weaker in the afternoons.",
  },
  {
    id: "wh",
    name: "Water Heater",
    detail: "Rheem Performance 50 gal · gas",
    installed: 2015,
    lifespanYears: 12,
    health: 46,
    status: "serious",
    warranty: { active: false },
    lastService: "Feb 2026 · anode rod replaced",
    note: "At 92% of typical failure window for Phoenix water hardness. Replacing on your schedule is ~40% cheaper than an emergency swap.",
    requestPrefill:
      "My water heater is a 2015 Rheem 50 gallon gas unit nearing end of life. I want quotes to replace it before it fails.",
  },
  {
    id: "dw",
    name: "Dishwasher",
    detail: "Bosch 300 Series SHE53C85N",
    installed: 2022,
    lifespanYears: 12,
    health: 96,
    status: "good",
    warranty: { active: true, until: "Aug 2027", provider: "Bosch" },
    lastService: "Aug 2025 · door latch (warranty, $0)",
  },
  {
    id: "panel",
    name: "Electrical Panel",
    detail: "Square D QO 200A",
    installed: 2004,
    lifespanYears: 40,
    health: 90,
    status: "good",
    warranty: { active: false },
    lastService: "Mar 2025 · inspection + GFCI updates",
  },
  {
    id: "irrigation",
    name: "Irrigation",
    detail: "Rain Bird ESP-TM2 · 6 zones",
    installed: 2019,
    lifespanYears: 15,
    health: 82,
    status: "good",
    warranty: { active: false },
    lastService: "Apr 2026 · valve 3 rebuilt",
  },
];

export const ENERGY = {
  months: [
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
  ],
  values: [2310, 2440, 1980, 1420, 980, 1040, 1010, 940, 1080, 1350, 1780, 2150],
};

export interface HistoryEntry {
  date: string;
  title: string;
  provider: string;
  cost: string;
  verified: boolean;
}

export const SERVICE_HISTORY: HistoryEntry[] = [
  {
    date: "Jun 2026",
    title: "AC tune-up & capacitor replacement",
    provider: "Desert Air Mechanical",
    cost: "$189",
    verified: true,
  },
  {
    date: "Apr 2026",
    title: "Irrigation valve 3 rebuild",
    provider: "Tanner Yard & Tree",
    cost: "$135",
    verified: true,
  },
  {
    date: "Feb 2026",
    title: "Water heater anode rod replacement",
    provider: "BlueLine Plumbing Co.",
    cost: "$145",
    verified: true,
  },
  {
    date: "Nov 2025",
    title: "Post-monsoon roof inspection",
    provider: "Summit Roofing (GAF warranty)",
    cost: "$0",
    verified: true,
  },
  {
    date: "Aug 2025",
    title: "Dishwasher door latch — warranty claim",
    provider: "Bosch Factory Service",
    cost: "$0",
    verified: true,
  },
  {
    date: "Mar 2025",
    title: "Panel inspection & GFCI updates",
    provider: "Volt Electric",
    cost: "$240",
    verified: true,
  },
];

export const DOCUMENTS = [
  { name: "GAF roof warranty certificate", kind: "Warranty", added: "2016" },
  { name: "Carrier HVAC manual & install record", kind: "Manual", added: "2018" },
  { name: "Homeowners policy — Allstate HO-3", kind: "Insurance", added: "2026" },
  { name: "Bosch dishwasher receipt + warranty", kind: "Warranty", added: "2022" },
  { name: "Home inspection report", kind: "Inspection", added: "2024" },
  { name: "Invoices — 14 verified jobs", kind: "Invoices", added: "auto" },
];

export const DEVICES = [
  { name: "Leak sensor · water heater pan", reading: "Dry", ok: true },
  { name: "Leak sensor · kitchen sink", reading: "Dry", ok: true },
  { name: "Water main monitor", reading: "Normal flow", ok: true },
  { name: "Smart thermostat", reading: "Cooling · 76°F", ok: true },
];
