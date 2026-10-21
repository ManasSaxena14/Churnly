"use client";

import { useCallback } from "react";

/* Writes the pointer position into --mx / --my on the hovered element so the
   .spotlight / .spotlight-border CSS can follow the cursor. */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>() {
  return useCallback((e: React.PointerEvent<T>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, []);
}
