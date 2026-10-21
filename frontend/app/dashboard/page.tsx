"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Database, GitCompareArrows, Loader2, Plus, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Sparkline } from "@/components/charts";
import { CountUp, SplitReveal, Tilt } from "@/components/motion";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { getWorkspace, type RunSummary, type Workspace } from "@/lib/api";
import { cn } from "@/lib/utils";

const fmtDate = (s?: number) => (s ? new Date(s * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const pct = (n?: number | null, d = 0) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);

function StatusPill({ status }: { status: string }) {
  const tone = status === "complete" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
    : status === "error" ? "border-rose-400/30 bg-rose-400/10 text-rose-300" : "border-white/10 bg-white/[0.04] text-zinc-400";
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]", tone)}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />{status}
  </span>;
}

export default function DashboardPage() {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getWorkspace().then(setData).catch((e) => setError(e.message));
  }, []);

  const runs = useMemo(() => (data?.runs ?? []).filter((r) =>
    !query || `${r.dataset_name} ${r.playbook_title} ${r.top_cause} ${r.job_id}`.toLowerCase().includes(query.toLowerCase())), [data, query]);

  useGSAP(
    () => {
      if (!data || prefersReducedMotion()) return;
      gsap.from("[data-dash='kpi']", { y: 24, opacity: 0, stagger: 0.07, duration: 0.9, ease: "expo.out" });
      gsap.from("[data-dash='row']", { y: 16, opacity: 0, stagger: 0.05, duration: 0.7, ease: "power3.out", delay: 0.2 });
    },
    { scope: root, dependencies: [!!data] },
  );

  const toggle = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]);
  const k = data?.kpis;
  const kpis = [
    { icon: Database, label: "Analyses", value: k ? String(k.runs) : "—", sub: k ? `${k.completed} complete` : "" },
    { icon: Users, label: "Customers analyzed", value: k ? k.customers_analyzed.toLocaleString() : "—", sub: k ? `${k.high_risk_customers.toLocaleString()} high-risk` : "" },
    { icon: ShieldCheck, label: "Avg. groundedness", value: pct(k?.avg_grounded_rate), sub: "claims with all 3 receipts" },
    { icon: Sparkles, label: "Avg. simulated lift", value: k?.avg_expected_lift != null ? `+${k.avg_expected_lift.toFixed(1)}%` : "—", sub: "Monte Carlo, cited priors" },
  ];

  return (
    <AppShell>
      <div ref={root}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand">Workspace</p>
            <SplitReveal as="h1" className="mt-2 font-display text-[34px] font-semibold tracking-[-0.035em] sm:text-[44px]">
              Your retention <span data-keep className="inline-block font-serif font-normal italic text-brand-gradient">command center</span>
            </SplitReveal>
            <p className="mt-2 max-w-xl text-[14.5px] leading-[1.7] text-zinc-400">
              Every analysis you&apos;ve run — risk, causes, playbooks and cost — in one place. Pick two to see what changed.
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search runs…"
              className="h-10 w-64 rounded-full border border-white/10 bg-white/[0.03] pl-9 pr-4 text-[13.5px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-brand/50" />
          </div>
        </div>

        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map(({ icon: Icon, label, value, sub }) => (
            <Tilt key={label} max={5} className="rounded-2xl">
              <div data-dash="kpi" className="group relative h-full overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025] p-5">
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand/10 blur-2xl transition-opacity duration-500 group-hover:opacity-100 opacity-50" />
                <Icon className="h-4.5 w-4.5 text-brand" />
                <div className="mt-4 font-display text-[30px] font-semibold tracking-[-0.03em] tnum"><CountUp value={value} /></div>
                <div className="text-[13px] text-zinc-300">{label}</div>
                <div className="mt-0.5 font-mono text-[10.5px] text-zinc-500">{sub}</div>
              </div>
            </Tilt>
          ))}
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.015]">
          <div className="grid grid-cols-[28px_minmax(0,2.2fr)_1fr_1fr_1fr_140px_36px] items-center gap-4 border-b border-white/6 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 max-lg:hidden">
            <span /><span>Analysis</span><span>Churn prob.</span><span>High-risk</span><span>Grounded</span><span>Retention curve</span><span />
          </div>

          {!data && !error && (
            <div className="flex items-center gap-2 px-5 py-10 text-[13.5px] text-zinc-400"><Loader2 className="h-4 w-4 animate-spin text-brand" /> Loading your workspace…</div>
          )}
          {error && <div className="px-5 py-10 text-[13.5px] text-rose-300">{error}</div>}
          {data && runs.length === 0 && (
            <div className="flex flex-col items-center px-5 py-16 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.03]"><Plus className="h-6 w-6 text-brand" /></div>
              <p className="mt-4 font-display text-[18px] font-semibold">{query ? "No runs match that search" : "No analyses yet"}</p>
              <p className="mt-1 text-[13.5px] text-zinc-400">Upload a customer CSV and your first run will appear here.</p>
              <Link href="/form" className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-zinc-50 px-5 text-[13px] font-semibold text-ink">Start an analysis <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          )}

          {runs.map((r: RunSummary) => {
            const sel = selected.includes(r.job_id);
            return (
              <div key={r.job_id} data-dash="row"
                className={cn("group grid cursor-pointer grid-cols-[28px_minmax(0,2.2fr)_1fr_1fr_1fr_140px_36px] items-center gap-4 border-b border-white/5 px-5 py-4 transition-colors last:border-b-0 max-lg:grid-cols-[28px_1fr_36px]",
                  sel ? "bg-brand/[0.06]" : "hover:bg-white/[0.025]")}
                onClick={() => router.push(`/results/${r.job_id}`)}>
                <button type="button" aria-label="Select for comparison" disabled={!r.data_available}
                  onClick={(e) => { e.stopPropagation(); toggle(r.job_id); }}
                  className={cn("grid h-5 w-5 place-items-center rounded-md border transition-all", sel ? "border-brand bg-brand" : "border-zinc-600 hover:border-zinc-300", !r.data_available && "cursor-not-allowed opacity-30")}>
                  {sel && <Check className="h-3 w-3 text-ink" strokeWidth={3} />}
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="truncate text-[14px] font-medium text-zinc-100">{r.playbook_title || r.dataset_name || r.job_id.slice(0, 8)}</span>
                    <StatusPill status={r.status} />
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">
                    {r.dataset_name ?? "dataset"} · {fmtDate(r.saved_at)} · {r.analysis_depth ?? "quick"}{!r.data_available && " · data no longer on server"}
                  </div>
                  {r.top_cause && <div className="mt-1 truncate text-[12px] text-zinc-400">↳ {r.top_cause}</div>}
                </div>
                <span className="tnum text-[14px] text-zinc-200 max-lg:hidden">{r.churn_probability != null ? `${r.churn_probability.toFixed(1)}%` : "—"}</span>
                <span className="tnum text-[14px] text-amber-300 max-lg:hidden">{r.high_risk_customers?.toLocaleString() ?? "—"}<span className="text-zinc-600"> / {r.active_customers?.toLocaleString() ?? "—"}</span></span>
                <span className={cn("tnum text-[14px] max-lg:hidden", (r.grounded_rate ?? 0) >= 0.99 ? "text-emerald-300" : "text-zinc-300")}>{pct(r.grounded_rate)}</span>
                <Sparkline values={r.retention_curve.map(([, v]) => v)} className="max-lg:hidden" />
                <ArrowRight className="h-4 w-4 text-zinc-600 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-zinc-200" />
              </div>
            );
          })}
        </div>
      </div>

      {selected.length > 0 && (
        <CompareBar count={selected.length} onCompare={() => router.push(`/compare?a=${selected[0]}&b=${selected[1]}`)} />
      )}
    </AppShell>
  );
}

/* Slides up from the bottom when runs are selected. */
function CompareBar({ count, onCompare }: { count: number; onCompare: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.from(el.current, { y: 90, opacity: 0, duration: 0.7, ease: "expo.out" });
  });
  return (
    <div ref={el} className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="flex items-center gap-4 rounded-full border border-white/12 bg-[#0d0f14]/90 py-2 pl-5 pr-2 shadow-[0_20px_60px_-10px_rgba(129,140,248,0.4)] backdrop-blur-xl">
        <span className="text-[13px] text-zinc-300">{count === 2 ? "2 runs selected" : "Pick one more run to compare"}</span>
        <button type="button" disabled={count !== 2} onClick={onCompare}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand via-brand-2 to-brand-3 px-4 text-[13px] font-semibold text-ink transition-opacity disabled:opacity-40">
          <GitCompareArrows className="h-3.5 w-3.5" /> Compare
        </button>
      </div>
    </div>
  );
}
