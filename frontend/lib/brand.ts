/* Single source of truth for the product name and copy. Rename the product
   here and every page, the logo, metadata and exports follow. */
export const BRAND = {
  name: "Churnly",
  /** Wordmark is rendered as two parts so the second can carry the gradient. */
  wordmark: ["Churn", "ly"] as const,
  tagline: "AI retention analysis you can trust",
  category: "AI retention analyst",
  description:
    "Upload your customer data. Churnly finds what really drives churn using proven statistics, then a team of AI agents builds a 30-60-90 day retention plan — with evidence behind every recommendation.",
} as const;
