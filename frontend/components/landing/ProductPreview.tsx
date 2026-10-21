"use client";

import { useRef } from "react";
import { SplitReveal } from "@/components/motion";
import { LogoMark } from "@/components/brand/Logo";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

/* Product shot: a mock of the results dashboard that tilts up into place as
   you scroll, then builds itself — KM curve draws, bars grow, causes and the
   30-60-90 columns land. Illustrative values, labelled as an example. */

// Kaplan-Meier-ish step curve (retention vs month), illustrative
const KM = [1, 0.93, 0.88, 0.85, 0.8, 0.78, 0.74, 0.72, 0.7, 0.66, 0.63, 0.61, 0.58, 0.56, 0.55, 0.53, 0.51, 0.5];
const W = 420, H = 150;
const kmY = (v: number) => ((1 - v) * H * 1.6 + 6).toFixed(1);
// step function: hold each value until the next month, then drop
const kmPath = KM.map((v, i) => (i === 0 ? `M0 ${kmY(v)}` : `H${((i / (KM.length - 1)) * W).toFixed(1)} V${kmY(v)}`)).join(" ");

const DRIVERS = [
  { k: "contract = Monthly", hr: 2.41, w: 0.92 },
  { k: "support tickets ≥ 4", hr: 1.86, w: 0.68 },
  { k: "logins / week < 2", hr: 1.63, w: 0.55 },
  { k: "plan = Basic", hr: 1.12, w: 0.18, ns: true },
];

const CAUSES = [
  { t: "No commitment moment before first renewal", c: 0.86, votes: "3/3" },
  { t: "Support friction in the first 30 days", c: 0.74, votes: "2/3" },
];

const PLAN = [
  { d: "30", items: ["Annual-plan offer at day 25", "Ticket triage SLA < 4h"] },
  { d: "60", items: ["Activation nudges for <2 logins", "Health score alerts"] },
  { d: "90", items: ["Win-back for lapsed monthlies", "Pricing test: quarterly"] },
];

export function ProductPreview() {
  const root = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      // tilt up into place
      gsap.fromTo(frame.current,
        { rotateX: 28, scale: 0.86, y: 80, opacity: 0.4 },
        { rotateX: 0, scale: 1, y: 0, opacity: 1, ease: "none",
          scrollTrigger: { trigger: root.current, start: "top 85%", end: "top 15%", scrub: 0.8 } });

      const tl = gsap.timeline({ scrollTrigger: { trigger: frame.current, start: "top 55%" } });
      const path = root.current!.querySelector<SVGPathElement>("[data-pp='km']")!;
      const len = path.getTotalLength();
      gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
      tl.to(path, { strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut" })
        .from("[data-pp='km-area']", { opacity: 0, duration: 1 }, 0.6)
        .from("[data-pp='stat']", { y: 14, opacity: 0, stagger: 0.08, duration: 0.6, ease: "power3.out" }, 0)
        .from("[data-pp='bar']", { scaleX: 0, transformOrigin: "left", stagger: 0.1, duration: 0.9, ease: "expo.out" }, 0.3)
        .from("[data-pp='cause']", { x: -20, opacity: 0, stagger: 0.12, duration: 0.7, ease: "power3.out" }, 0.8)
        .from("[data-pp='plan']", { y: 24, opacity: 0, stagger: 0.1, duration: 0.7, ease: "back.out(1.6)" }, 1.1)
        .from("[data-pp='badge']", { scale: 0, opacity: 0, duration: 0.5, ease: "back.out(2.5)" }, 1.6);
    },
    { scope: root },
  );

  return (
    <section ref={root} id="product" className="relative mx-auto max-w-7xl px-4 py-28 sm:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">The output</p>
        <SplitReveal className="mt-3 font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-zinc-50 sm:text-[48px]">
          From raw CSV to a <span data-keep className="inline-block font-serif font-normal italic text-brand-gradient">board-ready</span> playbook.
        </SplitReveal>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.75] text-zinc-400">
          Every stage streams to your screen as it finishes — survival curves first, then voted root
          causes, simulated lift, and a 30-60-90 plan you can export to PDF.
        </p>
      </div>

      <div className="mt-16 [perspective:1600px]">
        <div ref={frame} className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#0a0b0f] shadow-[0_60px_140px_-40px_rgba(129,140,248,0.35),0_0_0_1px_rgba(255,255,255,0.03)]">
          {/* window chrome */}
          <div className="flex items-center gap-2 border-b border-white/6 bg-white/[0.02] px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <div className="mx-auto flex items-center gap-2 rounded-md bg-white/[0.04] px-3 py-1 font-mono text-[10.5px] text-zinc-500">
              <LogoMark className="h-3.5 w-3.5" /> churnly / results / 7f3a…
            </div>
            <span data-pp="badge" className="rounded-full bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-300">grounded 100%</span>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-[1.25fr_1fr] md:p-5">
            {/* KM curve card */}
            <div className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-300">Survival · Kaplan-Meier</span>
                <span className="font-mono text-[10px] text-zinc-500">median 17 mo</span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-[150px] w-full overflow-visible">
                <defs>
                  <linearGradient id="pp-km" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(56,189,248,0.35)" />
                    <stop offset="100%" stopColor="rgba(56,189,248,0)" />
                  </linearGradient>
                  <linearGradient id="pp-km-line" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#5eead4" />
                    <stop offset="100%" stopColor="#818cf8" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={g * H} y2={g * H} stroke="rgba(255,255,255,0.05)" vectorEffect="non-scaling-stroke" />)}
                <path data-pp="km-area" d={`${kmPath} V${H} H0 Z`} fill="url(#pp-km)" />
                <path data-pp="km" d={kmPath} fill="none" stroke="url(#pp-km-line)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[["At risk", "1,284"], ["C-index", "0.74"], ["Tests kept", "9 / 24"]].map(([k, v]) => (
                  <div key={k} data-pp="stat" className="rounded-lg bg-white/[0.03] px-2.5 py-2">
                    <div className="text-[9.5px] uppercase tracking-[0.1em] text-zinc-500">{k}</div>
                    <div className="font-display text-[17px] font-semibold text-zinc-50">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* drivers + causes */}
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-300">Hazard drivers · BH-corrected</span>
                <div className="mt-3 flex flex-col gap-2.5">
                  {DRIVERS.map((d) => (
                    <div key={d.k}>
                      <div className="flex justify-between font-mono text-[10.5px]">
                        <span className={d.ns ? "text-zinc-600" : "text-zinc-300"}>{d.k}</span>
                        <span className={d.ns ? "text-zinc-600" : "text-zinc-400"}>HR {d.hr}{d.ns ? " · n.s." : ""}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-white/[0.04]">
                        <div data-pp="bar" className={`h-full rounded-full ${d.ns ? "bg-zinc-700" : "bg-gradient-to-r from-brand-2 to-brand-3"}`} style={{ width: `${d.w * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fuchsia-300">Root causes · voted</span>
                <div className="mt-2.5 flex flex-col gap-2">
                  {CAUSES.map((c, i) => (
                    <div key={c.t} data-pp="cause" className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-2.5 py-2">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-fuchsia-400/15 text-[10px] font-bold text-fuchsia-300">{i + 1}</span>
                      <span className="flex-1 text-[12px] text-zinc-200">{c.t}</span>
                      <span className="font-mono text-[10px] text-zinc-500">{c.votes} · {Math.round(c.c * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 30-60-90 */}
            <div className="grid grid-cols-3 gap-3 md:col-span-2">
              {PLAN.map((p) => (
                <div key={p.d} data-pp="plan" className="rounded-xl border border-white/6 bg-gradient-to-b from-emerald-400/[0.05] to-transparent p-3.5">
                  <div className="font-display text-[20px] font-semibold text-emerald-300">{p.d}<span className="ml-1 text-[11px] font-normal text-zinc-500">days</span></div>
                  <ul className="mt-2 space-y-1.5 text-[11.5px] text-zinc-300">
                    {p.items.map((it) => <li key={it} className="flex gap-1.5"><span className="text-emerald-400">›</span>{it}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-4 text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-600">example dashboard · illustrative values</p>
      </div>
    </section>
  );
}
