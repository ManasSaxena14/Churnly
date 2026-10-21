"use client";

import { API_BASE } from "./demo";

/* Typed client for the post-run analytics API (backend app/main.py). */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(0, `Can't reach the backend at ${API_BASE}.`);
  }
  if (!res.ok) {
    const detail = await res.json().then((d) => d?.detail).catch(() => null);
    throw new ApiError(res.status, typeof detail === "string" ? detail : `Request failed (HTTP ${res.status})`);
  }
  return res.json();
}

/* ── workspace ─────────────────────────────────────────────── */

export interface RunSummary {
  job_id: string; status: string; saved_at: number;
  dataset_name?: string | null; business_model?: string | null; analysis_depth?: string | null;
  data_available: boolean;
  active_customers?: number | null; high_risk_customers?: number | null; model_confidence?: number | null;
  churn_probability?: number | null; median_survival?: number | null;
  retention_curve: [number, number][];
  top_cause?: string | null; top_driver?: string | null; significant_tests?: number | null;
  playbook_title?: string | null; problems: number; grounded_rate?: number | null; expected_lift?: number | null;
  llm_calls?: number | null; total_tokens?: number | null; cost_usd?: number | null; elapsed_s?: number | null;
}
export interface Workspace {
  runs: RunSummary[];
  kpis: {
    runs: number; completed: number; customers_analyzed: number; high_risk_customers: number;
    avg_churn_probability: number | null; avg_grounded_rate: number | null; avg_expected_lift: number | null; total_tokens: number;
  };
}
export const getWorkspace = () => json<Workspace>("/runs");

/* ── risk ──────────────────────────────────────────────────── */

export interface RiskDriver { feature: string; label: string; impact: number }
export interface RiskCustomer {
  customer_id: string; tenure: number; risk: number; tier: "high" | "medium" | "low";
  drivers: RiskDriver[]; value?: number; value_at_risk?: number;
}
export interface RiskReport {
  job_id: string; horizon: number; tenure_column: string; thresholds: { high: number; medium: number };
  summary: {
    active_customers: number; expected_churners: number; mean_risk: number;
    tiers: { high: number; medium: number; low: number };
    value_column: string | null; value_at_risk: number | null;
    histogram: { from: number; to: number; count: number }[];
    top_drivers: { driver: string; share_of_top_decile: number }[];
  };
  total: number; customers: RiskCustomer[];
}
export const getRisk = (jobId: string, p: { horizon: number; tier?: string; limit?: number; offset?: number; q?: string }) => {
  const qs = new URLSearchParams({ horizon: String(p.horizon), limit: String(p.limit ?? 25), offset: String(p.offset ?? 0) });
  if (p.tier) qs.set("tier", p.tier);
  if (p.q) qs.set("q", p.q);
  return json<RiskReport>(`/runs/${encodeURIComponent(jobId)}/risk?${qs}`);
};
export const riskCsvUrl = (jobId: string, horizon: number) =>
  `${API_BASE}/runs/${encodeURIComponent(jobId)}/risk.csv?horizon=${horizon}`;

/* ── what-if ───────────────────────────────────────────────── */

export interface Levers {
  categorical: { column: string; levels: { value: string; share: number; hazard_ratio: number }[] }[];
  numeric: { column: string; mean: number; min: number; max: number; hazard_ratio_per_unit: number }[];
}
export type Lever =
  | { kind: "shift"; column: string; from: string; to: string; share: number }
  | { kind: "scale"; column: string; factor: number }
  | { kind: "cap"; column: string; max: number };
export interface WhatIfResult {
  horizon: number; applied: string[]; active_customers: number;
  baseline: { expected_churners: number; churn_rate: number };
  scenario: { expected_churners: number; churn_rate: number };
  customers_saved: number; relative_change: number;
  curve: { t: number; baseline: number; scenario: number }[];
  caveat: string; value_column?: string; value_saved?: number;
}
export const getLevers = (jobId: string) => json<Levers>(`/runs/${encodeURIComponent(jobId)}/whatif/levers`);
export const runWhatIf = (jobId: string, levers: Lever[], horizon: number) =>
  json<WhatIfResult>(`/runs/${encodeURIComponent(jobId)}/whatif`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ levers, horizon }),
  });

/* ── compare ───────────────────────────────────────────────── */

export interface CompareResult {
  a: { job_id: string; dataset_name?: string; saved_at?: number; rows: number; churn_rate: number };
  b: { job_id: string; dataset_name?: string; saved_at?: number; rows: number; churn_rate: number };
  overall: { churn_a: number; churn_b: number; delta_pp: number; p_value: number | null };
  headline: string[];
  km: { a: { t: number; s: number }[]; b: { t: number; s: number }[] };
  segments: { stat_id: string; churn_a: number; churn_b: number; delta_pp: number; excess_pp: number; size_a: number; size_b: number; p_adj: number | null; significant: boolean }[];
  drivers: { feature: string; hr_a: number; hr_b: number; change: number }[];
  tests_run: number; significant_changes: number;
}
export const compareRuns = (a: string, b: string) =>
  json<CompareResult>(`/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);

/* ── copilot (SSE over POST) ───────────────────────────────── */

export type CopilotEvent =
  | { type: "step"; tool: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool: string; summary: string; table?: { columns: string[]; rows: unknown[][]; truncated: boolean } | null }
  | { type: "answer"; text: string; citations: string[]; unverified: string[] }
  | { type: "error"; message: string }
  | { type: "done" };

export async function askCopilot(
  jobId: string, question: string, history: { role: "user" | "assistant"; content: string }[],
  onEvent: (e: CopilotEvent) => void, signal?: AbortSignal,
) {
  const res = await fetch(`${API_BASE}/runs/${encodeURIComponent(jobId)}/copilot`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }), signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.json().then((d) => d?.detail).catch(() => null);
    throw new ApiError(res.status, detail || `Copilot unavailable (HTTP ${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (chunk.startsWith("data:")) {
        try { onEvent(JSON.parse(chunk.slice(5).trim())); } catch { /* partial line */ }
      }
    }
  }
}
