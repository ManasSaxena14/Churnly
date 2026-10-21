"use client";

/* Chart kit — hand-built SVG, animated with GSAP, themed for the dark UI.
   No charting dependency: every chart draws itself in on mount and
   re-animates when its data changes. */

import { useId, useMemo, useRef, useState } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/* ── Multi-series line chart with hover crosshair ─────────────────── */
export interface Series { name: string; color: string; points: { x: number; y: number }[]; dashed?: boolean; area?: boolean }

export function LineChart({
  series, height = 220, yFormat = (v) => `${Math.round(v * 100)}%`, xLabel, yDomain = [0, 1], className,
}: {
  series: Series[]; height?: number; yFormat?: (v: number) => string; xLabel?: string;
  yDomain?: [number, number]; className?: string;
}) {
  const W = 640, H = height, PL = 40, PR = 12, PT = 12, PB = 26;
  const id = useId().replace(/:/g, "");
  const root = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const xMin = Math.min(...xs, 0), xMax = Math.max(...xs, 1);
  const sx = (x: number) => PL + ((x - xMin) / (xMax - xMin || 1)) * (W - PL - PR);
  const sy = (y: number) => PT + (1 - (y - yDomain[0]) / (yDomain[1] - yDomain[0] || 1)) * (H - PT - PB);
  const paths = series.map((s) => s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" "));
  const sig = JSON.stringify(series.map((s) => s.points.length + s.name + (s.points.at(-1)?.y ?? 0)));

  useGSAP(
    () => {
      const rect = root.current?.querySelector(`#clip-${id} rect`);
      if (!rect) return;
      if (prefersReducedMotion()) { gsap.set(rect, { attr: { width: W } }); return; }
      gsap.fromTo(rect, { attr: { width: 0 } }, { attr: { width: W }, duration: 1.4, ease: "power2.inOut" });
    },
    { scope: root, dependencies: [sig] },
  );

  const base = series[0]?.points ?? [];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    base.forEach((p, i) => { const d = Math.abs(sx(p.x) - x); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => yDomain[0] + f * (yDomain[1] - yDomain[0]));
  return (
    <div className={cn("relative", className)}>
      <svg ref={root} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs>
          <clipPath id={`clip-${id}`}><rect x="0" y="0" width="0" height={H} /></clipPath>
          {series.map((s, i) => (
            <linearGradient key={i} id={`fill-${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={sy(t)} y2={sy(t)} stroke="rgba(255,255,255,0.05)" />
            <text x={PL - 6} y={sy(t) + 3} textAnchor="end" className="fill-zinc-600 font-mono text-[9px]">{yFormat(t)}</text>
          </g>
        ))}
        {xLabel && <text x={W - PR} y={H - 6} textAnchor="end" className="fill-zinc-600 font-mono text-[9px]">{xLabel}</text>}
        <g clipPath={`url(#clip-${id})`}>
          {series.map((s, i) => s.area && (
            <path key={`a${i}`} d={`${paths[i]} L${sx(s.points.at(-1)!.x)},${sy(yDomain[0])} L${sx(s.points[0].x)},${sy(yDomain[0])} Z`} fill={`url(#fill-${id}-${i})`} />
          ))}
          {series.map((s, i) => (
            <path key={i} d={paths[i]} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" />
          ))}
        </g>
        {hover !== null && base[hover] && (
          <g>
            <line x1={sx(base[hover].x)} x2={sx(base[hover].x)} y1={PT} y2={H - PB} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 3" />
            {series.map((s, i) => s.points[hover] && (
              <circle key={i} cx={sx(s.points[hover].x)} cy={sy(s.points[hover].y)} r="4" fill={s.color} stroke="#07080b" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-zinc-400">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-full" style={{ background: s.color }} /> {s.name}
            {hover !== null && s.points[hover] && <b className="tnum ml-1 font-medium text-zinc-100">{yFormat(s.points[hover].y)}</b>}
          </span>
        ))}
        {hover !== null && base[hover] && <span className="tnum ml-auto font-mono text-zinc-500">t = {base[hover].x}</span>}
      </div>
    </div>
  );
}

/* ── Sparkline ────────────────────────────────────────────────────── */
export function Sparkline({ values, color = "#5eead4", className }: { values: number[]; color?: string; className?: string }) {
  const W = 120, H = 32;
  if (values.length < 2) return <div className={cn("h-8 w-[120px]", className)} />;
  const min = Math.min(...values), max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 3 - ((v - min) / (max - min || 1)) * (H - 6)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("h-8 w-[120px]", className)} preserveAspectRatio="none">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={W} cy={pts.at(-1)!.split(",")[1]} r="2.5" fill={color} />
    </svg>
  );
}

/* ── Vertical bar histogram ───────────────────────────────────────── */
export function Histogram({ bins, colorFor, label }: { bins: { label: string; value: number }[]; colorFor: (i: number) => string; label?: (v: number) => string }) {
  const root = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...bins.map((b) => b.value));
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-hist='bar']", { scaleY: 0, transformOrigin: "bottom", duration: 0.9, ease: "expo.out", stagger: 0.04 });
    },
    { scope: root, dependencies: [bins.map((b) => b.value).join(",")] },
  );
  return (
    <div ref={root}>
      <div className="flex h-28 items-end gap-1.5">
        {bins.map((b, i) => (
          <div key={i} className="group relative flex flex-1 flex-col items-center justify-end">
            <span className="tnum pointer-events-none absolute -top-5 font-mono text-[10px] text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">{label ? label(b.value) : b.value}</span>
            <div data-hist="bar" className="w-full rounded-t-md" style={{ height: `${Math.max(2, (b.value / max) * 100)}%`, background: colorFor(i) }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {bins.map((b, i) => <span key={i} className="flex-1 text-center font-mono text-[9px] text-zinc-600">{b.label}</span>)}
      </div>
    </div>
  );
}

/* ── Ring (tier split) ────────────────────────────────────────────── */
export function Ring({ parts, size = 132, center }: { parts: { value: number; color: string; label: string }[]; size?: number; center?: React.ReactNode }) {
  const root = useRef<SVGSVGElement>(null);
  const total = Math.max(1, parts.reduce((a, p) => a + p.value, 0));
  const R = 52, C = 2 * Math.PI * R;
  const lens = parts.map((p) => (p.value / total) * C);
  const arcs = parts.map((p, i) => ({ ...p, len: lens[i], off: lens.slice(0, i).reduce((a, b) => a + b, 0) }));
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-ring='arc']", { strokeDasharray: `0 ${C}`, duration: 1.2, ease: "expo.out", stagger: 0.12 });
    },
    { scope: root, dependencies: [parts.map((p) => p.value).join(",")] },
  );
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg ref={root} viewBox="0 0 132 132" className="h-full w-full -rotate-90">
        <circle cx="66" cy="66" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
        {arcs.map((a) => a.len > 0 && (
          <circle key={a.label} data-ring="arc" cx="66" cy="66" r={R} fill="none" stroke={a.color} strokeWidth="12"
            strokeDasharray={`${Math.max(0, a.len - 2)} ${C}`} strokeDashoffset={-a.off} strokeLinecap="round" />
        ))}
      </svg>
      {center && <div className="absolute inset-0 grid place-items-center text-center">{center}</div>}
    </div>
  );
}

/* ── Diverging bars (drift, ±) ────────────────────────────────────── */
export function DivergingBars({ rows, unit = "pp" }: { rows: { label: string; value: number; strong?: boolean; note?: string }[]; unit?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const max = useMemo(() => Math.max(1, ...rows.map((r) => Math.abs(r.value))), [rows]);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-div='bar']", { scaleX: 0, duration: 0.9, ease: "expo.out", stagger: 0.05 });
    },
    { scope: root, dependencies: [rows.map((r) => r.value).join(",")] },
  );
  return (
    <div ref={root} className="flex flex-col gap-2">
      {rows.map((r) => {
        const w = (Math.abs(r.value) / max) * 50;
        const up = r.value > 0;
        return (
          <div key={r.label} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_64px] items-center gap-3 text-[12px]">
            <span className={cn("truncate font-mono", r.strong ? "text-zinc-100" : "text-zinc-500")} title={r.label}>{r.label}</span>
            <div className="relative h-2.5 rounded-full bg-white/[0.03]">
              <span className="absolute inset-y-[-3px] left-1/2 w-px bg-white/15" />
              <div data-div="bar" className={cn("absolute inset-y-0 rounded-full", up ? "left-1/2 origin-left" : "right-1/2 origin-right",
                r.strong ? (up ? "bg-gradient-to-r from-rose-500 to-rose-400" : "bg-gradient-to-l from-emerald-500 to-emerald-300") : "bg-zinc-600")}
                style={{ width: `${w}%` }} />
            </div>
            <span className={cn("tnum text-right font-mono", r.strong ? (up ? "text-rose-300" : "text-emerald-300") : "text-zinc-500")}>
              {r.value > 0 ? "+" : ""}{r.value.toFixed(1)}{unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}
