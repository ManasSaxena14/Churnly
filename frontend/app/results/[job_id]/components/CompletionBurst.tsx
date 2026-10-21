"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

const COLORS = ["#5eead4", "#818cf8", "#e879f9", "#a5f3fc", "#fde68a"];

/* One-shot celebration when a run finishes while you're watching it —
   not when a finished run is restored from cache or replayed after load. */
export function CompletionBurst({ complete }: { complete: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const wasComplete = useRef<boolean | null>(null);
  const [fire, setFire] = useState(0);

  useEffect(() => {
    if (wasComplete.current === null) {
      wasComplete.current = complete;
      return;
    }
    if (complete && !wasComplete.current && !prefersReducedMotion()) {
      const t = setTimeout(() => setFire((n) => n + 1), 0);
      wasComplete.current = true;
      return () => clearTimeout(t);
    }
    wasComplete.current = complete;
  }, [complete]);

  useEffect(() => {
    const el = root.current;
    if (!fire || !el) return;
    const dots: HTMLSpanElement[] = [];
    for (let i = 0; i < 70; i++) {
      const d = document.createElement("span");
      const size = 4 + Math.random() * 6;
      Object.assign(d.style, {
        position: "absolute", left: "50%", top: "28%", width: `${size}px`, height: `${size}px`,
        borderRadius: Math.random() > 0.5 ? "999px" : "2px",
        background: COLORS[i % COLORS.length], boxShadow: `0 0 12px ${COLORS[i % COLORS.length]}`,
      });
      el.appendChild(d);
      dots.push(d);
      const angle = Math.random() * Math.PI * 2;
      const dist = 140 + Math.random() * 360;
      gsap.timeline({ onComplete: () => d.remove() })
        .to(d, { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist * 0.7, rotate: gsap.utils.random(-360, 360), duration: 1.1 + Math.random() * 0.6, ease: "expo.out" })
        .to(d, { y: "+=160", opacity: 0, duration: 1.2, ease: "power1.in" }, "-=0.4");
    }
    return () => dots.forEach((d) => d.remove());
  }, [fire]);

  return <div ref={root} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[80] overflow-hidden" />;
}
