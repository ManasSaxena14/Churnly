"use client";

import { useRef } from "react";
import { FileText, FlaskConical, Lock, Users } from "lucide-react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

export type ResultTab = "report" | "risk" | "whatif";

const TABS: { id: ResultTab; label: string; icon: typeof FileText; needsRun?: boolean }[] = [
  { id: "report", label: "Report", icon: FileText },
  { id: "risk", label: "At-risk customers", icon: Users, needsRun: true },
  { id: "whatif", label: "What-if lab", icon: FlaskConical, needsRun: true },
];

/* Tab bar with a gliding gradient indicator under the active tab. */
export function ResultTabs({ tab, onChange, analyticsReady }: { tab: ResultTab; onChange: (t: ResultTab) => void; analyticsReady: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const btn = root.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
      if (!btn || !ind.current) return;
      const vars = { x: btn.offsetLeft, width: btn.offsetWidth };
      if (prefersReducedMotion()) gsap.set(ind.current, vars);
      else gsap.to(ind.current, { ...vars, duration: 0.55, ease: "expo.out" });
    },
    { scope: root, dependencies: [tab] },
  );

  return (
    <div ref={root} className="relative mb-7 flex gap-1 border-b border-white/8">
      {TABS.map(({ id, label, icon: Icon, needsRun }) => {
        const locked = needsRun && !analyticsReady;
        return (
          <button key={id} data-tab={id} type="button" disabled={locked} onClick={() => onChange(id)}
            title={locked ? "Available when the analysis finishes" : undefined}
            className={cn("relative inline-flex items-center gap-2 px-3.5 pb-3 pt-1 text-[13px] transition-colors",
              tab === id ? "text-zinc-50" : locked ? "cursor-not-allowed text-zinc-600" : "text-zinc-400 hover:text-zinc-100")}>
            {locked ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />} {label}
          </button>
        );
      })}
      <span ref={ind} className="absolute bottom-[-1px] left-0 h-[2px] rounded-full bg-gradient-to-r from-brand via-brand-2 to-brand-3 shadow-[0_0_12px_rgba(129,140,248,0.8)]" style={{ width: 0 }} />
    </div>
  );
}
