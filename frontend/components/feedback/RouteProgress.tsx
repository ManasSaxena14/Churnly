"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/* Top loading bar for page changes. Starts the instant an internal link is
   clicked (so slow routes never feel frozen), creeps toward 85%, and snaps
   to 100% + fades once the new route has rendered. Pure DOM/CSS transitions —
   no animation-frame loop running while idle. */
export function RouteProgress() {
  const bar = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const running = useRef(false);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const width = useRef(0);

  const set = (w: number, opacity = 1, ms = 300) => {
    const el = bar.current;
    if (!el) return;
    width.current = w;
    el.style.transition = `transform ${ms}ms cubic-bezier(.22,1,.36,1), opacity 300ms ease`;
    el.style.transform = `scaleX(${w})`;
    el.style.opacity = String(opacity);
  };

  useEffect(() => {
    const start = () => {
      if (running.current) return;
      running.current = true;
      set(0, 1, 0);
      requestAnimationFrame(() => set(0.25, 1, 400));
      trickle.current = setInterval(() => {
        if (width.current < 0.85) set(width.current + (0.85 - width.current) * 0.18, 1, 500);
      }, 400);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || /^https?:/.test(href) && new URL(href).origin !== location.origin) return;
      const url = new URL(href, location.href);
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // New route rendered → finish.
  useEffect(() => {
    if (!running.current) return;
    if (trickle.current) clearInterval(trickle.current);
    set(1, 1, 250);
    const t = setTimeout(() => { set(1, 0, 250); running.current = false; }, 260);
    return () => clearTimeout(t);
  }, [path]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[110] h-[2.5px]">
      <div ref={bar} className="h-full origin-left bg-gradient-to-r from-brand via-brand-2 to-brand-3 opacity-0 shadow-[0_0_14px_rgba(129,140,248,0.9)]" style={{ transform: "scaleX(0)" }}>
        <span className="absolute right-0 top-1/2 h-3 w-16 -translate-y-1/2 rounded-full bg-brand-3/60 blur-[6px]" />
      </div>
    </div>
  );
}
