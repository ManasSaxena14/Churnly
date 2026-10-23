"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FlaskConical, Loader2, Plus, Lightbulb, Trash2 } from "lucide-react";
import { LineChart } from "@/components/charts";
import { CountUp } from "@/components/motion";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { getLevers, runWhatIf, type Lever, type Levers, type WhatIfResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import { celebrate } from "@/lib/celebrate";

const SELECT = "h-9 rounded-lg border border-white/10 bg-ink px-2.5 text-[12.5px] text-zinc-100 outline-none focus:border-brand/50";

/* Preset scenarios derived from the model itself: move people off the
   riskiest level of each categorical, and cut the riskiest numeric drivers. */
function presets(lv: Levers): { label: string; levers: Lever[] }[] {
  const out: { label: string; levers: Lever[] }[] = [];
  for (const c of lv.categorical) {
    const sorted = [...c.levels].sort((a, b) => b.hazard_ratio - a.hazard_ratio);
    const worst = sorted[0], best = sorted[sorted.length - 1];
    if (worst && best && worst.value !== best.value && worst.share > 0 && worst.hazard_ratio > best.hazard_ratio * 1.05) {
      out.push({ label: `Move 25% of ${c.column} = ${worst.value} → ${best.value}`, levers: [{ kind: "shift", column: c.column, from: worst.value, to: best.value, share: 0.25 }] });
    }
  }
  for (const n of [...lv.numeric].sort((a, b) => b.hazard_ratio_per_unit - a.hazard_ratio_per_unit)) {
    if (n.hazard_ratio_per_unit > 1.01) out.push({ label: `Cut ${n.column} by 30%`, levers: [{ kind: "scale", column: n.column, factor: 0.7 }] });
  }
  return out.slice(0, 4);
}

export function WhatIfPanel({ jobId }: { jobId: string }) {
  const [lv, setLv] = useState<Levers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [levers, setLevers] = useState<Lever[]>([]);
  const [horizon, setHorizon] = useState(6);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [running, setRunning] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getLevers(jobId).then(setLv).catch((e) => setError(e.message));
  }, [jobId]);

  const suggestions = useMemo(() => (lv ? presets(lv) : []), [lv]);

  const run = async (ls: Lever[] = levers) => {
    if (!ls.length) return;
    setRunning(true);
    try {
      setResult(await runWhatIf(jobId, ls, horizon));
      setError(null);
      celebrate("Scenario simulated", { description: `${ls.length} lever${ls.length === 1 ? "" : "s"} over ${horizon} days — results below.` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  useGSAP(
    () => {
      if (!result || prefersReducedMotion()) return;
      gsap.from("[data-wi='out']", { y: 20, opacity: 0, stagger: 0.08, duration: 0.8, ease: "expo.out" });
    },
    { scope: root, dependencies: [result] },
  );

  if (error && !lv) {
    return <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] px-5 py-4 text-[13.5px] text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-300" />{error}</div>;
  }
  if (!lv) return <div className="flex items-center gap-2 py-10 text-[13.5px] text-zinc-400"><Loader2 className="h-4 w-4 animate-spin text-brand" /> Loading the levers your data supports…</div>;

  const addLever = (kind: "shift" | "scale" | "cap") => {
    if (kind === "shift" && lv.categorical[0]) {
      const c = lv.categorical[0];
      setLevers((l) => [...l, { kind, column: c.column, from: c.levels[0].value, to: c.levels.at(-1)!.value, share: 0.25 }]);
    } else if (lv.numeric[0]) {
      const n = lv.numeric[0];
      setLevers((l) => [...l, kind === "scale" ? { kind, column: n.column, factor: 0.7 } : { kind: "cap", column: n.column, max: Math.round(n.mean) }]);
    }
  };
  const update = (i: number, patch: Partial<Lever>) => setLevers((l) => l.map((x, j) => (j === i ? ({ ...x, ...patch } as Lever) : x)));

  const saved = result?.customers_saved ?? 0;
  return (
    <div ref={root} className="grid gap-4 xl:grid-cols-[380px_1fr]">
      {/* builder */}
      <div className="flex flex-col gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-brand"><FlaskConical className="h-3.5 w-3.5" /> Try a change</div>

        {suggestions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-zinc-500">Suggested for your data</span>
            {suggestions.map((sg) => (
              <button key={sg.label} type="button" onClick={() => { setLevers(sg.levers); run(sg.levers); }}
                className="group flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-left text-[12.5px] text-zinc-300 transition-all hover:-translate-y-px hover:border-brand/40 hover:text-zinc-50">
                <Lightbulb className="h-3.5 w-3.5 flex-shrink-0 text-brand transition-transform group-hover:rotate-12" />{sg.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {levers.map((l, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-white/8 bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">{l.kind === "shift" ? "Move customers" : l.kind === "scale" ? "Change a number" : "Set a maximum"}</span>
                <button type="button" onClick={() => setLevers((ls) => ls.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {l.kind === "shift" ? (() => {
                const col = lv.categorical.find((c) => c.column === l.column) ?? lv.categorical[0];
                return (
                  <>
                    <select className={SELECT} value={l.column} onChange={(e) => {
                      const c = lv.categorical.find((x) => x.column === e.target.value)!;
                      update(i, { column: c.column, from: c.levels[0].value, to: c.levels.at(-1)!.value } as Partial<Lever>);
                    }}>{lv.categorical.map((c) => <option key={c.column}>{c.column}</option>)}</select>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <select className={SELECT} value={l.from} onChange={(e) => update(i, { from: e.target.value } as Partial<Lever>)}>
                        {col.levels.map((v) => <option key={v.value} value={v.value}>{v.value} · {v.hazard_ratio}× risk</option>)}
                      </select>
                      <span className="text-zinc-500">→</span>
                      <select className={SELECT} value={l.to} onChange={(e) => update(i, { to: e.target.value } as Partial<Lever>)}>
                        {col.levels.map((v) => <option key={v.value} value={v.value}>{v.value}</option>)}
                      </select>
                    </div>
                    <label className="flex items-center gap-3 text-[12px] text-zinc-400">
                      <input type="range" min={0.05} max={1} step={0.05} value={l.share} onChange={(e) => update(i, { share: Number(e.target.value) } as Partial<Lever>)} className="flex-1 accent-[#5eead4]" />
                      <span className="tnum w-10 text-right text-zinc-100">{Math.round(l.share * 100)}%</span>
                    </label>
                  </>
                );
              })() : (
                <>
                  <select className={SELECT} value={l.column} onChange={(e) => update(i, { column: e.target.value } as Partial<Lever>)}>
                    {lv.numeric.map((n) => <option key={n.column}>{n.column}</option>)}
                  </select>
                  {l.kind === "scale" ? (
                    <label className="flex items-center gap-3 text-[12px] text-zinc-400">
                      <input type="range" min={0.1} max={2} step={0.05} value={l.factor} onChange={(e) => update(i, { factor: Number(e.target.value) } as Partial<Lever>)} className="flex-1 accent-[#5eead4]" />
                      <span className="tnum w-12 text-right text-zinc-100">×{l.factor.toFixed(2)}</span>
                    </label>
                  ) : (
                    <input type="number" value={l.max} onChange={(e) => update(i, { max: Number(e.target.value) } as Partial<Lever>)} className={SELECT} />
                  )}
                </>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {lv.categorical.length > 0 && <button type="button" onClick={() => addLever("shift")} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[11.5px] text-zinc-300 hover:border-white/25"><Plus className="h-3 w-3" /> Move customers</button>}
            {lv.numeric.length > 0 && <button type="button" onClick={() => addLever("scale")} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[11.5px] text-zinc-300 hover:border-white/25"><Plus className="h-3 w-3" /> Change a number</button>}
            {lv.numeric.length > 0 && <button type="button" onClick={() => addLever("cap")} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[11.5px] text-zinc-300 hover:border-white/25"><Plus className="h-3 w-3" /> Set a maximum</button>}
          </div>
        </div>

        <div className="mt-auto flex items-center gap-3">
          <select className={SELECT} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            {[3, 6, 12].map((h) => <option key={h} value={h}>over the next {h}</option>)}
          </select>
          <button type="button" disabled={!levers.length || running} onClick={() => run()}
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand via-brand-2 to-brand-3 text-[13px] font-semibold text-ink disabled:opacity-40">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} See the impact
          </button>
        </div>
        {error && <p className="text-[12px] text-rose-300">{error}</p>}
      </div>

      {/* results */}
      <div className="flex flex-col gap-4">
        {!result ? (
          <div className="grid h-full min-h-[320px] place-items-center rounded-2xl border border-dashed border-white/10 text-center">
            <div className="max-w-sm px-6">
              <FlaskConical className="mx-auto h-8 w-8 text-zinc-600" />
              <p className="mt-3 font-display text-[17px] font-semibold text-zinc-200">Test an idea before you try it</p>
              <p className="mt-1.5 text-[13px] leading-[1.6] text-zinc-500">Pick a suggestion or build your own change — we&apos;ll estimate how many customers it could keep.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div data-wi="out" className={cn("rounded-2xl border p-5", saved > 0 ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-white/8 bg-white/[0.02]")}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Customers kept</div>
                <div className={cn("mt-2 font-display text-[34px] font-semibold tnum", saved > 0 ? "text-emerald-300" : "text-zinc-200")}><CountUp value={saved.toFixed(1)} /></div>
                <div className="font-mono text-[11px] text-zinc-500">out of {result.baseline.expected_churners.toLocaleString()} likely to leave</div>
              </div>
              <div data-wi="out" className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Leaving in the next {result.horizon}</div>
                <div className="mt-2 flex items-baseline gap-2 font-display text-[28px] font-semibold tnum">
                  <span className="text-zinc-500">{(result.baseline.churn_rate * 100).toFixed(1)}%</span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-zinc-50"><CountUp value={`${(result.scenario.churn_rate * 100).toFixed(1)}%`} /></span>
                </div>
                <div className="font-mono text-[11px] text-zinc-500">{(result.relative_change * 100).toFixed(1)}% change</div>
              </div>
              <div data-wi="out" className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{result.value_column ? "Revenue kept" : "Customers analysed"}</div>
                <div className="mt-2 font-display text-[28px] font-semibold text-amber-200 tnum">
                  <CountUp value={result.value_saved != null ? `$${Math.round(result.value_saved).toLocaleString()}` : result.active_customers.toLocaleString()} />
                </div>
                <div className="truncate font-mono text-[11px] text-zinc-500">{result.value_column ? `from ${result.value_column}` : "scored"}</div>
              </div>
            </div>
            <div data-wi="out" className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-sky-300">Customers staying over time · today vs with this change</div>
              <LineChart xLabel="tenure" series={[
                { name: "Today", color: "#71717a", dashed: true, points: result.curve.map((p) => ({ x: p.t, y: p.baseline })) },
                { name: "With this change", color: "#5eead4", area: true, points: result.curve.map((p) => ({ x: p.t, y: p.scenario })) },
              ]} />
            </div>
            <div data-wi="out" className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-[12.5px] text-zinc-400">
              {result.applied.length ? (
                <ul className="flex flex-col gap-1">{result.applied.map((a) => <li key={a}>✓ {a}</li>)}</ul>
              ) : <p className="text-amber-200">No customers matched that change — try a different one.</p>}
              <p className="mt-2 text-[11.5px] text-zinc-500">{result.caveat}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
