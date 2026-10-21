"use client";

import { useRef } from "react";
import Link from "next/link";
import { Play, Sparkles } from "lucide-react";
import { NeuralScene } from "@/components/three/NeuralScene";
import { gsap, ScrollTrigger, SplitText, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { BRAND } from "@/lib/brand";
import { EVAL_RESULTS } from "@/lib/evalResults";
import { useStartDemo } from "@/lib/useStartDemo";
import { AgentConsole } from "./AgentConsole";
import { PromptBar } from "./PromptBar";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const { start, loading } = useStartDemo();

  useGSAP(
    () => {
      // Scroll through the hero → the network converges and brightens.
      ScrollTrigger.create({
        trigger: root.current,
        start: "top top",
        end: "bottom top",
        scrub: true,
        onUpdate: (self) => { progress.current = self.progress; },
      });

      if (prefersReducedMotion()) return;

      // Aurora blobs drift independently forever.
      gsap.utils.toArray<HTMLElement>("[data-aurora]").forEach((el, i) => {
        gsap.to(el, {
          xPercent: gsap.utils.random(-18, 18),
          yPercent: gsap.utils.random(-14, 14),
          scale: gsap.utils.random(0.9, 1.25),
          duration: gsap.utils.random(9, 14),
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          delay: i * 0.7,
        });
      });

      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from("[data-hero='scene']", { opacity: 0, scale: 0.92, duration: 2.2, ease: "power2.out" }, 0)
        .from("[data-hero='badge']", { y: 14, opacity: 0, duration: 0.9 }, 0.2);

      SplitText.create("[data-hero='title']", {
        type: "words",
        mask: "words",
        autoSplit: true,
        // gradient words can't be split per element without losing the
        // gradient — they animate as a unit below
        ignore: "[data-hero='accent']",
        onSplit(self) {
          return gsap.from(self.words, {
            yPercent: 115, opacity: 0, rotate: 4, duration: 1.15, ease: "expo.out", stagger: 0.06, delay: 0.3,
          });
        },
      });

      tl.from("[data-hero='accent']", { yPercent: 40, opacity: 0, filter: "blur(12px)", duration: 1.4 }, 0.55)
        .from("[data-hero='sub']", { y: 16, opacity: 0, duration: 1 }, 0.8)
        .from("[data-hero='prompt']", { y: 22, opacity: 0, scale: 0.97, duration: 1.1 }, 0.95)
        .from("[data-hero='cta2'] > *", { y: 12, opacity: 0, stagger: 0.08, duration: 0.8 }, 1.1)
        .from("[data-hero='console']", { x: 40, opacity: 0, rotateY: -12, duration: 1.4 }, 1.0)
        .from("[data-hero='metric']", { y: 12, opacity: 0, stagger: 0.07, duration: 0.8 }, 1.25);

      // Parallax out as you scroll past.
      gsap.to("[data-hero='content']", {
        yPercent: -14, opacity: 0.2, ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
      });
      gsap.to("[data-hero='console']", {
        yPercent: -30, ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
      });
    },
    { scope: root },
  );

  const metrics = [
    { k: pct(EVAL_RESULTS.withBH.driverPrecision), v: "driver precision", sub: `vs ${pct(EVAL_RESULTS.rawP.driverPrecision)} uncorrected` },
    { k: pct(EVAL_RESULTS.withBH.falsePositiveRate), v: "false positives", sub: `vs ${pct(EVAL_RESULTS.rawP.falsePositiveRate)} uncorrected` },
    { k: "21", v: "agent graph nodes", sub: "2 parallel pods · 3 gates" },
    { k: "10k", v: "simulations per tactic", sub: "cited lift priors" },
  ];

  return (
    <section ref={root} className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      {/* light + grid */}
      <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
        <div data-aurora className="absolute -left-[10%] top-[-20%] h-[70vh] w-[60vw] rounded-full bg-[radial-gradient(closest-side,rgba(94,234,212,0.16),transparent)] blur-2xl" />
        <div data-aurora className="absolute right-[-10%] top-[5%] h-[75vh] w-[55vw] rounded-full bg-[radial-gradient(closest-side,rgba(129,140,248,0.2),transparent)] blur-2xl" />
        <div data-aurora className="absolute bottom-[-25%] left-[30%] h-[60vh] w-[50vw] rounded-full bg-[radial-gradient(closest-side,rgba(232,121,249,0.12),transparent)] blur-2xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_70%_60%_at_60%_40%,#000_20%,transparent_75%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-2/60 to-transparent" />
      </div>

      {/* the network */}
      <div data-hero="scene" className="absolute inset-0 -z-10 lg:left-[30%]">
        <NeuralScene progressRef={progress} className="h-full w-full" />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_70%_at_18%_50%,rgba(7,8,11,0.9)_0%,rgba(7,8,11,0.5)_50%,transparent_80%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-56 bg-gradient-to-b from-transparent to-ink" />

      <div data-hero="content" className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 px-4 pb-20 pt-32 sm:px-8 grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="min-w-0">
          <div
            data-hero="badge"
            className="border-beam mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-2 pr-3.5 text-[12px] text-zinc-300 backdrop-blur-md"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-3">
              <Sparkles className="h-3 w-3 text-ink" />
            </span>
            {BRAND.category}
            <span className="hidden text-zinc-500 sm:inline">· LangGraph · 21 nodes</span>
          </div>

          <h1
            data-hero="title"
            className="max-w-[16ch] font-display text-[42px] font-semibold leading-[1.0] tracking-[-0.045em] text-zinc-50 sm:text-[64px] lg:text-[80px]"
          >
            The AI analyst that{" "}
            <span data-hero="accent" className="text-shimmer inline-block pb-[0.08em] pr-[0.06em] font-serif text-[1.05em] font-normal italic tracking-[-0.02em]">
              proves
            </span>{" "}
            why customers churn.
          </h1>

          <p data-hero="sub" className="mt-6 max-w-[34rem] text-[16px] leading-[1.7] text-zinc-400 sm:text-[17px]">
            {BRAND.name} runs survival models and corrected significance tests before any LLM speaks —
            then 21 agents debate, simulate and cite their way to a 30-60-90 retention playbook.
          </p>

          <div data-hero="prompt" className="mt-9">
            <PromptBar />
          </div>

          <div data-hero="cta2" className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px]">
            <button
              type="button"
              onClick={start}
              disabled={loading}
              className="group inline-flex items-center gap-2 text-zinc-300 transition-colors hover:text-zinc-50 disabled:opacity-60"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full border border-white/12 bg-white/[0.04] transition-colors group-hover:border-brand/50">
                <Play className="h-3 w-3 fill-brand text-brand" />
              </span>
              {loading ? "Loading demo…" : "Watch a full run"}
            </button>
            <span className="text-zinc-700">/</span>
            <Link href="#evals" className="text-zinc-400 underline decoration-white/15 underline-offset-4 transition-colors hover:text-zinc-100">
              See the evals
            </Link>
          </div>

          <dl className="mt-14 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-5 border-t border-white/8 pt-6 sm:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.v} data-hero="metric">
                <dt className="font-display text-[26px] font-semibold tracking-[-0.03em] text-zinc-50 tnum">{m.k}</dt>
                <dd className="mt-0.5 text-[12.5px] text-zinc-400">{m.v}</dd>
                <dd className="font-mono text-[10.5px] text-zinc-600">{m.sub}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">evals: {EVAL_RESULTS.source}</p>
        </div>

        <div data-hero="console" className="hidden [perspective:1200px] lg:block">
          <div className="[transform:translate3d(24px,96px,0)_rotateY(-8deg)_rotateX(4deg)]">
            <AgentConsole />
          </div>
        </div>
      </div>
    </section>
  );
}
