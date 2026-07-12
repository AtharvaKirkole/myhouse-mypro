import {
  CATEGORY_BASE,
  Category,
  PROVIDERS,
  Provider,
} from "./data";

export type Urgency = "emergency" | "week" | "flexible";

export interface StructuredJob {
  title: string;
  category: Category;
  urgency: Urgency;
  location: string;
  description: string;
  scope: string[];
  budget: { min: number; max: number };
}

const CATEGORY_RULES: { category: Category; words: string[] }[] = [
  {
    category: "Plumbing",
    words: [
      "leak",
      "pipe",
      "faucet",
      "drain",
      "toilet",
      "water heater",
      "clog",
      "sewer",
      "drip",
      "sink",
      "garbage disposal",
    ],
  },
  {
    category: "Electrical",
    words: [
      "outlet",
      "breaker",
      "spark",
      "wiring",
      "light switch",
      "ceiling fan",
      "no power",
      "panel",
      "electrical",
    ],
  },
  {
    category: "HVAC",
    words: [
      "ac ",
      " a/c",
      "air condition",
      "furnace",
      "no heat",
      "not cooling",
      "thermostat",
      "hvac",
      "compressor",
      "vent",
    ],
  },
  {
    category: "Appliance Repair",
    words: [
      "fridge",
      "refrigerator",
      "dishwasher",
      "washer",
      "dryer",
      "oven",
      "stove",
      "microwave",
      "appliance",
    ],
  },
  {
    category: "Cleaning",
    words: ["clean", "maid", "move-out", "move out clean", "deep clean"],
  },
  {
    category: "Moving",
    words: ["move ", "moving", "movers", "couch", "furniture to"],
  },
  {
    category: "Landscaping",
    words: ["lawn", "yard", "tree", "sprinkler", "irrigation", "weeds", "palm"],
  },
];

const EMERGENCY_WORDS = [
  "flood",
  "burst",
  "sparking",
  "smoke",
  "no power",
  "no heat",
  "not cooling",
  "gushing",
  "emergency",
  "right now",
  "asap",
];

const WEEK_WORDS = ["this week", "soon", "few days", "before"];

const ROOM_WORDS = [
  "kitchen",
  "bathroom",
  "garage",
  "basement",
  "backyard",
  "front yard",
  "living room",
  "bedroom",
  "laundry",
  "attic",
  "upstairs",
  "downstairs",
];

const TITLES: Record<Category, string> = {
  Plumbing: "Plumbing repair",
  Electrical: "Electrical repair",
  HVAC: "Heating / cooling service",
  "Appliance Repair": "Appliance repair",
  Cleaning: "Home cleaning",
  Moving: "Moving help",
  Handyman: "General repair",
  Landscaping: "Yard & landscape work",
};

const SCOPE: Record<Category, string[]> = {
  Plumbing: [
    "Diagnose source of issue",
    "Isolate water supply if active leak",
    "Repair or replace failed component",
    "Pressure-test and photo-verify the fix",
  ],
  Electrical: [
    "Diagnose circuit / fixture",
    "Verify panel and breaker condition",
    "Repair or replace failed component",
    "Test to code and photo-verify",
  ],
  HVAC: [
    "System diagnostic (airflow, refrigerant, electrical)",
    "Quote repair vs. replace with parts pricing",
    "Complete repair",
    "Verify temperature differential",
  ],
  "Appliance Repair": [
    "Diagnose unit (error codes, mechanical)",
    "Check active manufacturer warranty first",
    "Repair with OEM parts",
    "Run full-cycle test",
  ],
  Cleaning: [
    "Walkthrough and fixed quote",
    "Full clean per room checklist",
    "Photo checklist on completion",
  ],
  Moving: [
    "Confirm item list and access (stairs, elevator)",
    "Supply crew + truck + padding",
    "Load, transport, place",
  ],
  Handyman: [
    "Review job on arrival",
    "Fixed price before starting",
    "Complete work and photo-verify",
  ],
  Landscaping: [
    "Walk property and confirm scope",
    "Complete work with haul-away",
    "Photo-verify completion",
  ],
};

export function parseJob(text: string): StructuredJob {
  const t = " " + text.toLowerCase() + " ";

  let category: Category = "Handyman";
  let bestHits = 0;
  for (const rule of CATEGORY_RULES) {
    const hits = rule.words.filter((w) => t.includes(w)).length;
    if (hits > bestHits) {
      bestHits = hits;
      category = rule.category;
    }
  }

  let urgency: Urgency = "flexible";
  if (EMERGENCY_WORDS.some((w) => t.includes(w))) urgency = "emergency";
  else if (WEEK_WORDS.some((w) => t.includes(w))) urgency = "week";

  const room = ROOM_WORDS.find((w) => t.includes(w));
  const location = room
    ? room.charAt(0).toUpperCase() + room.slice(1)
    : "Whole home";

  let title = TITLES[category];
  if (category === "Plumbing" && (t.includes("leak") || t.includes("drip")))
    title = "Active leak repair";
  if (category === "Plumbing" && t.includes("water heater"))
    title = "Water heater service / replacement";
  if (category === "HVAC" && (t.includes("not cooling") || t.includes("compressor")))
    title = "AC not cooling — diagnostic & repair";
  if (category === "Electrical" && t.includes("outlet"))
    title = "Outlet / circuit repair";

  const base = CATEGORY_BASE[category];
  const budget =
    urgency === "emergency"
      ? { min: Math.round(base.min * 1.2), max: Math.round(base.max * 1.25) }
      : base;

  return {
    title,
    category,
    urgency,
    location,
    description: text.trim(),
    scope: SCOPE[category],
    budget,
  };
}

/* ---------- Bid simulation ---------- */

export interface Bid {
  id: string;
  provider: Provider;
  price: number;
  etaLabel: string;
  note: string;
  delayMs: number;
}

const NOTES: Record<Category, string[]> = {
  Plumbing: [
    "I carry parts for most residential fixes on the truck — likely a one-visit job.",
    "Can shut off and stabilize immediately, then quote the permanent fix on site.",
    "Price includes camera inspection and photo report.",
  ],
  Electrical: [
    "Price includes full circuit trace and code check.",
    "I photo-document everything behind the wall before closing up.",
    "Can be there with panel parts if the breaker is the issue.",
  ],
  HVAC: [
    "Includes refrigerant pressure check and capacitor test.",
    "If it's the compressor I'll quote repair vs. replace on the spot.",
    "Same-day slot available — summer priority routing.",
  ],
  "Appliance Repair": [
    "I'll check your manufacturer warranty first — this may be a $0 claim.",
    "Factory-trained on this brand. OEM parts only.",
    "Includes full-cycle test after repair.",
  ],
  Cleaning: [
    "Fixed price for your home size, checklist shared before we start.",
    "Two-person crew, eco products, photo checklist at the end.",
  ],
  Moving: [
    "Crew of two with truck, padding, and straps included.",
    "We handle stairs — no surcharge.",
  ],
  Handyman: [
    "Fixed price confirmed before any work starts.",
    "I can bundle other small fixes on the same visit.",
  ],
  Landscaping: [
    "Includes haul-away of all debris.",
    "Can put you on a monthly route after this job.",
  ],
};

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeBids(job: StructuredJob): Bid[] {
  const pool = PROVIDERS.filter((p) => p.category === job.category);
  const fallback = PROVIDERS.filter(
    (p) => p.category === "Handyman" && job.category !== "Handyman"
  );
  const bidders = [...pool, ...fallback].slice(0, 6);

  const rand = mulberry32(
    job.description.length * 7 + job.category.length * 13
  );
  const mid = (job.budget.min + job.budget.max) / 2;

  return bidders.map((p, i) => {
    const spread = 0.78 + rand() * 0.42; // 0.78x – 1.2x of midpoint
    const ratingDiscount = (5 - p.rating) * 0.04;
    const price = Math.round((mid * (spread - ratingDiscount)) / 5) * 5;
    const notes = NOTES[p.category] ?? NOTES.Handyman;

    let etaLabel: string;
    if (job.urgency === "emergency") {
      const mins = 25 + Math.round(rand() * 50);
      etaLabel = `Can arrive in ~${mins} min`;
    } else if (job.urgency === "week") {
      etaLabel = rand() > 0.5 ? "Tomorrow, 8–10 AM" : "Thursday, 1–3 PM";
    } else {
      etaLabel = rand() > 0.5 ? "This Saturday AM" : "Next Tuesday, flexible";
    }

    return {
      id: `bid-${p.id}`,
      provider: p,
      price: Math.max(price, 45),
      etaLabel,
      note: notes[i % notes.length],
      delayMs: 600 + i * 1300 + Math.round(rand() * 700),
    };
  });
}

/* ---------- Local storage ---------- */

export interface BookingRecord {
  ref: string;
  title: string;
  provider: string;
  when: string;
  price: string;
  createdAt: number;
}

const KEY = "stead_bookings";

export function getBookings(): BookingRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addBooking(b: BookingRecord) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([b, ...getBookings()]));
  } catch {
    /* ignore */
  }
}

export function makeRef(): string {
  return (
    "STD-" +
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    "-" +
    Math.floor(Math.random() * 90 + 10)
  );
}
