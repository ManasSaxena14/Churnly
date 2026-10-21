import { BRAND } from "@/lib/brand";
import type {
  DiagnosisData, GroundednessReport, Playbook, ProblemSolution, RunMetrics, SimulationData,
} from "./types";

/* Playbook export. Markdown is built from the same SSE payloads the results
   page renders, so the export never says anything the screen doesn't. */

export interface ReportData {
  jobId: string;
  playbook: Playbook;
  groundedness?: GroundednessReport | null;
  diagnosis?: DiagnosisData | null;
  simulation?: SimulationData | null;
  metrics?: RunMetrics | null;
  demo?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reportDataFromStages(jobId: string, stages: Record<string, any>, metrics?: RunMetrics | null): ReportData | null {
  const playbook = stages.solution_ready?.final_playbook;
  if (!playbook?.executive_summary) return null;
  return {
    jobId,
    playbook,
    groundedness: stages.solution_ready?.groundedness ?? null,
    diagnosis: stages.diagnosis_ready ?? null,
    simulation: stages.simulation_ready ?? null,
    metrics: metrics ?? null,
    demo: jobId === "demo",
  };
}

const pct = (n?: number | null, digits = 0) => (n == null ? "—" : `${(n * 100).toFixed(digits)}%`);
const esc = (s?: string | null) => (s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();

function table(head: string[], rows: (string | number | null | undefined)[][]): string {
  if (!rows.length) return "";
  const line = (cells: (string | number | null | undefined)[]) => `| ${cells.map((c) => esc(c == null ? "—" : String(c))).join(" | ")} |`;
  return [line(head), `|${head.map(() => "---").join("|")}|`, ...rows.map(line)].join("\n") + "\n";
}

function problemMd(p: ProblemSolution): string {
  const out: string[] = [];
  out.push(`### ${p.priority}. ${p.problem.title}`);
  out.push("");
  out.push(`**Problem.** ${p.problem.description}`);
  out.push("");
  out.push(`- **Affected segment:** ${p.problem.affected_segment}`);
  out.push(`- **Current impact:** ${p.problem.current_impact}`);
  out.push("");
  out.push(`**Solution — ${p.solution.title}** _(${p.solution.framework_used})_`);
  out.push("");
  out.push(p.solution.description);
  out.push("");
  for (const a of p.solution.key_actions ?? []) out.push(`- ${a}`);
  out.push("");
  const ri = p.retention_impact;
  out.push(
    `**Expected impact:** +${ri.estimated_lift_percent}% retention · ~${ri.estimated_users_retained?.toLocaleString?.() ?? ri.estimated_users_retained} users retained · ${ri.estimated_revenue_impact} · confidence ${pct(ri.confidence)} · ${ri.time_to_impact}`,
  );
  out.push("");

  const chain = p.rationale_chain;
  if (chain) {
    out.push("**Evidence chain**");
    out.push("");
    const s = chain.stat;
    if (s?.stat_id && s.stat_id !== "(none)") {
      out.push(
        `1. **Statistic** — \`${s.stat_id}\`: churn ${pct(s.churn_rate, 1)} over ${s.size?.toLocaleString() ?? "—"} customers` +
          (s.p_adj != null ? `, p_adj ${s.p_adj.toFixed(4)}` : s.p_value != null ? `, p ${s.p_value.toFixed(4)}` : "") +
          (s.significant === false ? " _(not significant after correction)_" : ""),
      );
    } else {
      out.push("1. **Statistic** — _no matching statistical bucket_");
    }
    const c = chain.cause;
    out.push(`2. **Root cause** — ${c?.text ?? "—"}${c?.citations?.length ? ` _(cites: ${c.citations.join(", ")})_` : ""}`);
    out.push(`3. **Tactic** — ${chain.tactic?.recommendation ?? "—"}${chain.tactic?.framework ? ` _(${chain.tactic.framework})_` : ""}`);
    const o = chain.simulated_outcome;
    out.push(
      o?.mean_lift != null
        ? `4. **Simulated outcome** — mean lift ${o.mean_lift}% (p10 ${o.percentile_10 ?? "—"}%, p90 ${o.percentile_90 ?? "—"}%), prior: ${o.lift_prior_anchor ?? "—"}`
        : "4. **Simulated outcome** — _not simulated_",
    );
    out.push(`5. **Risk** — ${chain.risk?.description ?? "—"}${chain.risk?.severity ? ` _(severity: ${chain.risk.severity})_` : ""}`);
    out.push(`6. **Mitigation** — ${chain.mitigation?.description ?? "—"}`);
    out.push("");
  }

  if (p.implementation_steps?.length) {
    out.push("**Implementation steps**");
    out.push("");
    out.push(table(
      ["#", "Action", "Owner", "Effort", "Timeline", "Deliverable"],
      p.implementation_steps.map((st) => [st.step, st.action, st.owner, st.effort, st.timeline, st.deliverable]),
    ));
  }
  return out.join("\n");
}

export function playbookToMarkdown(d: ReportData): string {
  const pb = d.playbook;
  const es = pb.executive_summary;
  const lines: string[] = [];
  const created = pb.created_date ? new Date(pb.created_date).toLocaleString() : new Date().toLocaleString();

  lines.push(`# ${pb.title}`);
  lines.push("");
  lines.push(`_${BRAND.name} retention playbook · job \`${d.jobId}\` · generated ${created}${d.demo ? " · cached demo run" : ""}_`);
  lines.push("");
  lines.push("## Executive summary");
  lines.push("");
  lines.push(table(["Problems identified", "Projected lift", "Timeline", "Budget", "Confidence"], [[
    es.total_problems_identified, es.total_projected_retention_lift, es.estimated_timeline, es.estimated_budget, es.confidence_level,
  ]]));

  const g = d.groundedness;
  if (g?.problems) {
    lines.push(
      `**Groundedness:** ${pct(g.grounded_rate)} of problems carry all three receipts ` +
        `(significant stat ${pct(g.stat_rate)} · citation ${pct(g.citation_rate)} · simulation ${pct(g.simulation_rate)}).` +
        (g.unsupported.length ? ` Missing a receipt: ${g.unsupported.join("; ")}.` : ""),
    );
    lines.push("");
  }

  const sig = d.diagnosis?.significance_summary;
  if (sig?.tests_run) {
    lines.push(
      `**Stats gate:** ${sig.tests_run} two-proportion z-tests; ${sig.significant_after_correction ?? 0} survive ` +
        `${sig.correction === "none" ? "raw p < 0.05" : "Benjamini-Hochberg correction"}` +
        (sig.removed_by_correction ? ` (${sig.removed_by_correction} discarded as likely noise)` : "") + ".",
    );
    lines.push("");
  }

  lines.push("## Problems & solutions");
  lines.push("");
  for (const p of pb.problems_and_solutions ?? []) {
    lines.push(problemMd(p));
    lines.push("");
  }

  const rm = pb["30_60_90_roadmap"];
  if (rm) {
    lines.push("## 30 / 60 / 90 roadmap");
    lines.push("");
    for (const [label, ph] of [["Days 1–30", rm.phase_1_30_days], ["Days 31–60", rm.phase_2_60_days], ["Days 61–90", rm.phase_3_90_days]] as const) {
      if (!ph) continue;
      lines.push(`### ${label} — ${ph.theme}`);
      lines.push("");
      for (const goal of ph.goals ?? []) lines.push(`- ${goal}`);
      if (ph.key_milestones?.length) {
        lines.push("");
        lines.push(`_Milestones:_ ${ph.key_milestones.join("; ")}`);
      }
      lines.push("");
      lines.push(`_Expected lift:_ ${ph.expected_lift}`);
      lines.push("");
    }
  }

  if (pb.success_metrics?.length) {
    lines.push("## Success metrics");
    lines.push("");
    lines.push(table(["Metric", "Current", "Target", "How measured", "Review"],
      pb.success_metrics.map((m) => [m.metric, m.current_value, m.target_value, m.measurement_method, m.review_frequency])));
  }

  if (pb.risks_and_mitigations?.length) {
    lines.push("## Risks & mitigations");
    lines.push("");
    lines.push(table(["Risk", "Probability", "Mitigation", "Contingency"],
      pb.risks_and_mitigations.map((r) => [r.risk, r.probability, r.mitigation, r.contingency])));
  }

  const res = pb.resource_requirements;
  if (res) {
    lines.push("## Resources");
    lines.push("");
    if (res.team?.length) lines.push(`- **Team:** ${res.team.join(", ")}`);
    if (res.technology?.length) lines.push(`- **Technology:** ${res.technology.join(", ")}`);
    if (res.budget_breakdown) {
      lines.push(`- **Budget:** ${Object.entries(res.budget_breakdown).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    }
    lines.push("");
  }

  const sim = d.simulation;
  if (sim && sim.simulated !== false && sim.interventions?.length) {
    lines.push("## Monte Carlo simulation");
    lines.push("");
    lines.push(`${sim.iterations.toLocaleString()} draws per intervention. Combined expected lift **+${sim.expected_lift}%** (5–95%: ${sim.confidence_low}% – ${sim.confidence_high}%).`);
    lines.push("");
    lines.push(table(["Intervention", "p10", "Mean", "p90", "Prior"],
      sim.interventions.map((i) => [i.name, `${i.p10}%`, `${i.mean}%`, `${i.p90}%`, i.lift_prior_anchor === "rag" ? `cited (${(i.lift_prior_citations ?? []).join(", ")})` : "model estimate"])));
  }

  const hyps = d.diagnosis?.merged_hypotheses ?? [];
  if (hyps.length) {
    lines.push("## Diagnosed root causes");
    lines.push("");
    hyps.forEach((h, i) => lines.push(`${i + 1}. ${h.hypothesis} — confidence ${pct(h.confidence)}${h.citations?.length ? ` _(cites: ${h.citations.join(", ")})_` : ""}`));
    lines.push("");
  }

  const m = d.metrics;
  if (m?.llm_calls != null) {
    lines.push("## Run telemetry");
    lines.push("");
    lines.push(
      `${m.llm_calls} LLM calls (${m.llm_failures ?? 0} failed, ${m.fallbacks_used ?? 0} fallbacks) · ` +
        `${(m.total_tokens ?? 0).toLocaleString()} tokens · p50 ${m.latency_p50_s ?? "—"}s / p95 ${m.latency_p95_s ?? "—"}s per call` +
        (m.cost_usd != null ? ` · cost $${m.cost_usd.toFixed(4)}` : ""),
    );
    lines.push("");
  }

  if (pb.reasoning_trace) {
    lines.push("## Reasoning trace");
    lines.push("");
    lines.push(pb.reasoning_trace.split("\n").map((l) => `> ${l}`).join("\n"));
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(`_Generated by ${BRAND.name}. Every statistic comes from your data; lift estimates are simulated ranges, not guarantees._`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "playbook";
}

export function downloadText(filename: string, text: string, type = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
