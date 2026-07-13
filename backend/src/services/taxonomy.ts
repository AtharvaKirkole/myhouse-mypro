/*
 * Service taxonomy — categories are DATA, not code.
 *
 * Adding a service (gardener, trash collection, holiday lights…) is a row
 * here: the classifier, the pro job feed, and the categories endpoint all
 * read this table. Ordering matters for classification — specific multi-word
 * services come before equipment, equipment before trades, specific cleaning
 * before generic cleaning — because ties in hit-count resolve to the earlier
 * entry.
 */

export interface ServiceCategory {
  id: string;
  cluster:
    | "Cleaning"
    | "Trades"
    | "Appliances"
    | "Outdoor"
    | "Removal & Collection"
    | "Install & Inspect"
    | "Specialty";
  professions: string[]; // pro professions that receive these jobs
  words: string[]; // classifier vocabulary (empty = manual selection only)
}

export const TAXONOMY: ServiceCategory[] = [
  /* ---- specific multi-word services first (win ties over generics) ---- */
  { id: "Dryer Vent Cleaning", cluster: "Cleaning", professions: ["Cleaner", "HVAC"], words: ["dryer vent"] },
  { id: "Chimney Service", cluster: "Cleaning", professions: ["Chimney Service"], words: ["chimney"] },
  { id: "Gutter Cleaning", cluster: "Outdoor", professions: ["Gutter Cleaning", "Roofer"], words: ["gutter"] },
  { id: "Solar Panel Cleaning", cluster: "Outdoor", professions: ["Solar Installer", "Cleaner"], words: ["solar panel clean", "panels are dirty"] },
  { id: "Pressure Washing", cluster: "Outdoor", professions: ["Pressure Washing"], words: ["pressure wash", "power wash"] },
  { id: "Window Cleaning", cluster: "Cleaning", professions: ["Window Cleaning", "Cleaner"], words: ["window clean", "windows washed", "window washing"] },
  { id: "Carpet Cleaning", cluster: "Cleaning", professions: ["Cleaner"], words: ["carpet"] },
  { id: "Bathroom & Toilet Cleaning", cluster: "Cleaning", professions: ["Cleaner", "Housekeeper"], words: ["toilet clean", "toilets clean", "bathroom clean", "bathrooms clean", "sanitiz", "grout"] },
  { id: "Kitchen Cleaning", cluster: "Cleaning", professions: ["Cleaner", "Housekeeper"], words: ["kitchen clean", "degrease"] },
  { id: "Move-Out Cleaning", cluster: "Cleaning", professions: ["Cleaner"], words: ["move-out clean", "move out clean", "move-in clean", "move in clean"] },
  { id: "Deep Cleaning", cluster: "Cleaning", professions: ["Cleaner", "Housekeeper"], words: ["deep clean"] },
  { id: "Garage Door", cluster: "Trades", professions: ["Garage Door"], words: ["garage door"] },
  { id: "EV Charger Install", cluster: "Install & Inspect", professions: ["Electrician", "EV Charger Install"], words: ["ev charger", "charger install"] },
  { id: "Smart Home & Security", cluster: "Install & Inspect", professions: ["Smart Home", "Security Installer"], words: ["smart home", "security system", "camera install", "video doorbell"] },
  { id: "Water Restoration", cluster: "Specialty", professions: ["Water Restoration", "Mold Remediation"], words: ["water damage", "mold", "restoration"] },
  { id: "Sewer Service", cluster: "Trades", professions: ["Plumber", "Sewer Service"], words: ["sewer", "main line", "septic"] },

  /* ---- equipment before trades ("dishwasher not draining" is appliance) ---- */
  { id: "Appliance Repair", cluster: "Appliances", professions: ["Appliance Repair"], words: ["fridge", "refrigerator", "dishwasher", "washer", "dryer", "oven", "stove", "microwave"] },

  /* ---- core trades ---- */
  { id: "Plumbing", cluster: "Trades", professions: ["Plumber"], words: ["leak", "pipe", "faucet", "drain", "toilet", "water heater", "clog", "sump"] },
  { id: "Electrical", cluster: "Trades", professions: ["Electrician"], words: ["outlet", "breaker", "spark", "wiring", "panel", "no power", "ceiling fan"] },
  { id: "HVAC", cluster: "Trades", professions: ["HVAC"], words: ["ac ", "air condition", "furnace", "no heat", "not cooling", "hvac", "compressor", "thermostat"] },
  { id: "Roofing", cluster: "Trades", professions: ["Roofer"], words: ["roof", "shingle"] },
  { id: "Painting", cluster: "Trades", professions: ["Painter"], words: ["paint"] },
  { id: "Fence & Deck", cluster: "Trades", professions: ["Carpenter", "Fence Installer"], words: ["fence", "deck"] },
  { id: "Concrete", cluster: "Trades", professions: ["Concrete Contractor", "Mason"], words: ["concrete", "driveway crack", "pour a slab"] },
  { id: "Glass Repair", cluster: "Trades", professions: ["Glass Repair", "Window Installer"], words: ["glass", "window repair", "cracked window"] },
  { id: "Flooring", cluster: "Trades", professions: ["Flooring"], words: ["flooring", "tile", "hardwood", "laminate"] },
  { id: "Locksmith", cluster: "Specialty", professions: ["Locksmith"], words: ["locked out", "rekey", "deadbolt", "door lock", "smart lock"] },

  /* ---- outdoor & grounds ---- */
  { id: "Pest Control", cluster: "Specialty", professions: ["Pest Control"], words: ["pest", "termite", "roach", "ants", "mosquito", "scorpion", "bed bug", "rodent"] },
  { id: "Pool Care", cluster: "Outdoor", professions: ["Pool Technician"], words: ["pool", "hot tub", "spa "] },
  { id: "Tree Service", cluster: "Outdoor", professions: ["Arborist", "Landscaper"], words: ["tree", "palm", "stump", "branches"] },
  { id: "Gardening & Lawn Care", cluster: "Outdoor", professions: ["Gardener", "Landscaper"], words: ["garden", "lawn", "mow", "weed", "hedge", "shrub", "flower bed"] },
  { id: "Landscaping", cluster: "Outdoor", professions: ["Landscaper"], words: ["landscap", "xeriscape", "sod", "sprinkler", "irrigation"] },
  { id: "Snow Removal", cluster: "Outdoor", professions: ["Snow Removal", "Landscaper"], words: ["snow", "plow"] },
  { id: "Leaf Removal", cluster: "Outdoor", professions: ["Gardener", "Landscaper"], words: ["leaves", "leaf"] },

  /* ---- removal & collection ---- */
  { id: "Junk Removal", cluster: "Removal & Collection", professions: ["Junk Removal"], words: ["junk", "haul away", "haul-away", "declutter", "furniture removal", "appliance removal"] },
  { id: "Trash Collection", cluster: "Removal & Collection", professions: ["Trash Collection"], words: ["trash", "garbage", "bin pickup", "waste pickup", "bulk waste"] },
  { id: "Scrap Collection", cluster: "Removal & Collection", professions: ["Scrap Collection"], words: ["scrap"] },
  { id: "Recycling Pickup", cluster: "Removal & Collection", professions: ["Trash Collection"], words: ["recycling", "recycle pickup"] },

  /* ---- generic cleaning AFTER every specific cleaning service ---- */
  { id: "Cleaning", cluster: "Cleaning", professions: ["Cleaner", "Housekeeper"], words: ["clean", "maid", "housekeep"] },

  /* ---- inspect & professional ---- */
  { id: "Home Inspection", cluster: "Install & Inspect", professions: ["Home Inspector"], words: ["inspection", "inspector", "appraisal walkthrough"] },
  { id: "Moving", cluster: "Specialty", professions: ["Moving Company"], words: ["movers", "moving truck", "move my furniture", "move a couch"] },
  { id: "Holiday Lighting", cluster: "Specialty", professions: ["Handyman", "Electrician"], words: ["holiday light", "christmas light", "string light", "light display"] },

  /* ---- fallback ---- */
  { id: "Handyman", cluster: "Specialty", professions: ["Handyman"], words: [] },
];

/** ordered [category, words] pairs for the classifier */
export function classifierEntries(): [string, string[]][] {
  return TAXONOMY.filter((c) => c.words.length > 0).map((c) => [c.id, c.words]);
}

/** professions that should see jobs of a category in their feed */
export function professionsFor(categoryId: string): string[] {
  return TAXONOMY.find((c) => c.id === categoryId)?.professions ?? ["Handyman"];
}

export function taxonomyByCluster(): Record<string, { id: string; professions: string[] }[]> {
  const out: Record<string, { id: string; professions: string[] }[]> = {};
  for (const c of TAXONOMY) {
    (out[c.cluster] ??= []).push({ id: c.id, professions: c.professions });
  }
  return out;
}
