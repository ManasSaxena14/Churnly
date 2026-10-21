"use client";

import { useRef } from "react";
import { Check, Loader2 } from "lucide-react";
import { NeuralScene } from "@/components/three/NeuralScene";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export type LaunchStage = "upload" | "queue" | "open";

const STEPS: { id: LaunchStage; label: string }[] = [
  { id: "upload", label: "Preparing your data" },
  { id: "queue", label: "Spinning up 21 agents" },
  { id: "open", label: "Opening the live analysis" },
];

/* Full-screen hand-off between "Run analysis" and the results page, so the
   wait for /upload + /analyze feels like the system booting, not a freeze.
   Stages reflect what the form is actually doing at that moment. */
export function LaunchOverlay({ stage }: { stage: LaunchStage }) {
  const root = useRef<HTMLDivElement>(null);
  const progress = useRef(0.6);
  const current = STEPS.findIndex((s) => s.id === stage);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.timeline()
        .from(root.current, { opacity: 0, duration: 0.4 })
        .from("[data-lo='card']", { y: 30, scale: 0.96, opacity: 0, duration: 0.8, ease: "expo.out" }, 0.1)
        .from("[data-lo='row']", { x: -14, opacity: 0, stagger: 0.08, duration: 0.5, ease: "power3.out" }, 0.35);
    },
    { scope: root },
  );

  return (
    <div ref={root} className="fixed inset-0 z-[90] grid place-items-center bg-ink/90 backdrop-blur-xl" role="status" aria-live="polite">
      <NeuralScene progressRef={progress} className="absolute inset-0 opacity-70" />
      <div data-lo="card" className="relative w-[min(92vw,420px)] rounded-3xl border border-white/10 bg-[#0b0d12]/85 p-7 shadow-[0_40px_120px_-30px_rgba(129,140,248,0.5)]">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-brand">{BRAND.name} · starting run</p>
        <h2 className="mt-2 font-display text-[24px] font-semibold tracking-[-0.03em] text-zinc-50">Launching your analysis</h2>
        <ol className="mt-6 flex flex-col gap-3.5">
          {STEPS.map((s, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={s.id} data-lo="row" className="flex items-center gap-3 text-[14px]">
                <span className={cn(
                  "grid h-6 w-6 place-items-center rounded-full border transition-all duration-500",
                  done ? "border-brand bg-brand text-ink" : active ? "border-brand/60 text-brand" : "border-white/10 text-zinc-600",
                )}>
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <span className={cn("transition-colors duration-500", done ? "text-zinc-400" : active ? "text-zinc-50" : "text-zinc-600")}>{s.label}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/[0.05]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand via-brand-2 to-brand-3 transition-[width] duration-700 ease-out"
            style={{ width: `${((current + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
