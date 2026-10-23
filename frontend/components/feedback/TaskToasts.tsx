"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { onCelebrate, type Celebration } from "@/lib/celebrate";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 3;
const PARTICLES = 10;

/* One success card: springs in, draws its check, bursts a ring of particles,
   shows a countdown bar, then slides away. */
function TaskToast({ c, onDone }: { c: Celebration; onDone: (id: number) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const color = c.tone === "success" ? "#5eead4" : "#818cf8";

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const tl = gsap.timeline();
      tl.from(root.current, { x: 60, opacity: 0, scale: 0.92, duration: 0.6, ease: "back.out(1.6)" })
        .from("[data-tt='ring']", { scale: 0, duration: 0.45, ease: "back.out(2.2)" }, 0.1)
        .from("[data-tt='text'] > *", { y: 8, opacity: 0, stagger: 0.06, duration: 0.4, ease: "power2.out" }, 0.2);
      gsap.utils.toArray<HTMLElement>("[data-tt='p']").forEach((p, i) => {
        const a = (i / PARTICLES) * Math.PI * 2;
        gsap.fromTo(p, { x: 0, y: 0, opacity: 1, scale: 1 },
          { x: Math.cos(a) * 26, y: Math.sin(a) * 26, opacity: 0, scale: 0.3, duration: 0.8, ease: "expo.out", delay: 0.35 });
      });
    },
    { scope: root },
  );

  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), c.durationMs);
    return () => clearTimeout(t);
  }, [c.durationMs]);

  useEffect(() => {
    if (!leaving) return;
    if (prefersReducedMotion() || !root.current) { onDone(c.id); return; }
    gsap.to(root.current, { x: 80, opacity: 0, duration: 0.35, ease: "power2.in", onComplete: () => onDone(c.id) });
  }, [leaving, c.id, onDone]);

  return (
    <div ref={root} role="status"
      className="pointer-events-auto relative w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f14]/97 p-3.5 pr-10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8),0_0_0_1px_rgba(94,234,212,0.06)]">
      <div className="flex items-start gap-3">
        <div className="relative grid h-9 w-9 flex-shrink-0 place-items-center">
          {Array.from({ length: PARTICLES }).map((_, i) => (
            <span key={i} data-tt="p" className="absolute h-1.5 w-1.5 rounded-full opacity-0" style={{ background: i % 2 ? color : "#e879f9" }} />
          ))}
          <span data-tt="ring" className="grid h-9 w-9 place-items-center rounded-full" style={{ background: `${color}22`, boxShadow: `0 0 0 1px ${color}55` }}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" className="task-check" />
            </svg>
          </span>
        </div>
        <div data-tt="text" className="min-w-0 pt-0.5">
          <div className="text-[13.5px] font-semibold text-zinc-50">{c.title}</div>
          {c.description && <div className="mt-0.5 text-[12.5px] leading-[1.5] text-zinc-400">{c.description}</div>}
        </div>
      </div>
      <button type="button" onClick={() => setLeaving(true)} aria-label="Dismiss"
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200">
        <X className="h-3.5 w-3.5" />
      </button>
      <span className="absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.04]">
        <span className={cn("task-countdown block h-full origin-left", c.tone === "success" ? "bg-gradient-to-r from-brand to-brand-2" : "bg-gradient-to-r from-brand-2 to-brand-3")}
          style={{ animationDuration: `${c.durationMs}ms` }} />
      </span>
    </div>
  );
}

export function TaskToasts() {
  const [items, setItems] = useState<Celebration[]>([]);
  useEffect(() => onCelebrate((c) => setItems((xs) => [...xs, c].slice(-MAX_VISIBLE))), []);
  const done = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-4 z-[120] flex flex-col items-end gap-2.5 sm:right-6">
      {items.map((c) => <TaskToast key={c.id} c={c} onDone={done} />)}
    </div>
  );
}
