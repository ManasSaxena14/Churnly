"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { Bot, Database, FlaskConical, Sigma, Swords, UserRound } from "lucide-react";
import { SplitReveal, Tilt } from "@/components/motion";
import { STAGE_VISUALS } from "./StageVisuals";

const STAGES = [
  {
    n: "01", tag: "Data check", title: "Upload & check",
    body: "Drop in any customer CSV. We detect what each column means, you confirm it, and we score the data quality — missing values, duplicates, size — before anything else runs.",
    chips: ["auto column detection", "quality score"], accent: "from-sky-400/30", icon: Database, tone: "text-sky-300",
  },
  {
    n: "02", tag: "Pure statistics", title: "Find the real signals",
    body: "Before any AI is involved, proven statistical models measure how long customers stay and which groups leave faster. Patterns that could be chance are filtered out.",
    chips: ["survival analysis", "significance tests", "false-alarm filter"], accent: "from-brand/40", icon: Sigma, tone: "text-teal-300",
  },
  {
    n: "03", tag: "AI diagnosis", title: "Causes that agree",
    body: "Three AI analysts investigate in parallel — root causes, customer patterns and competitors. In deep mode the diagnosis runs three times, and only causes most runs agree on are kept.",
    chips: ["3 analysts", "majority vote", "research library"], accent: "from-violet-400/40", icon: Bot, tone: "text-indigo-300",
  },
  {
    n: "04", tag: "Your input", title: "A quick check-in",
    body: "The analysis pauses to ask you two or three questions only you can answer — budget, what you've already tried, who matters most — and uses your answers to shape the plan.",
    chips: ["2–3 questions", "optional"], accent: "from-fuchsia-400/30", icon: UserRound, tone: "text-fuchsia-300",
  },
  {
    n: "05", tag: "AI strategy", title: "Ideas, then a reviewer",
    body: "Three AI strategists — finance, customer needs and growth — suggest what to do. A separate reviewer challenges every idea and rejects the weak ones.",
    chips: ["3 strategists", "independent review"], accent: "from-amber-400/30", icon: Swords, tone: "text-amber-300",
  },
  {
    n: "06", tag: "Simulation · plan", title: "A plan you can trust",
    body: "Each idea is tested in 10,000 simulations using results from real case studies. Every step in your plan links back to the data, the reason, the expected impact and the risk.",
    chips: ["10,000 simulations", "evidence trail", "30-60-90 plan"], accent: "from-emerald-400/35", icon: FlaskConical, tone: "text-emerald-300",
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
              Statistics first. <span data-keep className="inline-block font-serif font-normal italic text-zinc-400">AI second.</span>
            </SplitReveal>
          </div>
          <p className="max-w-sm text-[14px] leading-[1.7] text-zinc-400">
            Six steps, three quality checks. You watch every result appear on screen the moment
            it&apos;s ready.
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
        {STAGES.map((s, i) => {
          const Visual = STAGE_VISUALS[i];
          return (
          <Tilt key={s.n} max={5} className="shrink-0 rounded-3xl">
          <article
            data-pipe="card"
            className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/8 bg-white/[0.02] p-6 transition-colors duration-500 hover:border-white/16 lg:h-[500px] lg:w-[400px]"
          >
            <div className={cn("pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br to-transparent opacity-60 blur-3xl transition-opacity duration-700 group-hover:opacity-100", s.accent)} />
            <div className="flex items-center justify-between" data-pipe="reveal">
              <span className="relative grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-black/30">
                <span className="absolute inset-0 animate-ping rounded-2xl border border-white/10 opacity-0 group-hover:opacity-40" />
                <s.icon className={cn("h-5 w-5 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6", s.tone)} strokeWidth={1.6} />
              </span>
              <span className="ml-3 mr-auto font-mono text-[12px] text-zinc-600">{s.n}</span>
              <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">{s.tag}</span>
            </div>
            <div data-pipe="reveal" className="mt-5 transition-transform duration-500 group-hover:-translate-y-0.5">
              <Visual />
            </div>
            <h3 data-pipe="reveal" className="mt-auto pt-6 font-display text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-zinc-50">
              {s.title}
            </h3>
            <p data-pipe="reveal" className="mt-3 text-[13.5px] leading-[1.65] text-zinc-400">{s.body}</p>
            <div data-pipe="reveal" className="mt-5 flex flex-wrap gap-1.5">
              {s.chips.map((c) => (
                <span key={c} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-zinc-300">{c}</span>
              ))}
            </div>
          </article>
          </Tilt>
          );
        })}
      </div>
    </section>
  );
}
