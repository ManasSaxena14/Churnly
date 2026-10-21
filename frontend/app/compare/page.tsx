"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, GitCompareArrows, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { DivergingBars, LineChart } from "@/components/charts";
import { CountUp, SplitReveal } from "@/components/motion";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { compareRuns, getWorkspace, type CompareResult, type RunSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

const label = (r?: { dataset_name?: string | null; job_id: string; saved_at?: number }) =>
  r ? `${r.dataset_name ?? r.job_id.slice(0, 8)}${r.saved_at ? ` · ${new Date(r.saved_at * 1000).toLocaleDateString()}` : ""}` : "";

function Picker() {
  const router = useRouter();
  const params = useSearchParams();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [a, setA] = useState(params.get("a") ?? "");
  const [b, setB] = useState(params.get("b") ?? "");

  useEffect(() => {
    getWorkspace().then((w) => setRuns(w.runs.filter((r) => r.data_available))).catch(() => setRuns([]));
  }, []);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {[["Before (A)", a, setA], ["After (B)", b, setB]].map(([lbl, val, set]) => (
        <label key={lbl as string} className="flex flex-col gap-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">{lbl as string}</span>
          <select value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)}
            className="h-10 min-w-[240px] rounded-xl border border-white/10 bg-ink px-3 text-[13.5px] text-zinc-100 outline-none focus:border-brand/50">
            <option value="">Choose an analysis…</option>
            {runs.map((r) => <option key={r.job_id} value={r.job_id}>{label(r)}</option>)}
          </select>
        </label>
      ))}
      <button type="button" disabled={!a || !b || a === b} onClick={() => router.push(`/compare?a=${a}&b=${b}`)}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-brand via-brand-2 to-brand-3 px-5 text-[13px] font-semibold text-ink disabled:opacity-40">
        <GitCompareArrows className="h-4 w-4" /> Compare
      </button>
    </div>
  );
}

function Report() {
  const params = useSearchParams();
  const a = params.get("a"), b = params.get("b");
  const [data, setData] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!a || !b) return;
    let stale = false;
    const t = setTimeout(() => { if (!stale) { setLoading(true); setError(null); } }, 0);
    compareRuns(a, b)
      .then((d) => { if (!stale) setData(d); })
      .catch((e) => { if (!stale) setError(e.message); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; clearTimeout(t); };
  }, [a, b]);

  useGSAP(
    () => {
      if (!data || prefersReducedMotion()) return;
      gsap.from("[data-cmp]", { y: 24, opacity: 0, stagger: 0.08, duration: 0.9, ease: "expo.out" });
    },
    { scope: root, dependencies: [data] },
  );

  if (!a || !b) return null;
  if (loading) return <div className="mt-10 flex items-center gap-2 text-[13.5px] text-zinc-400"><Loader2 className="h-4 w-4 animate-spin text-brand" /> Comparing every customer group…</div>;
  if (error) return <div className="mt-10 rounded-2xl border border-rose-500/25 bg-rose-500/[0.05] px-5 py-4 text-[13.5px] text-rose-200">{error}</div>;
  if (!data) return null;

  const up = data.overall.delta_pp > 0;
  // Bars show movement beyond the overall shift — the segments that need explaining.
  const seg = data.segments.slice(0, 12).map((s) => ({ label: s.label ?? s.stat_id, value: s.excess_pp, strong: s.significant && Math.abs(s.excess_pp) >= 3 }));

  return (
    <div ref={root} className="mt-10 flex flex-col gap-4">
      <div data-cmp className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className={cn("relative overflow-hidden rounded-2xl border p-5", up ? "border-rose-500/25 bg-rose-500/[0.04]" : "border-emerald-500/25 bg-emerald-500/[0.04]")}>
          <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-400">
            {up ? <TrendingUp className="h-3.5 w-3.5 text-rose-300" /> : <TrendingDown className="h-3.5 w-3.5 text-emerald-300" />} Overall churn
          </div>
          <div className="mt-3 flex items-baseline gap-3 font-display text-[34px] font-semibold tracking-[-0.03em]">
            <span className="text-zinc-400">{(data.overall.churn_a * 100).toFixed(1)}%</span>
            <ArrowRight className="h-5 w-5 text-zinc-600" />
            <span className={up ? "text-rose-300" : "text-emerald-300"}><CountUp value={`${(data.overall.churn_b * 100).toFixed(1)}%`} /></span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-zinc-500">{data.overall.delta_pp > 0 ? "+" : ""}{data.overall.delta_pp} percentage points · {data.overall.p_value != null && data.overall.p_value < 0.05 ? "a real change" : "could be chance"}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-400">Real changes</div>
          <div className="mt-3 font-display text-[34px] font-semibold tnum"><CountUp value={String(data.significant_changes)} /><span className="text-[16px] text-zinc-500"> / {data.tests_run}</span></div>
          <div className="mt-1 font-mono text-[11px] text-zinc-500">customer groups that truly changed (not chance)</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-5 text-[12.5px]">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-400">Analyses</div>
          <div className="mt-3 flex flex-col gap-2">
            <span><b className="mr-2 text-brand">A</b>{label(data.a)} · {data.a.rows.toLocaleString()} customers</span>
            <span><b className="mr-2 text-fuchsia-300">B</b>{label(data.b)} · {data.b.rows.toLocaleString()} customers</span>
          </div>
        </div>
      </div>

      <div data-cmp className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-brand">What changed</div>
        <ul className="flex flex-col gap-1.5 text-[14px] text-zinc-200">
          {data.headline.map((h) => <li key={h} className="flex gap-2"><span className="text-brand">›</span>{h}</li>)}
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div data-cmp className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
          <div className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-sky-300">Customers staying over time</div>
          <LineChart xLabel="tenure" series={[
            { name: "A", color: "#5eead4", points: data.km.a.map((p) => ({ x: p.t, y: p.s })), area: true },
            { name: "B", color: "#e879f9", points: data.km.b.map((p) => ({ x: p.t, y: p.s })) },
          ]} />
        </div>
        <div data-cmp className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.14em]">
            <span className="text-fuchsia-300">Groups that changed more than average</span>
            <span className="text-zinc-600">grey = no real change</span>
          </div>
          <DivergingBars rows={seg} />
        </div>
      </div>

      {data.drivers.length > 0 && (
        <div data-cmp className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
          <div className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-indigo-300">What raises churn · before → after</div>
          <div className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
            {data.drivers.map((d) => (
              <div key={d.feature} className="flex items-center gap-3 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate font-mono text-zinc-300">{d.feature}</span>
                <span className="tnum font-mono text-zinc-500">{d.hr_a}</span>
                <ArrowRight className="h-3 w-3 text-zinc-600" />
                <span className="tnum font-mono text-zinc-100">{d.hr_b}</span>
                <span className={cn("tnum w-16 text-right font-mono", Math.abs(d.change) < 0.1 ? "text-zinc-500" : d.hr_b > d.hr_a ? "text-rose-300" : "text-emerald-300")}>
                  {d.change > 0 ? "+" : ""}{(d.change * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <AppShell>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand">Compare analyses</p>
      <SplitReveal as="h1" className="mt-2 font-display text-[34px] font-semibold tracking-[-0.035em] sm:text-[44px]">
        What changed <span data-keep className="inline-block font-serif font-normal italic text-brand-gradient">between runs?</span>
      </SplitReveal>
      <p className="mb-8 mt-2 max-w-2xl text-[14.5px] leading-[1.7] text-zinc-400">
        We compare every customer group between the two datasets and filter out changes that could be chance — so you only see what really moved.
      </p>
      <Suspense fallback={null}>
        <Picker />
        <Report />
      </Suspense>
    </AppShell>
  );
}
