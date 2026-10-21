"use client";

import { useRef } from "react";
import { BadgeCheck, Dices, FlaskConical, Scale, ShieldAlert, Sigma } from "lucide-react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { useSpotlight } from "@/lib/useSpotlight";
import { SplitReveal, Tilt } from "@/components/motion";

const ITEMS = [
  {
    icon: Sigma, title: "Every stat is z-test gated",
    body: "Each churn bucket is tested against the rest of the population and Benjamini-Hochberg corrected. Prompts refuse to build a cause on anything that isn't significant.",
  },
  {
    icon: Scale, title: "The diagnosis votes with itself",
    body: "Deep mode runs the root-cause prompt three times at different temperatures. A cause only ships if two of three independent runs agree.",
  },
  {
    icon: ShieldAlert, title: "A second AI is paid to disagree",
    body: "An adversarial skeptic scores every tactic. A high-severity flag is an automatic constraint violation at the critic gate — no override.",
  },
  {
    icon: Dices, title: "Lift numbers are cited, not invented",
    body: "Monte Carlo priors come from case-study ranges retrieved from the knowledge base, falling back to the model's own estimate only when nothing citable exists.",
  },
  {
    icon: FlaskConical, title: "Measured against planted truth",
    body: "An eval harness generates datasets with churn drivers we hide on purpose, then scores precision, recall and false alarms. The numbers on this page come from it.",
  },
  {
    icon: BadgeCheck, title: "Every claim has a receipt",
    body: "Each playbook problem carries a rationale chain and a groundedness check: real stat, real citation, real simulation — or it's flagged as unsupported.",
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
    <section ref={root} id="why" className="relative mx-auto max-w-7xl px-4 py-28 sm:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">Why it&apos;s different</p>
      <SplitReveal className="mt-3 max-w-3xl font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-zinc-50 sm:text-[48px]">
        Every LLM claim is <span data-keep className="inline-block font-serif font-normal italic text-brand-gradient">guilty</span> until proven significant.
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
