"use client";

/* Adaptive quality for the WebGL scenes.

   1. Pick a starting tier from cheap device hints (cores, memory, screen,
      data-saver), which sets particle counts and the pixel-ratio cap.
   2. A frame governor watches real frame times and steps the pixel ratio
      down when the scene can't hold ~50fps, so slow laptops stay smooth
      instead of stuttering. It never steps back up within a session —
      oscillating resolution looks worse than a slightly softer image. */

export type Tier = "low" | "mid" | "high";

export function detectTier(): Tier {
  if (typeof window === "undefined") return "mid";
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 8;
  const small = window.innerWidth < 768;
  if (nav.connection?.saveData || cores <= 4 || mem <= 4) return "low";
  if (small || cores <= 8) return "mid";
  return "high";
}

/** Multiplier for particle / node counts. */
export const DENSITY: Record<Tier, number> = { low: 0.45, mid: 0.75, high: 1 };

/** Max device-pixel-ratio to render at. Above ~1.5 the extra pixels are
 *  invisible on a soft, glowing scene but cost 2-4× the fill rate. */
const DPR_CAP: Record<Tier, number> = { low: 1, mid: 1.25, high: 1.5 };

export function initialPixelRatio(tier: Tier): number {
  return Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, DPR_CAP[tier]);
}

/** MSAA is only worth it at low pixel ratios. */
export const wantsAntialias = (pixelRatio: number) => pixelRatio < 1.3;

export class FrameGovernor {
  private samples: number[] = [];
  private cooldown = 0;
  constructor(public pixelRatio: number, private readonly floor = 0.75) {}

  /** Feed the last frame's duration (seconds). Returns a new pixel ratio
   *  when quality should drop, otherwise null. */
  sample(dt: number): number | null {
    if (dt <= 0 || dt > 0.25) return null; // tab switches / debugger pauses
    this.samples.push(dt);
    if (this.cooldown > 0) { this.cooldown--; return null; }
    if (this.samples.length < 90) return null;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples = [];
    if (avg > 1 / 50 && this.pixelRatio > this.floor) {
      this.pixelRatio = Math.max(this.floor, +(this.pixelRatio - 0.25).toFixed(2));
      this.cooldown = 60;
      return this.pixelRatio;
    }
    return null;
  }
}
