"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* Defers mounting a heavy child (a WebGL scene) so it never competes with the
   page's first paint:
     when="idle"  — mount once the browser is idle after load (+ optional
                    `delay`), so below-the-fold scenes are built while the
                    visitor reads the hero, not mid-scroll
     when="near"  — mount when the box comes within `margin` of the viewport
   The child fades in once mounted. */
export function LazyMount({
  children, className, when = "idle", margin = "600px", delay = 0,
}: { children: React.ReactNode; className?: string; when?: "idle" | "near"; margin?: string; delay?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (mounted) return;
    if (when === "near") {
      const el = box.current;
      if (!el) return;
      const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setMounted(true); io.disconnect(); } }, { rootMargin: margin });
      io.observe(el);
      return () => io.disconnect();
    }
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    let idle = 0;
    const timer = window.setTimeout(() => { idle = ric(() => setMounted(true), { timeout: 800 }); }, delay);
    return () => { window.clearTimeout(timer); if (idle) cancel(idle); };
  }, [mounted, when, margin, delay]);

  // Fade in on the frame after mounting so the transition actually runs.
  useEffect(() => {
    if (!mounted) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [mounted]);

  return (
    <div ref={box} className={cn("transition-opacity duration-700 ease-out", shown ? "opacity-100" : "opacity-0", className)}>
      {mounted && children}
    </div>
  );
}
