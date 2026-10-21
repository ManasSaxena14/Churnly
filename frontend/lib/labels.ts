/* Human-readable names for statistic ids like "support::high_4_plus".
   Mirrors backend app/stats/labels.py. */
const FAMILY: Record<string, string> = {
  contract: "Contract", plan_tier: "Plan", channel: "Came from", integration: "Integration",
  support: "Support tickets", usage: "Usage", tenure: "Time as customer",
};
const LEVEL: Record<string, Record<string, string>> = {
  support: { none_0: "none", low_1_3: "1–3", high_4_plus: "4 or more" },
  usage: { q1_lowest: "lowest 25%", q2_low: "below average", q3_high: "above average", q4_highest: "top 25%" },
  tenure: { "0_1mo": "first month", "1_3mo": "1–3 months", "3_6mo": "3–6 months", "6_12mo": "6–12 months", "12_24mo": "1–2 years", "24plus_mo": "over 2 years" },
};

export function friendlyStat(statId: string): string {
  const [family, level] = statId.split("::");
  const name = FAMILY[family] ?? family.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  if (!level) return name;
  return `${name}: ${LEVEL[family]?.[level] ?? level}`;
}
