"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { Bot, Database, FlaskConical, Sigma, Swords, UserRound } from "lucide-react";
import { SplitReveal, Tilt } from "@/components/motion";

const STAGES = [
  {
    n: "01", tag: "DuckDB · pandas", title: "Ingest & audit",
    body: "Any churn CSV in. Columns auto-detected, quality scored on nulls, duplicates, size and label balance — bad data loops to a retry handler instead of poisoning the run.",
    chips: ["schema detection", "quality gate ≥ 0.5"], accent: "from-sky-400/30", icon: Database, tone: "text-sky-300",
  },
  {
    n: "02", tag: "no LLM", title: "Stats engine",
    body: "Kaplan-Meier survival, CoxPH hazard ratios and a two-proportion z-test on every segment — Benjamini-Hochberg corrected, so chance findings never reach a prompt.",
    chips: ["KM + CoxPH", "z-tests", "BH correction"], accent: "from-brand/40", icon: Sigma, tone: "text-teal-300",
  },
  {
    n: "03", tag: "Discovery pod", title: "Root causes that vote",
    body: "A forensic detective, a pattern matcher and a competitor researcher run in parallel. In deep mode the diagnosis runs three times; only causes two runs agree on survive.",
    chips: ["self-consistency 2/3", "HyDE RAG"], accent: "from-violet-400/40", icon: Bot, tone: "text-indigo-300",
  },
  {
    n: "04", tag: "human in the loop", title: "You, mid-run",
    body: "The graph pauses and asks two or three questions only you can answer — budget, what you already tried, who matters most — then routes your answers to strategy.",
    chips: ["LangGraph pause", "5-min timeout"], accent: "from-fuchsia-400/30", icon: UserRound, tone: "text-fuchsia-300",
  },
  {
    n: "05", tag: "Strategy pod", title: "Tactics, then a skeptic",
    body: "A unit economist, a JTBD specialist and a growth hacker propose tactics. An adversarial skeptic is paid to break them and can veto anything weak.",
    chips: ["ROI · JTBD · AARRR", "skeptic veto"], accent: "from-amber-400/30", icon: Swords, tone: "text-amber-300",
  },
  {
    n: "06", tag: "Monte Carlo · receipts", title: "Playbook with receipts",
    body: "10,000 simulations per tactic with lift priors pulled from cited case studies. Every playbook item links stat → cause → tactic → simulated outcome → risk.",
    chips: ["10k draws", "evidence dossier", "30-60-90"], accent: "from-emerald-400/35", icon: FlaskConical, tone: "text-emerald-300",
  },
];

export function PipelineScroll() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const mm = gsap.matchMedia();

      // Desktop: pin the section and scrub the cards sideways.
      mm.add("(min-width: 1024px)", () => {
        const el = track.current!;
        const distance = () => el.scrollWidth - window.innerWidth + 96;
        const tween = gsap.to(el, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
        gsap.to("[data-pipe='bar']", {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top top", end: () => `+=${distance()}`, scrub: true },
        });
        // Cards slide in as the section arrives; off-screen ones lift slightly
        // as the track carries them into view.
        gsap.from("[data-pipe='card']", {
          y: 60, opacity: 0, stagger: 0.08, duration: 1, ease: "expo.out",
          scrollTrigger: { trigger: root.current, start: "top 70%" },
        });
        gsap.utils.toArray<HTMLElement>("[data-pipe='card']").slice(3).forEach((card) => {
          gsap.from(card, {
            rotate: 2.5, yPercent: 6, ease: "none",
            scrollTrigger: { trigger: card, containerAnimation: tween, start: "left right", end: "left 60%", scrub: true },
          });
        });
      });

      // Mobile / tablet: plain vertical stack with reveal-on-scroll.
      mm.add("(max-width: 1023px)", () => {
        gsap.utils.toArray<HTMLElement>("[data-pipe='card']").forEach((card) => {
          gsap.from(card, {
            y: 40, opacity: 0, duration: 0.8, ease: "power3.out",
            scrollTrigger: { trigger: card, start: "top 88%" },
          });
        });
      });

      ScrollTrigger.refresh();
    },
    { scope: root },
  );

  return (
    <section ref={root} id="how" className="relative overflow-hidden py-24 lg:flex lg:h-screen lg:flex-col lg:justify-center lg:py-0">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">How it thinks</p>
            <SplitReveal className="mt-3 max-w-2xl font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-zinc-50 sm:text-[48px]">
              Math first. <span data-keep className="inline-block font-serif font-normal italic text-zinc-400">LLM second.</span>
            </SplitReveal>
          </div>
          <p className="max-w-sm text-[14px] leading-[1.7] text-zinc-400">
            Six stages, three quality gates, two parallel agent pods. Every stage streams to your
            screen the moment it finishes.
          </p>
        </div>
        <div className="mt-8 hidden h-px w-full overflow-hidden bg-white/8 lg:block">
          <div data-pipe="bar" className="h-full origin-left scale-x-0 bg-gradient-to-r from-brand via-violet-400 to-emerald-400" />
        </div>
      </div>

      <div
        ref={track}
        className="mx-auto mt-10 flex max-w-7xl flex-col gap-4 px-4 sm:px-8 lg:mx-0 lg:max-w-none lg:flex-row lg:gap-6 lg:pl-[max(2rem,calc((100vw-80rem)/2+2rem))] lg:pr-24"
      >
        {STAGES.map((s) => (
          <Tilt key={s.n} max={5} className="shrink-0 rounded-3xl">
          <article
            data-pipe="card"
            className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/8 bg-white/[0.02] p-7 transition-colors duration-500 hover:border-white/16 lg:h-[440px] lg:w-[400px]"
          >
            <div className={cn("pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br to-transparent opacity-60 blur-3xl transition-opacity duration-700 group-hover:opacity-100", s.accent)} />
            <span className="pointer-events-none absolute -bottom-10 -right-2 select-none font-display text-[180px] font-bold leading-none tracking-[-0.06em] text-white/[0.025] transition-colors duration-700 group-hover:text-white/[0.05]">{s.n}</span>
            <div className="flex items-center justify-between" data-pipe="reveal">
              <span className="relative grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-black/30">
                <span className="absolute inset-0 animate-ping rounded-2xl border border-white/10 opacity-0 group-hover:opacity-40" />
                <s.icon className={cn("h-5 w-5 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6", s.tone)} strokeWidth={1.6} />
              </span>
              <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">{s.tag}</span>
            </div>
            <h3 data-pipe="reveal" className="mt-auto pt-16 font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-zinc-50">
              {s.title}
            </h3>
            <p data-pipe="reveal" className="mt-4 text-[14px] leading-[1.7] text-zinc-400">{s.body}</p>
            <div data-pipe="reveal" className="mt-6 flex flex-wrap gap-1.5">
              {s.chips.map((c) => (
                <span key={c} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-zinc-300">{c}</span>
              ))}
            </div>
          </article>
          </Tilt>
        ))}
      </div>
    </section>
  );
}
