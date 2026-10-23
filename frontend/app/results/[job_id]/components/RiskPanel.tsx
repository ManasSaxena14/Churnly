"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, Loader2, Search } from "lucide-react";
import { Histogram, Ring } from "@/components/charts";
import { CountUp } from "@/components/motion";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { getRisk, riskCsvUrl, type RiskCustomer, type RiskReport } from "@/lib/api";
import { cn } from "@/lib/utils";
import { celebrate } from "@/lib/celebrate";

const TIER = {
  high: { label: "High", cls: "border-rose-400/30 bg-rose-400/10 text-rose-300", bar: "from-rose-500 to-orange-400", color: "#fb7185" },
  medium: { label: "Medium", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300", bar: "from-amber-500 to-yellow-300", color: "#fbbf24" },
  low: { label: "Low", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", bar: "from-emerald-500 to-teal-300", color: "#34d399" },
} as const;

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(0)}`);

/* Feature 2: every active customer scored — who's likely to leave in the next
   N periods, why (their personal drivers), and an export for the CS team. */
export function RiskPanel({ jobId }: { jobId: string }) {
  const [horizon, setHorizon] = useState(3);
  const [tier, setTier] = useState<"" | "high" | "medium" | "low">("");
  const [q, setQ] = useState("");
  const [report, setReport] = useState<RiskReport | null>(null);
  const [rows, setRows] = useState<RiskCustomer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const PAGE = 25;

  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => {
      if (stale) return;
      setLoading(true);
      getRisk(jobId, { horizon, tier: tier || undefined, q: q || undefined, limit: PAGE })
        .then((r) => { if (!stale) { setReport(r); setRows(r.customers); setError(null); } })
        .catch((e) => { if (!stale) setError(e.message); })
        .finally(() => { if (!stale) setLoading(false); });
    }, q ? 250 : 0); // debounce search typing
    return () => { stale = true; clearTimeout(t); };
  }, [jobId, horizon, tier, q]);

  const loadMore = () => {
    setMore(true);
    getRisk(jobId, { horizon, tier: tier || undefined, q: q || undefined, limit: PAGE, offset: rows.length })
      .then((r) => setRows((prev) => [...prev, ...r.customers]))
      .finally(() => setMore(false));
  };

  useGSAP(
    () => {
      if (!report || prefersReducedMotion()) return;
      gsap.from("[data-risk='row']", { x: -12, opacity: 0, stagger: 0.025, duration: 0.5, ease: "power3.out" });
      gsap.from("[data-risk='bar']", { scaleX: 0, transformOrigin: "left", duration: 0.9, ease: "expo.out", stagger: 0.02 });
    },
    { scope: root, dependencies: [report] },
  );

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] px-5 py-4 text-[13.5px] text-amber-100">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />{error}
      </div>
    );
  }
  if (!report) {
    return <div className="flex items-center gap-2 py-10 text-[13.5px] text-zinc-400"><Loader2 className="h-4 w-4 animate-spin text-brand" /> Scoring every active customer…</div>;
  }

  const s = report.summary;
  return (
    <div ref={root} className="flex flex-col gap-4">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.02] p-1 text-[12px]">
          {[1, 3, 6, 12].map((h) => (
            <button key={h} type="button" onClick={() => setHorizon(h)}
              className={cn("rounded-full px-3 py-1 transition-colors", horizon === h ? "bg-zinc-50 font-semibold text-ink" : "text-zinc-400 hover:text-zinc-100")}>
              {h === 1 ? "next period" : `next ${h}`}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-zinc-500">time units, same as &ldquo;{report.tenure_column}&rdquo;</span>
        <a href={riskCsvUrl(jobId, horizon)} onClick={() => celebrate("Risk list exporting", { description: `Customer scores for the ${horizon}-day horizon, as CSV.` })} className="ml-auto inline-flex h-9 items-center gap-2 rounded-full border border-white/12 px-4 text-[12.5px] text-zinc-200 transition-colors hover:border-brand/50 hover:text-zinc-50">
          <Download className="h-3.5 w-3.5" /> Download at-risk list (CSV)
        </a>
      </div>

      {/* summary */}
      <div className="grid gap-3 lg:grid-cols-[auto_1fr_1fr]">
        <div className="flex items-center gap-5 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
          <Ring parts={(["high", "medium", "low"] as const).map((t) => ({ label: t, value: s.tiers[t], color: TIER[t].color }))}
            center={<div><div className="font-display text-[22px] font-semibold tnum"><CountUp value={s.active_customers.toLocaleString()} /></div><div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">customers</div></div>} />
          <div className="flex flex-col gap-2 text-[12.5px]">
            {(["high", "medium", "low"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTier(tier === t ? "" : t)}
                className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors", tier === t ? "bg-white/[0.06]" : "hover:bg-white/[0.03]")}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: TIER[t].color }} />
                <span className="w-16 text-zinc-300">{TIER[t].label}</span>
                <b className="tnum text-zinc-50">{s.tiers[t].toLocaleString()}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Likely to leave</div>
            <div className="mt-2 font-display text-[30px] font-semibold text-rose-300 tnum"><CountUp value={Math.round(s.expected_churners).toLocaleString()} /></div>
            <div className="font-mono text-[11px] text-zinc-500">in the next {report.horizon} · average risk {(s.mean_risk * 100).toFixed(1)}%</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{s.value_column ? "Revenue at risk" : "Highest risk"}</div>
            <div className="mt-2 font-display text-[30px] font-semibold text-amber-200 tnum">
              {s.value_at_risk != null ? <CountUp value={money(s.value_at_risk)} /> : `${((rows[0]?.risk ?? 0) * 100).toFixed(0)}%`}
            </div>
            <div className="truncate font-mono text-[11px] text-zinc-500">{s.value_column ? `based on ${s.value_column}` : "single customer"}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">How risk is spread</div>
          <Histogram
            bins={s.histogram.map((b) => ({ label: `${Math.round(b.from * 100)}`, value: b.count }))}
            colorFor={(i) => (i >= 5 ? "linear-gradient(#fb7185,#f97316)" : i >= 2.5 ? "linear-gradient(#fbbf24,#facc15)" : "linear-gradient(#34d399,#2dd4bf)")}
          />
        </div>
      </div>

      {s.top_drivers.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">What the riskiest 10% of customers have in common</div>
          <div className="flex flex-wrap gap-2">
            {s.top_drivers.map((d) => (
              <span key={d.driver} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-zinc-200">
                {d.driver}<b className="tnum font-mono text-[11px] text-brand">{Math.round(d.share_of_top_decile * 100)}%</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* table */}
      <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.015]">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/6 px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer ID…"
              className="h-8 w-56 rounded-full border border-white/10 bg-transparent pl-8 pr-3 text-[12.5px] outline-none placeholder:text-zinc-600 focus:border-brand/50" />
          </div>
          {tier && <button type="button" onClick={() => setTier("")} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", TIER[tier].cls)}>{TIER[tier].label} only ×</button>}
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />}
          <span className="ml-auto font-mono text-[11px] text-zinc-500">{report.total.toLocaleString()} customers</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_70px_minmax(0,1.2fr)_minmax(0,2fr)] gap-4 border-b border-white/6 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 max-md:hidden">
          <span>Customer</span><span>Time as customer</span><span>Chance of leaving</span><span>Main reasons</span>
        </div>
        {rows.map((c) => (
          <div key={c.customer_id} data-risk="row" className="grid grid-cols-[minmax(0,1fr)_70px_minmax(0,1.2fr)_minmax(0,2fr)] items-center gap-4 border-b border-white/[0.04] px-4 py-2.5 text-[12.5px] transition-colors hover:bg-white/[0.025] max-md:grid-cols-[1fr_1fr]">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn("rounded-full border px-1.5 py-px font-mono text-[9.5px] uppercase", TIER[c.tier].cls)}>{c.tier[0]}</span>
              <span className="truncate font-mono text-zinc-200">{c.customer_id}</span>
            </div>
            <span className="tnum text-zinc-400 max-md:hidden">{c.tenure}</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                <div data-risk="bar" className={cn("h-full rounded-full bg-gradient-to-r", TIER[c.tier].bar)} style={{ width: `${Math.max(2, c.risk * 100)}%` }} />
              </div>
              <span className="tnum w-11 text-right font-mono text-zinc-100">{(c.risk * 100).toFixed(0)}%</span>
            </div>
            <div className="flex min-w-0 flex-wrap gap-1.5 max-md:col-span-2">
              {c.drivers.length ? c.drivers.map((d) => (
                <span key={d.feature} title={`${d.impact}× the average customer's risk`} className="truncate rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-zinc-300">{d.label}</span>
              )) : <span className="text-[11px] text-zinc-600">no single main reason</span>}
            </div>
          </div>
        ))}
        {rows.length < report.total && (
          <button type="button" onClick={loadMore} disabled={more}
            className="flex w-full items-center justify-center gap-2 py-3 text-[12.5px] text-zinc-400 transition-colors hover:bg-white/[0.02] hover:text-zinc-100">
            {more ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Load {Math.min(PAGE, report.total - rows.length)} more
          </button>
        )}
      </div>
      <p className="font-mono text-[10.5px] text-zinc-600">
        Each customer&apos;s chance of leaving within the chosen time, based on how long they&apos;ve already stayed. Reasons compare them with an average customer.
      </p>
    </div>
  );
}
