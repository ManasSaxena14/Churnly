"use client";

import Link from "next/link";
import { useId } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/* Churnly mark: a ring (your customer base) shaped like a "C", with the gap
   where customers churn out. The glowing dot sits in that gap and closes the
   loop: the customer you kept. The inner core is the product they orbit.
   Geometry: r=11 arc from 5° to 295° (gap centred at -30°), dot at -30°. */
export function LogoMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`ch-ring-${id}`} x1="0.1" y1="0.9" x2="0.9" y2="0.1">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="55%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
        <radialGradient id={`ch-glow-${id}`}>
          <stop offset="0%" stopColor="#f5d0fe" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#e879f9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M26.96 16.96 A11 11 0 1 1 20.65 6.03" fill="none" stroke={`url(#ch-ring-${id})`} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3.4" fill={`url(#ch-ring-${id})`} opacity="0.9" />
      <g className={animated ? "origin-[16px_16px] animate-[logo-dot_3.2s_ease-in-out_infinite]" : undefined}>
        <circle cx="25.53" cy="10.5" r="5" fill={`url(#ch-glow-${id})`} />
        <circle cx="25.53" cy="10.5" r="2.6" fill="#fdf4ff" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-semibold tracking-[-0.035em] text-zinc-50", className)}>
      {BRAND.wordmark[0]}
      <span className="text-brand-gradient">{BRAND.wordmark[1]}</span>
    </span>
  );
}

export function Logo({ href = "/", className, compact, animated = true }: { href?: string; className?: string; compact?: boolean; animated?: boolean }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2", className)} aria-label={`${BRAND.name} home`}>
      <LogoMark animated={animated} className="transition-transform duration-700 ease-out group-hover:rotate-[-24deg] group-hover:scale-110" />
      {!compact && <Wordmark className="text-[18px]" />}
    </Link>
  );
}
