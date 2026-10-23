"use client";

/* Motion kit — small, reusable animation primitives used across every page.
   All of them no-op (render final state) under prefers-reduced-motion. */

import { useEffect, useRef, type ReactNode } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger, SplitText, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/* ── Smooth scroll (Lenis) synced with ScrollTrigger ─────────────────── */
export function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const lenis = new Lenis({ lerp: 0.14, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    // In-page anchor links glide instead of jumping.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href^='#']") as HTMLAnchorElement | null;
      if (!a) return;
      const target = document.querySelector(a.getAttribute("href")!);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -24 });
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);
  return null;
}

/* ── Top scroll-progress bar ─────────────────────────────────────────── */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    gsap.to(bar.current, {
      scaleX: 1, ease: "none",
      scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
    });
  });
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[2px]">
      <div ref={bar} className="h-full origin-left scale-x-0 bg-gradient-to-r from-brand via-brand-2 to-brand-3 shadow-[0_0_12px_rgba(129,140,248,0.8)]" />
    </div>
  );
}

/* ── Cursor glow: a soft light that trails the pointer (fine pointers only) ─ */
export function CursorGlow() {
  const dot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dot.current;
    if (!el || prefersReducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3.out" });
    const move = (e: PointerEvent) => {
      xTo(e.clientX);
      yTo(e.clientY);
      el.style.opacity = "1";
    };
    const leave = () => { el.style.opacity = "0"; };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, []);
  return (
    <div
      ref={dot}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[1] will-change-transform -ml-[220px] -mt-[220px] h-[440px] w-[440px] rounded-full bg-[radial-gradient(closest-side,rgba(129,140,248,0.10),rgba(94,234,212,0.05)_45%,transparent)] opacity-0 transition-opacity duration-500"
    />
  );
}

/* ── Reveal: fade/rise/blur children in, on mount or on scroll ────────── */
export function Reveal({
  children, className, as: Tag = "div", stagger = 0.08, y = 22, delay = 0, onScroll = false, blur = false, selector,
}: {
  children: ReactNode; className?: string; as?: "div" | "section" | "ul" | "ol";
  stagger?: number; y?: number; delay?: number; onScroll?: boolean; blur?: boolean;
  /** animate these descendants instead of direct children */
  selector?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion() || !root.current) return;
      const targets = selector ? root.current.querySelectorAll(selector) : root.current.children;
      if (!targets.length) return;
      gsap.from(targets, {
        y, opacity: 0, filter: blur ? "blur(8px)" : "none",
        duration: 0.9, ease: "expo.out", stagger, delay,
        clearProps: "filter,transform",
        scrollTrigger: onScroll ? { trigger: root.current, start: "top 85%" } : undefined,
      });
    },
    { scope: root },
  );
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={root as any} className={className}>
      {children}
    </Tag>
  );
}

/* ── Tilt: 3D tilt toward the pointer, with a moving glare ───────────── */
export function Tilt({ children, className, max = 8, glare = true }: { children: ReactNode; className?: string; max?: number; glare?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const shine = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node || prefersReducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const rx = gsap.quickTo(node, "rotationX", { duration: 0.5, ease: "power3.out" });
    const ry = gsap.quickTo(node, "rotationY", { duration: 0.5, ease: "power3.out" });
    gsap.set(node, { transformPerspective: 900, transformStyle: "preserve-3d" });
    const move = (e: PointerEvent) => {
      const r = node.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      ry(px * max * 2);
      rx(-py * max * 2);
      if (shine.current) {
        shine.current.style.opacity = "1";
        shine.current.style.background = `radial-gradient(500px circle at ${(px + 0.5) * 100}% ${(py + 0.5) * 100}%, rgba(255,255,255,0.09), transparent 40%)`;
      }
    };
    const leave = () => {
      rx(0); ry(0);
      if (shine.current) shine.current.style.opacity = "0";
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerleave", leave);
    return () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
    };
  }, [max]);
  return (
    <div ref={el} className={cn("relative will-change-transform", className)}>
      {children}
      {glare && <div ref={shine} className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300" />}
    </div>
  );
}

/* ── Magnetic: element leans toward the cursor ───────────────────────── */
export function Magnetic({ children, strength = 0.3, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * strength);
      yTo((e.clientY - (r.top + r.height / 2)) * strength);
    };
    const leave = () => { xTo(0); yTo(0); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [strength]);
  return <span ref={ref} className={cn("inline-block", className)}>{children}</span>;
}

/* ── CountUp: animates the first number inside a string ("+12.4%", "1,234") ─ */
export function CountUp({ value, className, duration = 1.4 }: { value: string | number; className?: string; duration?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const text = String(value);
  useGSAP(
    () => {
      const node = el.current;
      const m = text.match(/-?[\d,]*\.?\d+/);
      if (!node || !m || prefersReducedMotion()) return;
      const raw = m[0];
      const target = parseFloat(raw.replace(/,/g, ""));
      if (!Number.isFinite(target)) return;
      const decimals = (raw.split(".")[1] ?? "").length;
      const grouped = raw.includes(",");
      const [pre, post] = [text.slice(0, m.index), text.slice((m.index ?? 0) + raw.length)];
      const obj = { v: 0 };
      gsap.to(obj, {
        v: target, duration, ease: "expo.out",
        onUpdate: () => {
          const n = obj.v.toFixed(decimals);
          node.textContent = pre + (grouped ? Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals }) : n) + post;
        },
      });
    },
    { dependencies: [text] },
  );
  return <span ref={el} className={className}>{text}</span>;
}

/* ── SplitReveal: headline words rise through a mask when scrolled into view ─ */
export function SplitReveal({
  children, className, as: Tag = "h2", ignore,
}: { children: ReactNode; className?: string; as?: "h1" | "h2" | "h3" | "p"; ignore?: string }) {
  const el = useRef<HTMLHeadingElement>(null);
  useGSAP(
    () => {
      if (!el.current || prefersReducedMotion()) return;
      SplitText.create(el.current, {
        type: "words",
        mask: "words",
        autoSplit: true,
        // gradient / serif accent spans keep their styling as one unit
        ignore: ignore ?? "[data-keep]",
        onSplit(self) {
          return gsap.from([...self.words, ...el.current!.querySelectorAll("[data-keep]")], {
            yPercent: 110, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.045,
            scrollTrigger: { trigger: el.current, start: "top 85%" },
          });
        },
      });
    },
    { scope: el },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Tag ref={el as any} className={className}>{children}</Tag>;
}
