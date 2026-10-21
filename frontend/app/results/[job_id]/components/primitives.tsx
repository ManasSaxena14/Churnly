"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

/* Shared visual primitives for the results dashboard. Every accent maps to
   a stock Tailwind color (amber-500, violet-600, …) — the old CSS custom
   properties were exact palette values, so no bespoke tokens are needed. */

export type Tone = "amber" | "blue" | "purple" | "violet" | "teal" | "emerald" | "red" | "zinc";

export const toneText: Record<Tone, string> = {
  amber: "text-amber-500",
  blue: "text-blue-500",
  purple: "text-purple-500",
  violet: "text-violet-600",
  teal: "text-teal-500",
  emerald: "text-emerald-500",
  red: "text-red-500",
  zinc: "text-zinc-500",
};

/* ─── Card ─────────────────────────────────────────────────── */

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-[10px] border border-white/6 bg-white/[0.02]", className)}>
      {children}
    </div>
  );
}

/* ─── Section shell (fade/rise-in + tinted title rule) ─────── */

const sectionEdge: Record<Tone, string> = {
  amber: "border-amber-500",
  blue: "border-blue-500",
  purple: "border-purple-500",
  violet: "border-violet-600",
  teal: "border-teal-500",
  emerald: "border-emerald-500",
  red: "border-red-500",
  zinc: "border-zinc-500",
};

export function Section({
  tone, title, meta, visible = true, className, titleClassName, children, animate = true,
}: {
  tone: Tone; title: React.ReactNode; meta?: React.ReactNode;
  visible?: boolean; className?: string; titleClassName?: string;
  children?: React.ReactNode; animate?: boolean;
}) {
  const root = useRef<HTMLElement>(null);

  // Each section mounts when its SSE stage arrives: the accent rule grows,
  // the title slides in, then the content cascades up out of a slight blur.
  useGSAP(
    () => {
      if (!animate || prefersReducedMotion()) return;
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from("[data-sec='rule']", { scaleY: 0, transformOrigin: "top", duration: 0.6 })
        .from("[data-sec='title']", { x: -12, opacity: 0, duration: 0.7 }, 0.05)
        .from("[data-sec='meta']", { opacity: 0, duration: 0.6 }, 0.2);
      const body = root.current?.querySelector("[data-sec='body']");
      if (body?.children.length) {
        tl.from(body.children, {
          y: 18, opacity: 0, duration: 0.85, stagger: 0.07, clearProps: "transform",
        }, 0.12);
      }
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className={cn(
        "mb-9 transition-opacity duration-600",
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      <div className="mb-3.5 flex items-center gap-2.5">
        <span data-sec="rule" className={cn("h-[18px] w-[3px] flex-shrink-0 rounded-full border-l-[3px]", sectionEdge[tone])} />
        <h2 data-sec="title" className={cn("text-[15px] font-semibold leading-[1.15] tracking-[-0.01em]", titleClassName)}>
          {title}
        </h2>
        {meta != null && (
          <span data-sec="meta" className="tnum ml-auto text-[11px] uppercase tracking-[0.04em] text-zinc-500">{meta}</span>
        )}
      </div>
      <div data-sec="body">{children}</div>
    </section>
  );
}

/* ─── Micro label (10px uppercase) ─────────────────────────── */

export function MicroLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500", className)}>
      {children}
    </div>
  );
}

/* ─── Stat card ────────────────────────────────────────────── */

export function Stat({
  label, value, sub, tone, size = "md", className,
}: {
  label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode;
  tone?: Tone; size?: "sm" | "md" | "lg"; className?: string;
}) {
  const sizeCls = {
    sm: "text-xl leading-[1.2]",
    md: "text-[26px] leading-none",
    lg: "text-[32px] leading-none",
  }[size];
  return (
    <div className={cn("rounded-[10px] border border-white/6 bg-white/[0.02] px-3.5 pb-4 pt-3.5 transition-[border-color,transform,background] duration-300 hover:-translate-y-0.5 hover:border-white/12 hover:bg-white/[0.035]", className)}>
      <MicroLabel className="mb-2">{label}</MicroLabel>
      <div className={cn("tnum font-bold tracking-[-0.025em] text-zinc-50", sizeCls, tone && toneText[tone])}>
        {typeof value === "string" || typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
      {sub != null && <div className="tnum mt-1.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

/* ─── Chip ─────────────────────────────────────────────────── */

const chipTone: Record<Tone | "neutral", string> = {
  neutral: "border-white/12 text-zinc-400",
  amber: "border-amber-500/35 bg-amber-500/12 text-amber-500",
  blue: "border-blue-500/40 bg-blue-500/12 text-blue-500",
  purple: "border-purple-500/40 bg-purple-500/12 text-purple-500",
  violet: "border-violet-600/45 bg-violet-600/10 text-violet-300",
  teal: "border-teal-500/35 bg-teal-500/12 text-teal-500",
  emerald: "border-emerald-500/35 bg-emerald-500/12 text-emerald-500",
  red: "border-red-500/40 bg-red-500/8 text-red-500",
  zinc: "border-white/6 text-zinc-500",
};

export function Chip({
  tone = "neutral", sm, className, children,
}: {
  tone?: Tone | "neutral"; sm?: boolean; className?: string; children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium uppercase tracking-[0.06em]",
        sm ? "h-[18px] px-1.5 text-[9px]" : "h-[22px] px-2 text-[10px]",
        chipTone[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ─── Status dot (with optional glow ping) ─────────────────── */

const dotTone: Record<Tone, string> = {
  amber: "bg-amber-500 [--glow:rgba(245,158,11,0.5)]",
  blue: "bg-blue-500 [--glow:rgba(59,130,246,0.5)]",
  purple: "bg-purple-500 [--glow:rgba(168,85,247,0.5)]",
  violet: "bg-violet-600 [--glow:rgba(124,58,237,0.55)]",
  teal: "bg-teal-500 [--glow:rgba(20,184,166,0.5)]",
  emerald: "bg-emerald-500 [--glow:rgba(16,185,129,0.5)]",
  red: "bg-red-500 [--glow:rgba(239,68,68,0.5)]",
  zinc: "bg-zinc-500",
};

export function StatusDot({
  tone = "emerald", pulse, size = "sm", className,
}: {
  tone?: Tone; pulse?: boolean; size?: "sm" | "md"; className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block flex-shrink-0 rounded-full",
        size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
        dotTone[tone],
        pulse && "animate-glow-ping",
        className,
      )}
    />
  );
}

/* ─── Skeleton shimmer line ────────────────────────────────── */

export function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-3 animate-shimmer rounded bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.08),rgba(255,255,255,0.04))] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}

/* ─── Insight strip (amber left rule) ──────────────────────── */

export function Insight({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3.5 rounded-r-md border-l-2 border-amber-500 bg-amber-500/[0.03] px-3.5 py-2.5 text-[12.5px] leading-[1.55] text-zinc-300">
      {children}
    </div>
  );
}

/* ─── Status-bar button ────────────────────────────────────── */

export function StatusBtn({
  variant = "ghost", className, children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ghost" | "primary" | "danger" }) {
  return (
    <button
      className={cn(
        "whitespace-nowrap rounded-md border px-[11px] py-[5px] text-[11px] font-medium tracking-[0.02em] transition-all duration-150 disabled:cursor-not-allowed",
        variant === "ghost" && "border-white/6 bg-transparent text-zinc-400 hover:border-white/12 hover:bg-white/[0.02] hover:text-zinc-50",
        variant === "primary" && "border-zinc-50 bg-zinc-50 font-semibold text-black hover:bg-white",
        variant === "danger" && "border-rose-500/35 text-rose-300 hover:border-rose-500/60 hover:bg-rose-500/12 hover:text-rose-200 disabled:opacity-55",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ─── Solid action button ──────────────────────────────────── */

export function Btn({
  variant = "solid", className, children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-[13px] font-semibold tracking-[-0.005em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "solid" && "border-zinc-50 bg-zinc-50 text-black hover:bg-white",
        variant === "ghost" && "border-white/12 bg-transparent font-normal text-zinc-400 hover:border-white/20 hover:bg-white/[0.02] hover:text-zinc-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
