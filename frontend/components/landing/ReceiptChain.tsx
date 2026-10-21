"use client";

import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { SplitReveal } from "@/components/motion";

/* Illustrative rationale chain — the shape every playbook problem carries
   (see backend evidence_dossier). Values here are an example, labelled as such. */
const LINKS = [
  { k: "The data", tone: "text-sky-300 border-sky-400/30", v: "Monthly-contract customers", sub: "61% leave vs 23% of everyone else · not a fluke" },
  { k: "The cause", tone: "text-violet-300 border-violet-400/30", v: "No reason to commit before the first renewal", sub: "2 of 3 analyses agree · backed by a case study" },
  { k: "The action", tone: "text-teal-300 border-teal-400/30", v: "Offer an annual plan on day 25 to active monthly users", sub: "suggested by the growth strategist" },
  { k: "Expected impact", tone: "text-emerald-300 border-emerald-400/30", v: "+6.8% retention", sub: "likely range 3.1% – 10.4% · from 10,000 simulations" },
  { k: "The risk", tone: "text-amber-300 border-amber-400/30", v: "Could discount customers who'd buy annual anyway", sub: "flagged by the reviewer · offer only to active users" },
];

export function ReceiptChain() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: "top 65%", end: "bottom 70%", scrub: 0.8 },
      });
      tl.fromTo("[data-r='line']", { scaleY: 0 }, { scaleY: 1, ease: "none", duration: 1 }, 0);
      gsap.utils.toArray<HTMLElement>("[data-r='link']").forEach((el, i) => {
        tl.fromTo(el, { opacity: 0.12, x: -16 }, { opacity: 1, x: 0, duration: 0.25, ease: "power2.out" }, i * 0.18);
        tl.fromTo(el.querySelector("[data-r='dot']"), { scale: 0.4 }, { scale: 1, duration: 0.2 }, i * 0.18);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="receipts" className="mx-auto grid max-w-7xl gap-14 px-4 py-28 sm:px-8 lg:grid-cols-2">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">The evidence trail</p>
        <SplitReveal className="mt-3 font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-zinc-50 sm:text-[44px]">
          Click any recommendation. <span data-keep className="inline-block font-serif font-normal italic text-zinc-400">See why.</span>
        </SplitReveal>
        <p className="mt-6 max-w-md text-[15px] leading-[1.75] text-zinc-400">
          Every problem in your plan comes with its full story: the numbers that revealed it, the
          cause the analysts agreed on, the action to take, the impact we expect and the risk to
          watch. If any piece of that evidence is missing, the plan tells you.
        </p>
      </div>

      <div className="relative pl-8">
        <div className="absolute bottom-3 left-[11px] top-3 w-px bg-white/8" />
        <div data-r="line" className="absolute bottom-3 left-[11px] top-3 w-px origin-top bg-gradient-to-b from-sky-400 via-violet-400 to-amber-400" />
        <div className="flex flex-col gap-4">
          {LINKS.map((l) => (
            <div key={l.k} data-r="link" className="relative">
              <span data-r="dot" className="absolute -left-8 top-5 grid h-6 w-6 place-items-center rounded-full border border-white/15 bg-ink">
                <span className="h-2 w-2 rounded-full bg-brand" />
              </span>
              <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-5 py-4 backdrop-blur-sm">
                <span className={cn("inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]", l.tone)}>
                  {l.k}
                </span>
                <div className="mt-2.5 text-[15.5px] font-medium text-zinc-50">{l.v}</div>
                <div className="mt-1 font-mono text-[11.5px] text-zinc-500">{l.sub}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-600">example · illustrative numbers</p>
      </div>
    </section>
  );
}
