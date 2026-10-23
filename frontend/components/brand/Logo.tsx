"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/* Churnly mark — the magnet C. A horseshoe magnet bent into a "C" whose
   teal poles pull leaving customers back in. 32-unit grid: arc centre
   (16,16) r 8, stroke 5, opening ±45° around 0°; the outer 20° at each end
   are the poles. Butt caps keep the poles square, like a real magnet. */
export const MARK = {
  body: "M23.25 12.62A8 8 0 1 0 23.25 19.38",
  poles: "M21.66 10.34A8 8 0 0 1 23.25 12.62M23.25 19.38A8 8 0 0 1 21.66 21.66",
  stroke: 5,
};

export function LogoMark({ className, mono = false }: { className?: string; mono?: boolean }) {
  const glyph = mono ? "#09090b" : "#fafafa";
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7 flex-shrink-0", className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={mono ? "#fafafa" : "#14161c"} />
      {!mono && <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#fff" strokeOpacity="0.1" />}
      <path d={MARK.body} fill="none" stroke={glyph} strokeWidth={MARK.stroke} />
      <path d={MARK.poles} fill="none" stroke={mono ? glyph : "#2dd4bf"} strokeWidth={MARK.stroke} />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-semibold tracking-[-0.03em] text-zinc-50", className)}>
      {BRAND.name}
    </span>
  );
}

export function Logo({ href = "/", className, compact }: { href?: string; className?: string; compact?: boolean }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label={`${BRAND.name} home`}>
      <LogoMark className="transition-transform duration-300 group-hover:scale-105" />
      {!compact && <Wordmark className="text-[17.5px]" />}
    </Link>
  );
}
