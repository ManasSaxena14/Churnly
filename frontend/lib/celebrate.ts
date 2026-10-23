"use client";

/* Tiny event bus for "task completed" moments. Call `celebrate()` from
   anywhere; <TaskToasts/> (mounted once in the root layout) animates it. */

export type CelebrateTone = "success" | "info";
export interface Celebration { id: number; title: string; description?: string; tone: CelebrateTone; durationMs: number }

type Listener = (c: Celebration) => void;
const listeners = new Set<Listener>();
let seq = 0;

export function celebrate(title: string, opts: { description?: string; tone?: CelebrateTone; durationMs?: number } = {}) {
  const c: Celebration = { id: ++seq, title, description: opts.description, tone: opts.tone ?? "success", durationMs: opts.durationMs ?? 4200 };
  listeners.forEach((l) => l(c));
}

export function onCelebrate(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
