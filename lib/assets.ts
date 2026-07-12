/* Custom (user-registered) assets, twin arrangement overrides,
   and the simulated AI recognition pipeline. */

export interface CustomAsset {
  id: string;
  name: string;
  icon: string;
  category: string;
  room: string;
  x: number;
  y: number;
  rot: number;
  scale: number;
  brand: string;
  model: string;
  serial: string;
  purchased: string;
  value: string;
  warrantyUntil: string;
  lifespan: string;
  maintenance: string;
  source: string;
  matched: boolean;
}

const ASSET_KEY = "mh_custom_assets";
const POS_KEY = "mh_twin_positions";

export function getCustomAssets(): CustomAsset[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(ASSET_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveCustomAssets(list: CustomAsset[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ASSET_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export interface Arrangement {
  x: number;
  y: number;
  rot: number;
  scale: number;
}

export function getArrangement(): Record<string, Arrangement> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(POS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveArrangement(a: Record<string, Arrangement>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POS_KEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
}

/* ---------- Default furniture on the twin ---------- */

export interface FurnitureItem {
  id: string;
  name: string;
  icon: string;
  room: string;
  x: number;
  y: number;
  brand: string;
  value: string;
  purchased: string;
}

export const DEFAULT_FURNITURE: FurnitureItem[] = [
  { id: "f-couch", name: "Sofa", icon: "🛋️", room: "Living Room", x: 330, y: 200, brand: "West Elm Harmony", value: "$1,899", purchased: "2021" },
  { id: "f-tv", name: 'TV — 65" OLED', icon: "📺", room: "Living Room", x: 460, y: 130, brand: "LG C3", value: "$1,599", purchased: "2023" },
  { id: "f-dining", name: "Dining Table", icon: "🪑", room: "Kitchen", x: 340, y: 430, brand: "Article Seno", value: "$1,299", purchased: "2020" },
  { id: "f-bed", name: "Bed + Mattress", icon: "🛏️", room: "Primary Bedroom", x: 650, y: 160, brand: "Purple Hybrid 3", value: "$2,400", purchased: "2022" },
  { id: "f-desk", name: "Standing Desk", icon: "🖥️", room: "Office / Entry", x: 130, y: 150, brand: "Uplift V2", value: "$799", purchased: "2021" },
  { id: "f-grill", name: "Grill", icon: "🍖", room: "Backyard", x: 770, y: 90, brand: "Weber Genesis E-325s", value: "$1,049", purchased: "2023" },
];

/* ---------- Simulated recognition catalog ---------- */

export interface RecognitionResult {
  name: string;
  icon: string;
  category: string;
  brand: string;
  model: string;
  serial: string;
  purchased: string;
  value: string;
  warrantyUntil: string;
  lifespan: string;
  maintenance: string;
  dims: string;
  confidence: number;
}

const CATALOG: { keys: string[]; r: Omit<RecognitionResult, "confidence" | "serial"> }[] = [
  {
    keys: ["couch", "sofa", "sectional"],
    r: { name: "Sofa", icon: "🛋️", category: "Furniture", brand: "West Elm", model: "Harmony 82-in Sofa", purchased: "Nov 2021", value: "$1,899", warrantyUntil: "Nov 2028 (frame)", lifespan: "10–14 yrs", maintenance: "Rotate cushions quarterly · professional clean yearly", dims: '82" W × 38" D × 33" H · Performance velvet, dusty blush' },
  },
  {
    keys: ["tv", "oled", "television"],
    r: { name: 'TV — 65" OLED', icon: "📺", category: "Electronics", brand: "LG", model: "OLED65C3PUA", purchased: "Mar 2023", value: "$1,599", warrantyUntil: "Mar 2027 (extended)", lifespan: "8–10 yrs", maintenance: "Pixel-refresh runs automatically · dust vents twice a year", dims: '65" · 4K 120Hz · wall-mounted, living room' },
  },
  {
    keys: ["fridge", "refrigerator"],
    r: { name: "Refrigerator", icon: "🧊", category: "Appliances", brand: "LG", model: "LRFVS3006S InstaView", purchased: "Dec 2021", value: "$2,499", warrantyUntil: "Dec 2026 (extended)", lifespan: "14 yrs", maintenance: "Water filter every 6 mo · coil clean yearly", dims: '36" W · 29.7 cu ft · stainless' },
  },
  {
    keys: ["monitor", "display"],
    r: { name: 'Monitor — 27"', icon: "🖥️", category: "Electronics", brand: "Dell", model: "U2723QE UltraSharp", purchased: "Jun 2024", value: "$579", warrantyUntil: "Jun 2027 (3-yr advanced exchange)", lifespan: "8 yrs", maintenance: "—", dims: '27" 4K IPS · USB-C hub' },
  },
  {
    keys: ["laptop", "macbook"],
    r: { name: "Laptop", icon: "💻", category: "Electronics", brand: "Apple", model: 'MacBook Pro 14" M3', purchased: "Jan 2025", value: "$1,999", warrantyUntil: "Jan 2028 (AppleCare+)", lifespan: "6–8 yrs", maintenance: "Battery health check yearly", dims: "14.2-in · Space Black" },
  },
  {
    keys: ["router", "eero", "wifi"],
    r: { name: "Wi-Fi Router", icon: "📶", category: "Electronics", brand: "eero", model: "Pro 6E (3-pack mesh)", purchased: "Aug 2023", value: "$549", warrantyUntil: "Aug 2025", lifespan: "5–6 yrs", maintenance: "Firmware auto-updates · reboot quarterly", dims: "3 nodes: living, office, primary bed" },
  },
  {
    keys: ["grill", "weber", "bbq"],
    r: { name: "Gas Grill", icon: "🍖", category: "Outdoor", brand: "Weber", model: "Genesis E-325s", purchased: "May 2023", value: "$1,049", warrantyUntil: "May 2033 (10-yr burners)", lifespan: "12+ yrs", maintenance: "Deep clean twice a season · check hoses yearly", dims: "3 burners · 787 sq in · natural gas conversion" },
  },
  {
    keys: ["mower", "lawn"],
    r: { name: "Lawn Mower", icon: "🌱", category: "Outdoor", brand: "EGO", model: 'Power+ 21" Select Cut', purchased: "Apr 2024", value: "$549", warrantyUntil: "Apr 2029 (5-yr tool)", lifespan: "8–10 yrs", maintenance: "Blade sharpen yearly · battery stored indoors", dims: "56V · 7.5Ah battery" },
  },
  {
    keys: ["table", "dining"],
    r: { name: "Dining Table", icon: "🪑", category: "Furniture", brand: "Article", model: "Seno Oak 71-in", purchased: "Sep 2020", value: "$1,299", warrantyUntil: "Sep 2021 (expired)", lifespan: "20+ yrs", maintenance: "Re-oil oak yearly", dims: '71" L · seats 6 · white oak' },
  },
  {
    keys: ["bed", "mattress"],
    r: { name: "Mattress", icon: "🛏️", category: "Furniture", brand: "Purple", model: "Hybrid 3 · King", purchased: "Feb 2022", value: "$2,400", warrantyUntil: "Feb 2032 (10-yr)", lifespan: "10 yrs", maintenance: "Rotate twice a year", dims: "King · 12-in profile" },
  },
  {
    keys: ["washer", "washing"],
    r: { name: "Washer", icon: "🧺", category: "Appliances", brand: "Samsung", model: "WF45T6000AW", purchased: "Jul 2020", value: "$898", warrantyUntil: "Jul 2021 (expired)", lifespan: "11 yrs", maintenance: "Drain filter monthly · leave door ajar", dims: "4.5 cu ft front load" },
  },
  {
    keys: ["speaker", "sonos", "soundbar", "sound"],
    r: { name: "Soundbar", icon: "🔊", category: "Electronics", brand: "Sonos", model: "Arc", purchased: "Dec 2022", value: "$899", warrantyUntil: "Dec 2023 (expired)", lifespan: "10 yrs", maintenance: "—", dims: "Wall-mounted under TV" },
  },
];

const FALLBACK: Omit<RecognitionResult, "confidence" | "serial"> = {
  name: "Household item",
  icon: "📦",
  category: "Other",
  brand: "Unbranded",
  model: "Not detected — edit below",
  purchased: "—",
  value: "—",
  warrantyUntil: "—",
  lifespan: "—",
  maintenance: "—",
  dims: "—",
};

function serialFrom(seed: string): string {
  let h = 7;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 100000;
  return `SN-${String(h).padStart(5, "0")}-${seed.length}${seed.charCodeAt(0) % 10}`;
}

export type DocKind = "product" | "receipt" | "warranty" | "serial" | "manual";

export const DOC_KINDS: { id: DocKind; label: string; icon: string }[] = [
  { id: "product", label: "Photo of the item", icon: "📷" },
  { id: "receipt", label: "Receipt / invoice", icon: "🧾" },
  { id: "warranty", label: "Warranty papers", icon: "📜" },
  { id: "serial", label: "Serial / barcode sticker", icon: "🏷️" },
  { id: "manual", label: "Manual / purchase email", icon: "📖" },
];

export function guessKind(filename: string): DocKind {
  const f = filename.toLowerCase();
  if (/(receipt|invoice|order)/.test(f)) return "receipt";
  if (/(warranty|guarantee)/.test(f)) return "warranty";
  if (/(serial|barcode|sticker|label)/.test(f)) return "serial";
  if (/(manual|guide)/.test(f)) return "manual";
  return "product";
}

export function recognize(filenames: string[], kinds: DocKind[]): RecognitionResult {
  const blob = filenames.join(" ").toLowerCase();
  let hit = CATALOG.find((c) => c.keys.some((k) => blob.includes(k)));
  if (!hit && filenames.length > 0) {
    // deterministic pick so the demo always "recognizes" something plausible
    const h = blob.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    hit = CATALOG[h % CATALOG.length];
  }
  const base = hit ? hit.r : FALLBACK;
  const hasReceipt = kinds.includes("receipt") || kinds.includes("warranty") || kinds.includes("manual");
  const hasProduct = kinds.includes("product") || kinds.includes("serial");
  const confidence = 62 + (hasReceipt ? 18 : 0) + (hasProduct ? 14 : 0) + (kinds.includes("serial") ? 5 : 0);
  return {
    ...base,
    serial: serialFrom(blob || base.model),
    confidence: Math.min(confidence, 99),
  };
}
