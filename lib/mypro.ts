/* ---------- MyPro: the provider-side OS ---------- */

export const PRO = {
  name: "Marcus Rivera",
  business: "BlueLine Plumbing Co.",
  trade: "Plumbing",
  rating: 4.9,
  jobs: 1240,
  stats: [
    { label: "First-time fix rate", value: "94%", hint: "top 5% in Phoenix" },
    { label: "Repeat customers", value: "38%", hint: "network median 17%" },
    { label: "Avg response", value: "8 min", hint: "to new job broadcasts" },
    { label: "Warranty callback rate", value: "1.2%", hint: "network median 4.8%" },
  ],
  verifications: [
    { name: "AZ ROC license #312448", state: "Verified · renews 09/2026" },
    { name: "General liability $2M", state: "Verified · lapses 03/2027 (auto-monitored)" },
    { name: "Background check (2 techs)", state: "Clear · renewed Jan 2026" },
    { name: "Bond $15,000", state: "Active" },
  ],
  payouts: {
    week: "$4,320",
    escrow: "$980",
    next: "Instant payout available — released when homeowner confirms",
  },
};

export interface ProJob {
  id: string;
  title: string;
  context: string[];
  distance: string;
  urgency: "Emergency" | "This week" | "Flexible";
  budget: string;
  bidsSoFar: number;
  suggestedBid: number;
  match: string;
}

export const PRO_JOBS: ProJob[] = [
  {
    id: "j1",
    title: "Water heater replacement",
    context: [
      "Rheem Performance 50 gal gas · installed 2015 · at 92% of failure window",
      "Home record: anode rod replaced Feb 2026 · drain pan + leak sensor present",
      "Garage install · 3/4-in shutoff exercised recently — easy access",
    ],
    distance: "2.1 mi",
    urgency: "This week",
    budget: "$1,400–1,900",
    bidsSoFar: 3,
    suggestedBid: 1650,
    match: "You're Rheem-certified and 6 min away on Thursday's route",
  },
  {
    id: "j2",
    title: "Active leak — ceiling below upstairs bath",
    context: [
      "Homeowner photos attached · water main already shut off",
      "Home record: copper supply lines, repiped 2012 (imported)",
      "Twin shows bath drain stack directly above the stain",
    ],
    distance: "3.4 mi",
    urgency: "Emergency",
    budget: "$250–600 diagnostic + repair",
    bidsSoFar: 1,
    suggestedBid: 340,
    match: "Emergency slot open on your calendar 2–4 PM today",
  },
  {
    id: "j3",
    title: "Water softener install",
    context: [
      "Pre-plumbed loop in garage · homeowner supplied unit (Rheem 42k grain)",
      "Home record: municipal water hardness 14 gpg — high",
    ],
    distance: "5.2 mi",
    urgency: "Flexible",
    budget: "$350–550 labor",
    bidsSoFar: 5,
    suggestedBid: 420,
    match: "Fits Saturday morning route — 2 other jobs within 3 mi",
  },
];

export const PRO_SCHEDULE = [
  { time: "8:00 AM", title: "Water heater install", where: "4821 E Maple Hollow Dr · 2.1 mi", note: "Parts on truck: Rheem 50-gal, pan, T&P valve" },
  { time: "11:30 AM", title: "Slab leak assessment", where: "Arcadia · 4.8 mi", note: "Acoustic kit needed · photos in job file" },
  { time: "2:00 PM", title: "Emergency hold slot", where: "Auto-filled from broadcasts", note: "Kept open — 78% fill rate this month" },
  { time: "4:30 PM", title: "Softener install", where: "Biltmore · 3.2 mi", note: "Homeowner-supplied unit on site" },
];

export const ROUTE_NOTE =
  "Route optimized: 28 mi, 54 min drive — saves 22 min vs. first-come order. Emergency hold slot kept adjacent to dense cluster.";
