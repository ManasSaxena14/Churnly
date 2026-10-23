"use client";

import { useRef } from "react";
import { BadgeCheck, Dices, FlaskConical, Scale, ShieldAlert, Sigma } from "lucide-react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { useSpotlight } from "@/lib/useSpotlight";
import { SplitReveal, Tilt } from "@/components/motion";

const ITEMS = [
  {
    icon: Sigma, title: "Only real patterns count",
    body: "Every customer group is tested against everyone else, and anything that could be chance is filtered out. The AI is only allowed to explain patterns that pass.",
  },
  {
    icon: Scale, title: "Causes are double-checked",
    body: "In deep mode the diagnosis runs three separate times. A cause only makes it into your report if at least two of the three runs agree on it.",
  },
  {
    icon: ShieldAlert, title: "Every idea gets challenged",
    body: "A separate AI reviewer's only job is to find weak spots. If it flags a serious problem with an idea, that idea doesn't make the plan.",
  },
  {
    icon: Dices, title: "Impact numbers have sources",
    body: "Expected results come from simulations based on published case studies — not from an AI guessing a number. When no source exists, we say so.",
  },
  {
    icon: FlaskConical, title: "Tested against known answers",
    body: "We build test datasets where we already know the real causes of churn, then measure how often we find them. The numbers on this page come from those tests.",
  },
  {
    icon: BadgeCheck, title: "Every recommendation shows its proof",
    body: "Each problem in your plan links to the data behind it, a cited source and a simulated result. Anything missing a piece is clearly marked.",
  },
];

export function Guarantees() {
  const root = useRef<HTMLElement>(null);
  const onMove = useSpotlight<HTMLDivElement>();

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-g='card']", {
        y: 48, opacity: 0, duration: 0.9, ease: "power3.out", stagger: { each: 0.08, grid: "auto", from: "start" },
        scrollTrigger: { trigger: root.current, start: "top 75%" },
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="why" className="relative mx-auto max-w-site px-4 py-28 sm:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">Why it&apos;s different</p>
      <SplitReveal className="mt-3 max-w-3xl font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-zinc-50 sm:text-[48px]">
        No guesswork. <span data-keep className="inline-block font-serif font-normal italic text-brand-gradient">Every claim</span> is checked.
      </SplitReveal>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map(({ icon: Icon, title, body }) => (
          <Tilt key={title} max={6} className="rounded-3xl">
          <div
            data-g="card"
            onPointerMove={onMove}
            className="group spotlight spotlight-border h-full rounded-3xl bg-white/[0.02] p-7"
          >
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-brand/15 to-violet-500/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-[-8deg]">
              <Icon className="h-5 w-5 text-brand" strokeWidth={1.6} />
            </div>
            <h3 className="mt-6 font-display text-[19px] font-semibold tracking-[-0.02em] text-zinc-50">{title}</h3>
            <p className="mt-3 text-[14px] leading-[1.7] text-zinc-400">{body}</p>
          </div>
          </Tilt>
        ))}
      </div>
    </section>
  );
}
