/* Feature flags: off → beta cohort → everyone. Swap for LaunchDarkly/Unleash later. */

type Rollout = "off" | "beta" | "all";

const FLAGS: Record<string, Rollout> = {
  asset_ai_extraction: "all",
  global_search: "all",
  twin_3d: "beta",
  predictive_maintenance: "off",
  payments_escrow: "all",
};

const BETA_USERS = new Set<string>(); // user ids opted into beta

export function setBeta(userId: string, on: boolean) {
  if (on) BETA_USERS.add(userId);
  else BETA_USERS.delete(userId);
}

export function flagEnabled(flag: string, userId?: string): boolean {
  const r = FLAGS[flag] ?? "off";
  if (r === "all") return true;
  if (r === "beta") return !!userId && BETA_USERS.has(userId);
  return false;
}

export function allFlags(userId?: string): Record<string, boolean> {
  return Object.fromEntries(Object.keys(FLAGS).map((f) => [f, flagEnabled(f, userId)]));
}
