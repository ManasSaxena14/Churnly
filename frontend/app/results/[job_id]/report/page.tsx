"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, FileText, Printer } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";
import { API_BASE, fetchCachedDemo } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { downloadText, playbookToMarkdown, reportDataFromStages, slugify, type ReportData } from "../export";
import type { ProblemSolution, RunMetrics } from "../types";

/* Printable playbook. "Save as PDF" uses the browser's print engine, which
   gives real selectable text and proper page breaks (no canvas screenshots).
   Data comes from this tab's results snapshot, else the saved run on the
   backend, else the cached demo. */

type Events = { type: string; data?: unknown }[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function foldEvents(events: Events): { stages: Record<string, any>; metrics: RunMetrics | null } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stages: Record<string, any> = {};
  let metrics: RunMetrics | null = null;
  for (const e of events) {
    if (e.type === "run_metrics") metrics = e.data as RunMetrics;
    else stages[e.type] = e.data;
  }
  return { stages, metrics };
}

async function loadReport(jobId: string): Promise<ReportData | null> {
  try {
    const raw = sessionStorage.getItem(`job_${jobId}`);
    if (raw) {
      const snap = JSON.parse(raw);
      const data = reportDataFromStages(jobId, snap.stagesData ?? {}, snap.metrics ?? null);
      if (data) return data;
    }
  } catch { /* fall through */ }

  if (jobId === "demo") {
    const run = await fetchCachedDemo();
    if (!run) return null;
    const { stages, metrics } = foldEvents(run.events);
    return reportDataFromStages(jobId, stages, metrics);
  }

  try {
    const res = await fetch(`${API_BASE}/runs/${encodeURIComponent(jobId)}`);
    if (!res.ok) return null;
    const run = await res.json();
    const { stages, metrics } = foldEvents(run.events ?? []);
    return reportDataFromStages(jobId, stages, metrics ?? run.metrics ?? null);
  } catch {
    return null;
  }
}

const pct = (n?: number | null, d = 0) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-10 break-after-avoid border-b border-zinc-200 pb-2 font-display text-[19px] font-semibold tracking-[-0.02em] text-zinc-900">{children}</h2>;
}

function Table({ head, rows }: { head: string[]; rows: (React.ReactNode)[][] }) {
  if (!rows.length) return null;
  return (
    <table className="w-full border-collapse text-[11.5px]">
      <thead>
        <tr>{head.map((h) => <th key={h} className="border-b border-zinc-300 px-2 py-1.5 text-left font-semibold text-zinc-600">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="break-inside-avoid">
            {r.map((c, j) => <td key={j} className="border-b border-zinc-100 px-2 py-1.5 align-top text-zinc-800">{c ?? "—"}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Problem({ p }: { p: ProblemSolution }) {
  const ch = p.rationale_chain;
  const s = ch?.stat;
  return (
    <section className="mb-8 break-inside-avoid-page">
      <h3 className="font-display text-[16px] font-semibold text-zinc-900">
        <span className="mr-2 text-teal-700">{p.priority}.</span>{p.problem.title}
      </h3>
      <p className="mt-1.5 text-[12.5px] leading-[1.6] text-zinc-700">{p.problem.description}</p>
      <p className="mt-1 text-[11.5px] text-zinc-500">Segment: {p.problem.affected_segment} · Impact: {p.problem.current_impact}</p>

      <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 print:bg-white">
        <div className="text-[12.5px] font-semibold text-zinc-900">{p.solution.title} <span className="font-normal text-zinc-500">· {p.solution.framework_used}</span></div>
        <p className="mt-1 text-[12px] leading-[1.6] text-zinc-700">{p.solution.description}</p>
        <ul className="mt-1.5 list-disc pl-5 text-[12px] text-zinc-700">
          {(p.solution.key_actions ?? []).map((a) => <li key={a}>{a}</li>)}
        </ul>
        <p className="mt-2 text-[11.5px] text-zinc-600">
          Expected: <b className="text-zinc-900">+{p.retention_impact.estimated_lift_percent}%</b> retention · ~{p.retention_impact.estimated_users_retained} users · {p.retention_impact.estimated_revenue_impact} · confidence {pct(p.retention_impact.confidence)} · {p.retention_impact.time_to_impact}
        </p>
      </div>

      {ch && (
        <div className="mt-3">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Evidence chain</div>
          <Table
            head={["Link", "Detail"]}
            rows={[
              ["Statistic", s?.stat_id && s.stat_id !== "(none)"
                ? <><code className="text-[11px]">{s.stat_id}</code> · churn {pct(s.churn_rate, 1)} · n={s.size ?? "—"}{s.p_adj != null ? ` · p_adj ${s.p_adj.toFixed(4)}` : ""}{s.significant === false ? " · not significant" : ""}</>
                : "no matching statistical bucket"],
              ["Root cause", <>{ch.cause?.text ?? "—"}{ch.cause?.citations?.length ? <span className="text-zinc-500"> · cites {ch.cause.citations.join(", ")}</span> : null}</>],
              ["Tactic", ch.tactic?.recommendation ?? "—"],
              ["Simulated outcome", ch.simulated_outcome?.mean_lift != null
                ? `mean ${ch.simulated_outcome.mean_lift}% (p10 ${ch.simulated_outcome.percentile_10 ?? "—"}%, p90 ${ch.simulated_outcome.percentile_90 ?? "—"}%) · prior: ${ch.simulated_outcome.lift_prior_anchor ?? "—"}`
                : "not simulated"],
              ["Risk", `${ch.risk?.description ?? "—"}${ch.risk?.severity ? ` (${ch.risk.severity})` : ""}`],
              ["Mitigation", ch.mitigation?.description ?? "—"],
            ]}
          />
        </div>
      )}

      {p.implementation_steps?.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Implementation</div>
          <Table head={["#", "Action", "Owner", "Effort", "Timeline"]}
            rows={p.implementation_steps.map((st) => [st.step, st.action, st.owner, st.effort, st.timeline])} />
        </div>
      )}
    </section>
  );
}

export default function ReportPage() {
  const jobId = useParams().job_id as string;
  const autoPrint = useSearchParams().get("print") === "1";
  const [data, setData] = useState<ReportData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    loadReport(jobId).then((d) => {
      if (cancelled) return;
      setData(d);
      setState(d ? "ready" : "missing");
    });
    return () => { cancelled = true; };
  }, [jobId]);

  useEffect(() => {
    if (state !== "ready" || !autoPrint) return;
    // Let fonts settle so the PDF doesn't use fallback metrics.
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [state, autoPrint]);

  const exportMd = () => {
    if (!data) return;
    downloadText(`${slugify(data.playbook.title)}.md`, playbookToMarkdown(data));
  };

  if (state !== "ready" || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-100 px-4 text-zinc-700">
        <div className="max-w-md text-center">
          <p className="text-[15px]">{state === "loading" ? "Preparing report…" : "No finished playbook found for this run."}</p>
          {state === "missing" && (
            <Link href={`/results/${jobId}`} className="mt-4 inline-block text-[13px] text-teal-700 underline">Back to results</Link>
          )}
        </div>
      </div>
    );
  }

  const pb = data.playbook;
  const es = pb.executive_summary;
  const g = data.groundedness;
  const sig = data.diagnosis?.significance_summary;
  const rm = pb["30_60_90_roadmap"];
  const created = pb.created_date ? new Date(pb.created_date).toLocaleDateString() : new Date().toLocaleDateString();

  return (
    <div className="min-h-screen bg-zinc-200 text-zinc-900 print:bg-white">
      <div className="no-print sticky top-0 z-10 border-b border-zinc-300 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <Link href={`/results/${jobId}`} className="inline-flex items-center gap-1.5 text-[13px] text-zinc-600 hover:text-zinc-900">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to results
          </Link>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportMd} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 text-[13px] text-zinc-800 hover:border-zinc-500">
              <FileText className="h-3.5 w-3.5" /> Markdown
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-zinc-900 px-4 text-[13px] font-semibold text-white hover:bg-zinc-700">
              <Printer className="h-3.5 w-3.5" /> Save as PDF
            </button>
          </div>
        </div>
      </div>

      <article className="report-paper mx-auto my-8 max-w-[210mm] animate-rise-in bg-white opacity-0 print:animate-none print:opacity-100 px-[16mm] py-[14mm] shadow-[0_10px_40px_rgba(0,0,0,0.12)] print:my-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-zinc-900 pb-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-teal-700">Retention playbook</div>
            <h1 className="mt-1 font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.03em]">{pb.title}</h1>
            <div className="mt-1.5 text-[11.5px] text-zinc-500">
              {pb.company ? `${pb.company} · ` : ""}{created} · job <code>{jobId.split("-")[0]}</code>{data.demo ? " · cached demo run" : ""}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[13px] font-semibold"><LogoMark className="h-6 w-6" /> {BRAND.name}</div>
        </header>

        <H2>Executive summary</H2>
        <div className="grid grid-cols-5 gap-2 text-center">
          {[
            ["Problems", es.total_problems_identified],
            ["Projected lift", es.total_projected_retention_lift],
            ["Timeline", es.estimated_timeline],
            ["Budget", es.estimated_budget],
            ["Confidence", es.confidence_level],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-md border border-zinc-200 px-2 py-2">
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{k}</div>
              <div className="mt-1 text-[13px] font-semibold text-zinc-900">{v ?? "—"}</div>
            </div>
          ))}
        </div>

        {(g?.problems || sig?.tests_run) ? (
          <div className="mt-3 flex flex-col gap-1 text-[11.5px] text-zinc-600">
            {g?.problems ? (
              <p>
                <b className={cn((g.grounded_rate ?? 0) >= 0.99 ? "text-emerald-700" : "text-amber-700")}>Groundedness {pct(g.grounded_rate)}</b>{" "}
                of problems carry a significant statistic, a citation and a simulation (stat {pct(g.stat_rate)} · citation {pct(g.citation_rate)} · simulation {pct(g.simulation_rate)}).
              </p>
            ) : null}
            {sig?.tests_run ? (
              <p>
                <b className="text-zinc-800">Stats gate</b> {sig.tests_run} z-tests, {sig.significant_after_correction ?? 0} survive {sig.correction === "none" ? "raw p < 0.05" : "Benjamini-Hochberg correction"}
                {sig.removed_by_correction ? `; ${sig.removed_by_correction} discarded as likely noise` : ""}.
              </p>
            ) : null}
          </div>
        ) : null}

        <H2>Problems &amp; solutions</H2>
        {(pb.problems_and_solutions ?? []).map((p) => <Problem key={p.priority} p={p} />)}

        {rm && (
          <>
            <H2>30 / 60 / 90 roadmap</H2>
            <div className="grid grid-cols-3 gap-3">
              {([["Days 1–30", rm.phase_1_30_days], ["Days 31–60", rm.phase_2_60_days], ["Days 61–90", rm.phase_3_90_days]] as const).map(([label, ph]) => ph && (
                <div key={label} className="break-inside-avoid rounded-md border border-zinc-200 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-700">{label}</div>
                  <div className="mt-1 text-[12.5px] font-semibold">{ph.theme}</div>
                  <ul className="mt-1.5 list-disc pl-4 text-[11.5px] leading-[1.5] text-zinc-700">
                    {(ph.goals ?? []).map((x) => <li key={x}>{x}</li>)}
                  </ul>
                  <div className="mt-2 text-[11px] text-zinc-500">Expected lift: {ph.expected_lift}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {pb.success_metrics?.length ? (
          <>
            <H2>Success metrics</H2>
            <Table head={["Metric", "Current", "Target", "How measured", "Review"]}
              rows={pb.success_metrics.map((m) => [m.metric, m.current_value, m.target_value, m.measurement_method, m.review_frequency])} />
          </>
        ) : null}

        {pb.risks_and_mitigations?.length ? (
          <>
            <H2>Risks &amp; mitigations</H2>
            <Table head={["Risk", "Probability", "Mitigation", "Contingency"]}
              rows={pb.risks_and_mitigations.map((r) => [r.risk, r.probability, r.mitigation, r.contingency])} />
          </>
        ) : null}

        {data.simulation && data.simulation.simulated !== false && data.simulation.interventions?.length ? (
          <>
            <H2>Monte Carlo simulation</H2>
            <p className="mb-2 text-[11.5px] text-zinc-600">
              {data.simulation.iterations.toLocaleString()} draws per intervention · combined expected lift <b>+{data.simulation.expected_lift}%</b> (5–95%: {data.simulation.confidence_low}%–{data.simulation.confidence_high}%).
            </p>
            <Table head={["Intervention", "p10", "Mean", "p90", "Prior"]}
              rows={data.simulation.interventions.map((i) => [i.name, `${i.p10}%`, `${i.mean}%`, `${i.p90}%`, i.lift_prior_anchor === "rag" ? "cited" : "model estimate"])} />
          </>
        ) : null}

        {data.metrics?.llm_calls != null && (
          <p className="mt-10 border-t border-zinc-200 pt-3 text-[10.5px] text-zinc-500">
            Run telemetry: {data.metrics.llm_calls} LLM calls · {(data.metrics.total_tokens ?? 0).toLocaleString()} tokens · p50 {data.metrics.latency_p50_s ?? "—"}s per call
            {data.metrics.cost_usd != null ? ` · $${data.metrics.cost_usd.toFixed(4)}` : ""}.
          </p>
        )}
        <p className="mt-3 text-[10.5px] text-zinc-400">
          Generated by {BRAND.name}. Every statistic comes from your data; lift estimates are simulated ranges, not guarantees.
        </p>
      </article>

      <button type="button" onClick={exportMd} className="no-print fixed bottom-5 right-5 inline-flex h-11 items-center gap-2 rounded-full bg-teal-600 px-5 text-[13px] font-semibold text-white shadow-lg hover:bg-teal-500 sm:hidden">
        <Download className="h-4 w-4" /> .md
      </button>
    </div>
  );
}
