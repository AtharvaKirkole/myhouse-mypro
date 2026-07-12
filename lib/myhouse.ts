import { StatusLevel } from "./data";

/* ---------- Digital Twin ---------- */

export interface Room {
  id: string;
  name: string;
  rect: { x: number; y: number; w: number; h: number };
  dims: string;
  flooring: string;
  paint: string;
}

export const ROOMS: Room[] = [
  { id: "garage", name: "Garage", rect: { x: 40, y: 300, w: 200, h: 220 }, dims: "20×22 ft", flooring: "Epoxy concrete", paint: "Sherwin-Williams Agreeable Gray" },
  { id: "kitchen", name: "Kitchen", rect: { x: 240, y: 300, w: 190, h: 220 }, dims: "14×19 ft", flooring: "Porcelain tile", paint: "Benjamin Moore White Dove" },
  { id: "laundry", name: "Laundry", rect: { x: 430, y: 420, w: 100, h: 100 }, dims: "8×10 ft", flooring: "Porcelain tile", paint: "White Dove" },
  { id: "living", name: "Living Room", rect: { x: 240, y: 60, w: 290, h: 240 }, dims: "22×24 ft", flooring: "Engineered oak", paint: "SW Alabaster" },
  { id: "office", name: "Office / Entry", rect: { x: 40, y: 60, w: 200, h: 240 }, dims: "16×20 ft", flooring: "Engineered oak", paint: "SW Sea Salt" },
  { id: "master", name: "Primary Bedroom", rect: { x: 530, y: 60, w: 250, h: 240 }, dims: "16×20 ft", flooring: "Carpet (2023)", paint: "BM Gray Owl" },
  { id: "bath", name: "Primary Bath", rect: { x: 530, y: 300, w: 120, h: 120 }, dims: "10×10 ft", flooring: "Marble hex tile", paint: "White Dove" },
  { id: "bed2", name: "Bedroom 2", rect: { x: 650, y: 300, w: 130, h: 220 }, dims: "12×14 ft", flooring: "Carpet (2023)", paint: "BM Gray Owl" },
  { id: "hall", name: "Hall / Bath 2", rect: { x: 430, y: 300, w: 100, h: 120 }, dims: "8×10 ft", flooring: "Porcelain tile", paint: "White Dove" },
];

export interface TwinAsset {
  id: string;
  name: string;
  icon: string;
  x: number;
  y: number;
  room: string;
  status: StatusLevel;
  shutoff?: boolean;
  detail: {
    manufacturer: string;
    model: string;
    serial: string;
    installed: string;
    installer: string;
    warranty: string;
    lifespan: string;
    lastService: string;
    replaceCost: string;
    energy?: string;
    parts: string[];
  };
  requestPrefill?: string;
}

export const TWIN_ASSETS: TwinAsset[] = [
  {
    id: "wh",
    name: "Water Heater",
    icon: "🔥",
    x: 105,
    y: 362,
    room: "Garage",
    status: "serious",
    detail: {
      manufacturer: "Rheem",
      model: "Performance 50 gal · gas (XG50T06EC36U1)",
      serial: "RH2015-88214-AZ",
      installed: "Jun 2015 · previous owner (record imported)",
      installer: "Unknown — pre-purchase",
      warranty: "Expired 2021 (6-yr tank)",
      lifespan: "12 yrs typical · at 92% of failure window",
      lastService: "Feb 2026 · anode rod replaced",
      replaceCost: "$1,450–1,900 installed",
      energy: "~$28/mo gas",
      parts: ["Anode rod", "T&P valve", "Thermocouple", "Drain pan + leak sensor"],
    },
    requestPrefill:
      "Replace my 2015 Rheem Performance 50 gallon gas water heater before it fails. Located in the garage, drain pan and leak sensor already in place.",
  },
  {
    id: "panel",
    name: "Electrical Panel",
    icon: "⚡",
    x: 80,
    y: 480,
    room: "Garage",
    status: "good",
    detail: {
      manufacturer: "Square D",
      model: "QO 200A · 40-space",
      serial: "SQD-2004-114-902",
      installed: "2004 · original build",
      installer: "Builder (Pulte)",
      warranty: "None active",
      lifespan: "40 yrs typical · healthy",
      lastService: "Mar 2025 · inspection + GFCI updates (Volt Electric)",
      replaceCost: "$2,400–3,200",
      parts: ["QO breakers 15–50A", "GFCI/AFCI breakers"],
    },
  },
  {
    id: "watermain",
    name: "Water Main Shutoff",
    icon: "🚰",
    x: 180,
    y: 310,
    room: "Garage · north wall",
    status: "good",
    shutoff: true,
    detail: {
      manufacturer: "—",
      model: "Ball valve, 3/4 in",
      serial: "—",
      installed: "2004",
      installer: "Builder",
      warranty: "—",
      lifespan: "Turn clockwise to close",
      lastService: "Exercised Feb 2026 (during anode job)",
      replaceCost: "$180–320 if seized",
      parts: [],
    },
  },
  {
    id: "gas",
    name: "Gas Shutoff",
    icon: "⛽",
    x: 786,
    y: 380,
    room: "East exterior · at meter",
    status: "good",
    shutoff: true,
    detail: {
      manufacturer: "Southwest Gas",
      model: "Quarter-turn valve at meter",
      serial: "Meter #SWG-77812",
      installed: "2004",
      installer: "Utility",
      warranty: "—",
      lifespan: "Quarter-turn with wrench to close",
      lastService: "Utility inspection 2024",
      replaceCost: "Utility-owned",
      parts: [],
    },
  },
  {
    id: "evse",
    name: "EV Charger",
    icon: "🔌",
    x: 200,
    y: 480,
    room: "Garage",
    status: "good",
    detail: {
      manufacturer: "ChargePoint",
      model: "Home Flex 50A",
      serial: "CPH50-2021-33417",
      installed: "Jun 2021 · permit #E21-8841",
      installer: "Volt Electric",
      warranty: "Expired Jun 2024 (3-yr)",
      lifespan: "10 yrs typical",
      lastService: "Firmware update May 2026",
      replaceCost: "$650 + install",
      energy: "~310 kWh/mo",
      parts: ["J1772 cable", "50A breaker"],
    },
  },
  {
    id: "hvac",
    name: "HVAC Air Handler",
    icon: "❄️",
    x: 504,
    y: 465,
    room: "Laundry closet",
    status: "warning",
    detail: {
      manufacturer: "Carrier",
      model: "24ACC6 3-ton AC + 58SB gas furnace",
      serial: "CAR-2018-45120",
      installed: "May 2018",
      installer: "Desert Air Mechanical",
      warranty: "Parts until 2028 (registered) · labor not covered",
      lifespan: "15 yrs typical · compressor cycling +12%",
      lastService: "Jun 2026 · tune-up, capacitor replaced",
      replaceCost: "$8,500–11,000 full system",
      energy: "Drives ~55% of summer bill",
      parts: ["16×25×1 filter (MERV 11)", "Run capacitor 45/5", "Contactor"],
    },
    requestPrefill:
      "My Carrier 3-ton AC (2018) is cycling more than normal and cooling feels weak in the afternoons. Parts warranty active until 2028.",
  },
  {
    id: "thermostat",
    name: "Smart Thermostat",
    icon: "🌡️",
    x: 500,
    y: 100,
    room: "Living Room",
    status: "good",
    detail: {
      manufacturer: "Ecobee",
      model: "Smart Thermostat Premium",
      serial: "EB-2023-90112",
      installed: "Jan 2023",
      installer: "Self-install",
      warranty: "Until Jan 2028",
      lifespan: "Reports runtime + cycling to health model",
      lastService: "—",
      replaceCost: "$249",
      energy: "Saves ~8% cooling",
      parts: [],
    },
  },
  {
    id: "fridge",
    name: "Refrigerator",
    icon: "🧊",
    x: 285,
    y: 375,
    room: "Kitchen",
    status: "good",
    detail: {
      manufacturer: "LG",
      model: "LRFVS3006S InstaView",
      serial: "LG-2021-70455",
      installed: "Dec 2021 · Amazon (receipt imported)",
      installer: "Delivery install",
      warranty: "Until Dec 2026 (extended)",
      lifespan: "14 yrs typical",
      lastService: "Water filter replaced May 2026",
      replaceCost: "$2,100–2,800",
      energy: "~62 kWh/mo",
      parts: ["LT1000P water filter", "Door gasket"],
    },
  },
  {
    id: "dw",
    name: "Dishwasher",
    icon: "🍽️",
    x: 340,
    y: 340,
    room: "Kitchen",
    status: "good",
    detail: {
      manufacturer: "Bosch",
      model: "300 Series SHE53C85N",
      serial: "BSH-2022-11893",
      installed: "May 2022 · Home Depot (receipt scanned)",
      installer: "HD install service",
      warranty: "Until Aug 2027 · auto-claim enabled",
      lifespan: "12 yrs typical",
      lastService: "Aug 2025 · door latch (warranty, $0)",
      replaceCost: "$950–1,300",
      energy: "~25 kWh/mo",
      parts: ["Door latch", "Drain pump", "Spray arms"],
    },
  },
  {
    id: "range",
    name: "Gas Range",
    icon: "🍳",
    x: 400,
    y: 460,
    room: "Kitchen",
    status: "good",
    detail: {
      manufacturer: "GE",
      model: "JGB735 30-in gas",
      serial: "GE-2019-30081",
      installed: "2019",
      installer: "Previous owner (record imported)",
      warranty: "Expired 2020",
      lifespan: "15 yrs typical",
      lastService: "—",
      replaceCost: "$800–1,100",
      parts: ["Igniter", "Burner caps"],
    },
  },
  {
    id: "washer",
    name: "Washer + Dryer",
    icon: "🧺",
    x: 445,
    y: 500,
    room: "Laundry",
    status: "good",
    detail: {
      manufacturer: "Samsung",
      model: "WF45 + DVE45 stack",
      serial: "SS-2020-66231",
      installed: "2020",
      installer: "Lowe's delivery",
      warranty: "Expired 2021",
      lifespan: "11 yrs typical",
      lastService: "Dryer vent cleaned Oct 2025",
      replaceCost: "$1,600 pair",
      energy: "~40 kWh/mo",
      parts: ["Drain filter", "Vent duct", "Door boot"],
    },
  },
  {
    id: "solar",
    name: "Solar Inverter",
    icon: "☀️",
    x: 58,
    y: 420,
    room: "Garage exterior",
    status: "good",
    detail: {
      manufacturer: "Enphase",
      model: "IQ7+ microinverters · 7.2 kW array",
      serial: "ENP-2022-40199",
      installed: "Mar 2022",
      installer: "SunPath Solar",
      warranty: "25-yr panels · 10-yr inverters",
      lifespan: "Producing 96% of modeled output",
      lastService: "Panel wash Apr 2026",
      replaceCost: "$18,400 system (installed)",
      energy: "-$1,420/yr offset",
      parts: [],
    },
  },
  {
    id: "irrigation",
    name: "Irrigation Controller",
    icon: "💧",
    x: 140,
    y: 480,
    room: "Garage",
    status: "good",
    detail: {
      manufacturer: "Rain Bird",
      model: "ESP-TM2 · 6 zones",
      serial: "RB-2019-55780",
      installed: "2019",
      installer: "Tanner Yard & Tree",
      warranty: "Expired 2022",
      lifespan: "Valve 3 rebuilt Apr 2026",
      lastService: "Apr 2026",
      replaceCost: "$140 + wiring",
      parts: ["Zone valves", "Rain sensor"],
    },
  },
];

/* ---------- Timeline (git history for the house) ---------- */

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  actor: string;
  kind: "repair" | "install" | "claim" | "inspection" | "purchase" | "imported";
  cost?: string;
}

export const TIMELINE: TimelineEvent[] = [
  { id: "f3a92c", date: "Jun 2026", title: "AC tune-up · capacitor replaced", actor: "Desert Air Mechanical", kind: "repair", cost: "$189" },
  { id: "b81d04", date: "Apr 2026", title: "Irrigation valve 3 rebuilt", actor: "Tanner Yard & Tree", kind: "repair", cost: "$135" },
  { id: "9c22e7", date: "Feb 2026", title: "Water heater anode rod replaced", actor: "BlueLine Plumbing Co.", kind: "repair", cost: "$145" },
  { id: "d55a1b", date: "Nov 2025", title: "Post-monsoon roof inspection", actor: "Summit Roofing · GAF warranty", kind: "inspection", cost: "$0" },
  { id: "17c8f9", date: "Aug 2025", title: "Dishwasher door latch — warranty claim", actor: "Bosch Factory Service", kind: "claim", cost: "$0" },
  { id: "44b0ae", date: "Mar 2025", title: "Panel inspection + GFCI updates", actor: "Volt Electric", kind: "inspection", cost: "$240" },
  { id: "8e61d2", date: "Jul 2023", title: "Insurance claim — monsoon roof damage", actor: "Allstate · paid $8,400 · repaired by Summit Roofing", kind: "claim" },
  { id: "a2f7c0", date: "May 2022", title: "Dishwasher installed (Bosch 300)", actor: "Home Depot · receipt auto-imported", kind: "install", cost: "$1,049" },
  { id: "cc19b3", date: "Mar 2022", title: "7.2 kW solar array installed", actor: "SunPath Solar · permit #S22-1104", kind: "install", cost: "$18,400" },
  { id: "5d90e1", date: "Jun 2021", title: "EV charger installed", actor: "Volt Electric · permit #E21-8841", kind: "install", cost: "$1,180" },
  { id: "e07f45", date: "Sep 2019", title: "House purchased — inspection seeded 34 records", actor: "MyHouse onboarding", kind: "purchase" },
  { id: "71bd28", date: "May 2018", title: "HVAC system replaced", actor: "Previous owner · record imported at sale", kind: "imported", cost: "$9,200" },
  { id: "3fa650", date: "Apr 2016", title: "Roof replaced — GAF Timberline HDZ", actor: "Previous owner · warranty transferred", kind: "imported" },
  { id: "0b83c7", date: "Jun 2015", title: "Water heater installed", actor: "Previous owner · record imported", kind: "imported" },
];

/* ---------- Maintenance engine ---------- */

export interface MaintenanceTask {
  task: string;
  due: string;
  badge: "overdue" | "soon" | "scheduled";
  action: "diy" | "book";
  est: string;
  prefill?: string;
}

export const MAINTENANCE: MaintenanceTask[] = [
  { task: "Replace HVAC filter (16×25×1 MERV 11)", due: "Overdue by 6 days", badge: "overdue", action: "diy", est: "DIY · 10 min · $14" },
  { task: "Water softener — refill salt", due: "Due in 9 days", badge: "soon", action: "diy", est: "DIY · 5 min · $8" },
  { task: "Smoke detector batteries (5 units)", due: "Due Jul 20", badge: "soon", action: "diy", est: "DIY · 20 min · $18" },
  { task: "Annual termite inspection", due: "Due Aug 2026", badge: "soon", action: "book", est: "$95–140", prefill: "Annual termite inspection for a 2,340 sq ft single family home in Phoenix." },
  { task: "Dryer vent deep clean", due: "Due Oct 2026", badge: "scheduled", action: "book", est: "$110–150", prefill: "Dryer vent deep cleaning, single story home, vent exits through roof." },
  { task: "Roof inspection (keeps GAF warranty valid)", due: "Due Nov 2026", badge: "scheduled", action: "book", est: "$0 under warranty", prefill: "Annual roof inspection required to maintain GAF Timberline warranty coverage." },
];

/* ---------- Warranty hub ---------- */

export interface Warranty {
  item: string;
  until: string;
  source: string;
  pctUsed: number;
  state: "active" | "expiring" | "expired";
  autoClaim?: boolean;
}

export const WARRANTIES: Warranty[] = [
  { item: "GAF roof — Timberline HDZ lifetime ltd.", until: "2041", source: "Builder cert · scanned", pctUsed: 40, state: "active" },
  { item: "Carrier HVAC — parts (registered)", until: "May 2028", source: "Manufacturer portal", pctUsed: 81, state: "active" },
  { item: "Bosch dishwasher — extended", until: "Aug 2027", source: "Home Depot receipt · auto-imported", pctUsed: 79, state: "active", autoClaim: true },
  { item: "LG refrigerator — extended", until: "Dec 2026", source: "Amazon order · auto-imported", pctUsed: 91, state: "expiring" },
  { item: "Ecobee thermostat", until: "Jan 2028", source: "Email receipt · parsed", pctUsed: 68, state: "active" },
  { item: "ChargePoint EV charger", until: "Jun 2024", source: "Volt Electric invoice", pctUsed: 100, state: "expired" },
];

/* ---------- Utilities ---------- */

export const UTILITY_BILLS = [
  { name: "Electricity — APS", amount: "$184", trend: "+12% vs May", note: "Cooling season driver", up: true },
  { name: "Water — City of Phoenix", amount: "$58", trend: "-3% vs May", note: "Irrigation on smart schedule", up: false },
  { name: "Gas — Southwest Gas", amount: "$22", trend: "flat", note: "Water heater + range", up: false },
  { name: "Internet — Cox 500Mbps", amount: "$70", trend: "flat", note: "Fiber now available: $55/mo — save $180/yr", up: false },
  { name: "Trash & sewer — City", amount: "$32", trend: "flat", note: "", up: false },
];

/* ---------- Insurance & Mortgage ---------- */

export const INSURANCE = {
  carrier: "Allstate HO-3",
  premium: "$1,860/yr",
  deductible: "$2,500",
  renewal: "Mar 2027",
  claims: "1 claim · Jul 2023 monsoon roof · $8,400 paid",
  gap: "No flood coverage — parts of 85018 sit near flash-flood zone AE. Est. $38/mo to add.",
  discount: "Leak sensors + maintained record qualify for a 6% protective-device discount — not yet applied.",
};

export const MORTGAGE = {
  lender: "Rocket Mortgage · 30-yr fixed 5.1% (2021)",
  balance: "$286,400",
  payment: "$2,180/mo (P&I + escrow)",
  escrow: "$4,920/yr (tax $3,060 + insurance $1,860)",
  equity: "$211,600",
  value: "$498,000",
  valueTrend: "+4.2% YoY",
  refi: "No refi advantage at current rates — watching for < 4.6%.",
};

/* ---------- Car garage ---------- */

export interface Vehicle {
  name: string;
  vin: string;
  miles: string;
  next: string;
  registration: string;
  insurance: string;
  alert?: string;
}

export const VEHICLES: Vehicle[] = [
  {
    name: "2022 Toyota RAV4 Hybrid",
    vin: "JTMB6RFV8ND512334",
    miles: "31,240 mi",
    next: "Oil change due in ~800 mi · tires rotated Mar 2026",
    registration: "Renews Nov 2026",
    insurance: "Progressive · bundled",
  },
  {
    name: "2018 Honda Civic",
    vin: "2HGFC2F59JH552918",
    miles: "68,900 mi",
    next: "Brake fluid flush due Aug 2026",
    registration: "Renews Feb 2027",
    insurance: "Progressive · bundled",
    alert: "Open recall: fuel pump (NHTSA 23V-857) — free fix at any Honda dealer.",
  },
];

/* ---------- Family workspace ---------- */

export const FAMILY = [
  { name: "Atharva K.", role: "Owner", access: "Full control · financials · warranties · can delete assets" },
  { name: "Priya K.", role: "Co-owner", access: "Full control · financials" },
  { name: "Aarav (14)", role: "Child", access: "Chores: trash Thu · HVAC filter helper · emergency contacts" },
  { name: "Guest pass", role: "Guest", access: "Smart-lock code + Wi-Fi · expires Sunday 8 PM" },
];

/* ---------- Emergency mode ---------- */

export const EMERGENCY = {
  shutoffs: [
    { name: "Water main", where: "Garage · north wall, behind door", how: "Ball valve — turn clockwise to close" },
    { name: "Gas", where: "East exterior · at the meter", how: "Quarter-turn with wrench (kit hangs on valve)" },
    { name: "Electrical", where: "Garage · Square D panel, west wall", how: "Main breaker at top — flip to OFF" },
  ],
  contacts: [
    { name: "BlueLine Plumbing Co. — 24/7", phone: "(602) 555-0134" },
    { name: "Volt Electric — 24/7", phone: "(602) 555-0177" },
    { name: "Allstate claims", phone: "1-800-255-7828 · Policy #AZ-882-4471" },
    { name: "Southwest Gas emergency", phone: "1-877-860-6020" },
  ],
  access: "Lockbox on side gate · code shared with emergency contacts only",
};
