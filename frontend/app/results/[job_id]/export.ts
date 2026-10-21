import { BRAND } from "@/lib/brand";
import { friendlyStat } from "@/lib/labels";
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
    out.push("**Why we recommend this**");
    out.push("");
    const s = chain.stat;
    if (s?.stat_id && s.stat_id !== "(none)") {
      out.push(
        `1. **The data** — ${friendlyStat(s.stat_id)}: ${pct(s.churn_rate, 1)} of ${s.size?.toLocaleString() ?? "—"} customers left` +
          (s.significant === false ? " _(this pattern could be chance)_" : " _(a real pattern, not chance)_"),
      );
    } else {
      out.push("1. **The data** — _not linked to a specific customer group_");
    }
    const c = chain.cause;
    out.push(`2. **The cause** — ${c?.text ?? "—"}${c?.citations?.length ? ` _(sources: ${c.citations.join(", ")})_` : ""}`);
    out.push(`3. **The action** — ${chain.tactic?.recommendation ?? "—"}`);
    const o = chain.simulated_outcome;
    out.push(
      o?.mean_lift != null
        ? `4. **Expected impact** — about ${o.mean_lift}% more customers kept (likely range ${o.percentile_10 ?? "—"}%–${o.percentile_90 ?? "—"}%)${o.lift_prior_anchor === "rag" ? ", based on published case studies" : ""}`
        : "4. **Expected impact** — _not estimated_",
    );
    out.push(`5. **The risk** — ${chain.risk?.description ?? "—"}${chain.risk?.severity ? ` _(${chain.risk.severity} risk)_` : ""}`);
    out.push(`6. **How to reduce it** — ${chain.mitigation?.description ?? "—"}`);
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
  lines.push(`_${BRAND.name} retention plan · analysis \`${d.jobId.slice(0, 8)}\` · created ${created}${d.demo ? " · demo" : ""}_`);
  lines.push("");
  lines.push("## Executive summary");
  lines.push("");
  lines.push(table(["Problems identified", "Projected lift", "Timeline", "Budget", "Confidence"], [[
    es.total_problems_identified, es.total_projected_retention_lift, es.estimated_timeline, es.estimated_budget, es.confidence_level,
  ]]));

  const g = d.groundedness;
  if (g?.problems) {
    lines.push(
      `**Evidence score:** ${pct(g.grounded_rate)} of problems are fully backed by data, a source and a simulation ` +
        `(data ${pct(g.stat_rate)} · source ${pct(g.citation_rate)} · simulation ${pct(g.simulation_rate)}).` +
        (g.unsupported.length ? ` Missing some evidence: ${g.unsupported.join("; ")}.` : ""),
    );
    lines.push("");
  }

  const sig = d.diagnosis?.significance_summary;
  if (sig?.tests_run) {
    lines.push(
      `**Data check:** ${sig.tests_run} customer patterns tested; ${sig.significant_after_correction ?? 0} are real` +
        (sig.removed_by_correction ? ` and ${sig.removed_by_correction} were filtered out as likely chance` : "") + ".",
    );
    lines.push("");
  }

  lines.push("## Problems and what to do");
  lines.push("");
  for (const p of pb.problems_and_solutions ?? []) {
    lines.push(problemMd(p));
    lines.push("");
  }

  const rm = pb["30_60_90_roadmap"];
  if (rm) {
    lines.push("## 30 / 60 / 90 day roadmap");
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
    lines.push("## How to measure success");
    lines.push("");
    lines.push(table(["Metric", "Current", "Target", "How measured", "Review"],
      pb.success_metrics.map((m) => [m.metric, m.current_value, m.target_value, m.measurement_method, m.review_frequency])));
  }

  if (pb.risks_and_mitigations?.length) {
    lines.push("## Risks and how to handle them");
    lines.push("");
    lines.push(table(["Risk", "Probability", "Mitigation", "Contingency"],
      pb.risks_and_mitigations.map((r) => [r.risk, r.probability, r.mitigation, r.contingency])));
  }

  const res = pb.resource_requirements;
  if (res) {
    lines.push("## What you'll need");
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
    lines.push("## Expected impact");
    lines.push("");
    lines.push(`Each idea was tested in ${sim.iterations.toLocaleString()} simulations. Overall, we expect about **+${sim.expected_lift}%** more customers kept (likely range ${sim.confidence_low}%–${sim.confidence_high}%).`);
    lines.push("");
    lines.push(table(["Idea", "Cautious", "Likely", "Best case", "Based on"],
      sim.interventions.map((i) => [i.name, `${i.p10}%`, `${i.mean}%`, `${i.p90}%`, i.lift_prior_anchor === "rag" ? "published case studies" : "AI estimate"])));
  }

  const hyps = d.diagnosis?.merged_hypotheses ?? [];
  if (hyps.length) {
    lines.push("## Why customers leave");
    lines.push("");
    hyps.forEach((h, i) => lines.push(`${i + 1}. ${h.hypothesis} — confidence ${pct(h.confidence)}${h.citations?.length ? ` _(sources: ${h.citations.join(", ")})_` : ""}`));
    lines.push("");
  }

  const m = d.metrics;
  if (m?.llm_calls != null) {
    lines.push("## Run details");
    lines.push("");
    lines.push(
      `${m.llm_calls} AI requests · ${(m.total_tokens ?? 0).toLocaleString()} tokens processed · ` +
        `typical response ${m.latency_p50_s ?? "—"}s` +
        (m.cost_usd != null ? ` · cost $${m.cost_usd.toFixed(4)}` : " · free tier"),
    );
    lines.push("");
  }

  if (pb.reasoning_trace) {
    lines.push("## How the AI reached this plan");
    lines.push("");
    lines.push(pb.reasoning_trace.split("\n").map((l) => `> ${l}`).join("\n"));
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(`_Generated by ${BRAND.name}. Every number comes from your data; impact estimates are simulated ranges, not guarantees._`);
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
