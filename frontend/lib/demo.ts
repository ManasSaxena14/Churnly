"use client";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Demo defaults — pre-fill the questionnaire so a one-click demo runs the full
// pipeline against the bundled 300-row churn dataset. Shape mirrors FormData in
// app/form/page.tsx; sessionStorage key matches the one the form reads on mount.
export const DEMO_FORM_STATE = {
  businessContext:
    "Subscription-based digital service with three plan tiers (Basic / Standard / Premium) and three contract cadences (Monthly / Quarterly / Annual). Customers self-onboard, billing is automated, support is mixed CSM + self-serve. Working with a diagnostic sample of 300 customers — stratified across tenure buckets and Plan×Contract cells, oversampled on the first-90-day cohort, and feature-diverse sampled so every CoxPH driver has meaningful variance.",
  csvFile: null,
  churnDefinition: "Inactivity",
  churnDefinitionOther: "",
  churnInactivityDays: "30",
  businessModel: "B2C SaaS",
  typicalCustomer: "Individual consumer",
  companyStage: "Growth",
  revenueModel: "Monthly subscription",
  pricingFlexibility: ["Can offer discounts or promotions", "Can restructure plans or tiers"],
  coreFeatures:
    "Content library, Weekly digest, Mobile sync, Premium offline mode, Account analytics dashboard",
  canShipChanges: "Yes",
  hasCompletionPoint: "No",
  topChannels: ["Paid ads", "Organic search / SEO"],
  topCompetitors: "HubSpot, Mailchimp, ConvertKit",
  churnDestination: "To a competitor",
  supportModel: "Dedicated CSMs for key accounts",
  retentionTactics: ["Onboarding flow / tutorials", "NPS / feedback collection", "Win-back campaigns"],
  prioritySegment: "Newest customers (first 90 days)",
  prioritySegmentOther: "",
  topGoal: "Reduce churn rate",
  timeline: "90-day plan",
  anythingElse:
    "Monthly contract subscribers are churning at near-100% — we suspect this is partly definitional (the dataset labels them all churn=1 once their contract ends) but want strategies that still treat short-cadence subscribers as a real cohort.",
  analysisDepth: "quick",
};

export interface CachedRun {
  job_id: string;
  demo?: boolean;
  events: Array<{ type: string; data?: unknown; ts_ms?: number; message?: string }>;
  metrics?: Record<string, unknown>;
}

/* Cached demo: a real finished run promoted with
   `python -m app.runs promote <job_id>`. The static copy in /public works even
   when the backend is asleep; the backend copy is the fallback. */
export async function fetchCachedDemo(): Promise<CachedRun | null> {
  for (const url of ["/demo_run.json", `${API_BASE}/demo`]) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const run = (await res.json()) as CachedRun;
      if (Array.isArray(run?.events) && run.events.some((e) => e.type === "solution_ready")) return run;
    } catch {
      /* try next source */
    }
  }
  return null;
}

/* Prime the form with demo answers + the bundled CSV for a live run. */
export function primeLiveDemo() {
  sessionStorage.setItem("latest_form_state", JSON.stringify(DEMO_FORM_STATE));
  sessionStorage.setItem("demo_csv_url", "/churn_demo_300.csv");
  sessionStorage.setItem("demo_csv_name", "churn_demo_300.csv");
}

/* Questionnaire payload the results page reads for its context chips. */
export function primeDemoContext() {
  sessionStorage.setItem(
    "latest_form_payload",
    JSON.stringify({
      raw_csv_path: "churn_demo_300.csv",
      questionnaire: {
        business_model: DEMO_FORM_STATE.businessModel,
        priority_segment: DEMO_FORM_STATE.prioritySegment,
        goal: DEMO_FORM_STATE.topGoal,
        timeline: DEMO_FORM_STATE.timeline,
        support_model: DEMO_FORM_STATE.supportModel,
        can_ship_changes: DEMO_FORM_STATE.canShipChanges,
        pricing_flexibility: DEMO_FORM_STATE.pricingFlexibility,
        retention_tactics: DEMO_FORM_STATE.retentionTactics,
        competitors: DEMO_FORM_STATE.topCompetitors.split(",").map((s) => s.trim()),
        analysis_depth: DEMO_FORM_STATE.analysisDepth,
      },
    }),
  );
}
