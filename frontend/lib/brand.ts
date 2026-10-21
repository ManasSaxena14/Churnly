/* Single source of truth for the product name and copy. Rename the product
   here and every page, the logo, metadata and exports follow. */
export const BRAND = {
  name: "Churnly",
  /** Wordmark is rendered as two parts so the second can carry the gradient. */
  wordmark: ["Churn", "ly"] as const,
  tagline: "Retention intelligence with receipts",
  category: "Multi-agent AI retention analyst",
  description:
    "Upload a customer CSV. Churnly runs survival models and corrected significance tests before any LLM speaks, then a 21-node agent graph debates, simulates and cites its way to a 30-60-90 retention playbook — every claim with a receipt.",
} as const;
