"use client";

import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { EVAL_RESULTS } from "@/lib/evalResults";
import { SplitReveal } from "@/components/motion";

type Row = { label: string; bh: number; raw: number; better: "lower" | "higher"; note: string };

const ROWS: Row[] = [
  { label: "False alarms", bh: EVAL_RESULTS.withBH.falsePositiveRate, raw: EVAL_RESULTS.rawP.falsePositiveRate, better: "lower", note: "causes flagged that weren't really there" },
  { label: "Datasets fooled by random noise", bh: EVAL_RESULTS.withBH.noiseFalseAlarmDatasets, raw: EVAL_RESULTS.rawP.noiseFalseAlarmDatasets, better: "lower", note: "columns that have nothing to do with churn" },
  { label: "Accuracy of flagged causes", bh: EVAL_RESULTS.withBH.driverPrecision, raw: EVAL_RESULTS.rawP.driverPrecision, better: "higher", note: "of everything flagged, how much was real" },
  { label: "Real causes found", bh: EVAL_RESULTS.withBH.driverRecall, raw: EVAL_RESULTS.rawP.driverRecall, better: "higher", note: "the trade-off: very weak causes are sometimes left out" },
];

const fmt = (n: number) => `${(n * 100).toFixed(1)}%`;

export function EvalShowcase() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const bars = gsap.utils.toArray<HTMLElement>("[data-eval='bar']");
      const nums = gsap.utils.toArray<HTMLElement>("[data-eval='num']");
      if (prefersReducedMotion()) {
        bars.forEach((b) => { b.style.transform = "scaleX(1)"; });
        return;
      }
      const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 70%" } });
      tl.from("[data-eval='row']", { y: 24, opacity: 0, stagger: 0.1, duration: 0.7, ease: "power3.out" })
        .to(bars, { scaleX: 1, duration: 1.3, ease: "expo.out", stagger: 0.06 }, 0.2);
      nums.forEach((el) => {
        const target = Number(el.dataset.value);
        const obj = { v: 0 };
        tl.to(obj, {
          v: target, duration: 1.3, ease: "expo.out",
          onUpdate: () => { el.textContent = fmt(obj.v); },
        }, 0.2);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="evals" className="relative border-y border-white/6 bg-[linear-gradient(180deg,rgba(94,234,212,0.03),transparent_40%)]">
      <div className="mx-auto grid max-w-7xl gap-14 px-4 py-28 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">Proven accuracy</p>
          <SplitReveal className="mt-3 font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-zinc-50 sm:text-[44px]">
            We hide the answer.{" "}
            <span data-keep className="inline-block font-serif font-normal italic text-zinc-400">Then check we find it.</span>
          </SplitReveal>
          <p className="mt-6 max-w-md text-[15px] leading-[1.75] text-zinc-400">
            We create test customer data where we know exactly why people leave — monthly
            contracts, support problems, low usage — mixed with columns that mean nothing. Then
            we measure what gets found, with and without our false-alarm filter.
          </p>
          <div className="mt-8 rounded-2xl border border-white/8 bg-black/40 p-4 font-mono text-[12px] leading-[1.8] text-zinc-400">
            <span className="text-zinc-600">$</span> make eval
            <br />
            <span className="text-zinc-600">→</span> {EVAL_RESULTS.datasets} test datasets · with vs without the filter
            <br />
            <span className="text-zinc-600">$</span> make eval-full <span className="text-zinc-600"># full AI run: causes found, evidence score</span>
          </div>
        </div>

        <div className="flex flex-col gap-7">
          <div className="flex items-center gap-5 text-[12px] text-zinc-400">
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> with Churnly&apos;s false-alarm filter</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-zinc-600" /> standard tests only</span>
          </div>
          {ROWS.map((r) => (
            <div key={r.label} data-eval="row">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-[15px] font-medium text-zinc-100">{r.label}</h3>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">
                  {r.better === "lower" ? "lower is better" : "higher is better"}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-zinc-500">{r.note}</p>
              <div className="mt-3 flex flex-col gap-2">
                {[
                  { v: r.bh, cls: "bg-gradient-to-r from-brand to-teal-300", text: "text-brand" },
                  { v: r.raw, cls: "bg-zinc-600", text: "text-zinc-400" },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                      <div
                        data-eval="bar"
                        className={`h-full origin-left scale-x-0 rounded-full ${b.cls}`}
                        style={{ width: `${Math.max(2, b.v * 100)}%` }}
                      />
                    </div>
                    <span data-eval="num" data-value={b.v} className={`w-14 text-right font-mono text-[13px] tnum ${b.text}`}>
                      {fmt(b.v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-600">source · {EVAL_RESULTS.source}</p>
        </div>
      </div>
    </section>
  );
}
