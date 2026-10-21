"use client";

import Link from "next/link";
import { useId } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/* Churnly mark: three roots (your data, the stats, the agents) converge on
   one node, and a single stem rises to the insight — an agent graph that
   anchors your customers. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`hf-g-${id}`} x1="0" y1="1" x2="0.6" y2="0">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="55%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
        <radialGradient id={`hf-r-${id}`}>
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#e879f9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g fill="none" stroke={`url(#hf-g-${id})`} strokeWidth="1.8" strokeLinecap="round">
        <path d="M6.5 27 C 8 22, 12 21, 16 19.2" />
        <path d="M16 28.5 L16 19.2" />
        <path d="M25.5 27 C 24 22, 20 21, 16 19.2" />
        <path d="M16 19.2 C 16 14, 17.6 10.5, 16 6.2" />
      </g>
      <circle cx="6.5" cy="27" r="1.6" fill="#5eead4" />
      <circle cx="16" cy="28.5" r="1.6" fill="#5eead4" />
      <circle cx="25.5" cy="27" r="1.6" fill="#5eead4" />
      <circle cx="16" cy="19.2" r="3.3" fill={`url(#hf-g-${id})`} />
      <circle cx="16" cy="5.6" r="4.2" fill={`url(#hf-r-${id})`} opacity="0.55" />
      <circle cx="16" cy="5.6" r="2" fill="#f5d0fe" />
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

export function Logo({ href = "/", className, compact }: { href?: string; className?: string; compact?: boolean }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2", className)} aria-label={`${BRAND.name} home`}>
      <LogoMark className="transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:scale-110" />
      {!compact && <Wordmark className="text-[18px]" />}
    </Link>
  );
}
