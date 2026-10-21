"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/* Illustrative agent log — the same stages and event shapes a real run
   streams over SSE, played on a loop so the hero shows the system thinking.
   Labelled "preview" in the UI: these lines are not from a real dataset. */
const LINES: { tag: string; tone: string; text: string }[] = [
  { tag: "data", tone: "text-sky-300", text: "customers.csv · 12,480 rows · columns confirmed" },
  { tag: "stats", tone: "text-teal-300", text: "24 patterns tested → 9 are real, 15 filtered out" },
  { tag: "diagnosis", tone: "text-indigo-300", text: "3 analyses done · cause kept: 2 of 3 agree" },
  { tag: "patterns", tone: "text-indigo-300", text: "monthly users with <5 logins/wk leave 3× faster" },
  { tag: "review", tone: "text-fuchsia-300", text: "1 idea rejected · blanket discount too risky" },
  { tag: "simulate", tone: "text-emerald-300", text: "10,000 simulations · expected +6.8% retention" },
  { tag: "plan", tone: "text-amber-200", text: "3 problems · every step backed by evidence ✓" },
];

export function AgentConsole({ className }: { className?: string }) {
  const [shown, setShown] = useState<{ i: number; chars: number }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

    if (prefersReducedMotion()) {
      later(() => setShown(LINES.map((l, i) => ({ i, chars: l.text.length }))), 0);
      return () => timers.current.forEach(clearTimeout);
    }

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      setShown([]);
      let at = 600;
      LINES.forEach((line, i) => {
        later(() => setShown((s) => [...s, { i, chars: 0 }]), at);
        const typeMs = Math.max(500, line.text.length * 16);
        const steps = 18;
        for (let k = 1; k <= steps; k++) {
          later(() => setShown((s) => s.map((r) => (r.i === i ? { ...r, chars: Math.ceil((line.text.length * k) / steps) } : r))), at + (typeMs * k) / steps);
        }
        at += typeMs + 380;
      });
      later(run, at + 3200);
    };
    later(run, 0);
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  const typingIdx = shown.length ? shown[shown.length - 1] : null;
  const done = shown.length === LINES.length && typingIdx?.chars === LINES[LINES.length - 1].text.length;

  return (
    <div className={cn("w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d12]/95 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(129,140,248,0.08)]", className)}>
      <div className="flex items-center gap-2 border-b border-white/6 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
        <span className="ml-2 font-mono text-[11px] text-zinc-500">live analysis</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-300">
          <span className={cn("h-1.5 w-1.5 rounded-full bg-emerald-400", !done && "animate-pulse")} />
          {done ? "complete" : "live"}
        </span>
      </div>
      <div className="h-[212px] space-y-1.5 px-4 py-3.5 font-mono text-[11.5px] leading-[1.5]">
        {shown.map(({ i, chars }) => {
          const l = LINES[i];
          const typing = typingIdx?.i === i && chars < l.text.length;
          return (
            <div key={i} className="flex gap-2.5">
              <span className="w-[86px] flex-shrink-0 text-zinc-600">[{l.tag}]</span>
              <span className={cn(l.tone, typing && "caret")}>{l.text.slice(0, chars)}</span>
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/6 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
        example run · real analyses show each step live
      </div>
    </div>
  );
}
