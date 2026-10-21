"use client";

import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import type { RunMetrics } from "../types";
import { Chip, MicroLabel, Section } from "./primitives";

const fmtInt = (n?: number | null) => (n == null ? "—" : n.toLocaleString());
const fmtSec = (n?: number | null) => (n == null ? "—" : n < 10 ? `${n.toFixed(2)}s` : `${n.toFixed(1)}s`);
const fmtUsd = (n?: number | null) => (n == null ? "—" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/* Live cost / latency / reliability panel — fed by `run_metrics` SSE events
   that the graph wrapper emits after every node (backend app/observability.py). */
export function RunMetricsPanel({ metrics, complete }: { metrics: RunMetrics | null; complete: boolean }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!metrics || prefersReducedMotion()) return;
      gsap.fromTo("[data-m='bar']", { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "expo.out", stagger: 0.04 });
    },
    { scope: root, dependencies: [metrics?.llm_calls ?? 0] },
  );

  if (!metrics) return null;
  const models = metrics.by_model ?? [];
  const maxCalls = Math.max(1, ...models.map((m) => m.calls));
  const nodes = Object.entries(metrics.by_node ?? {})
    .filter(([, v]) => (v.wall_s ?? 0) > 0)
    .sort((a, b) => (b[1].wall_s ?? 0) - (a[1].wall_s ?? 0))
    .slice(0, 6);
  const maxWall = Math.max(1, ...nodes.map(([, v]) => v.wall_s ?? 0));

  const tiles = [
    { k: "LLM calls", v: fmtInt(metrics.llm_calls), sub: `${metrics.llm_failures ?? 0} failed · ${metrics.fallbacks_used ?? 0} fallbacks` },
    { k: "Tokens", v: fmtInt(metrics.total_tokens), sub: `${fmtInt(metrics.input_tokens)} in · ${fmtInt(metrics.output_tokens)} out` },
    { k: "Latency p50 / p95", v: `${fmtSec(metrics.latency_p50_s)}`, sub: `p95 ${fmtSec(metrics.latency_p95_s)} per call` },
    {
      k: "Cost", v: fmtUsd(metrics.cost_usd),
      sub: metrics.cost_usd == null ? "set LLM_PRICES_JSON to price models" : metrics.cost_partial ? "some models unpriced" : "list-price estimate",
    },
  ];

  return (
    <Section
      tone="teal"
      title="Run telemetry"
      meta={
        <span className="inline-flex items-center gap-2">
          {metrics.langfuse_enabled ? <Chip tone="teal" sm>Langfuse tracing on</Chip> : <Chip tone="zinc" sm>Langfuse off</Chip>}
          {complete || metrics.final ? "final" : "live"}
        </span>
      }
    >
      <div ref={root} className="grid gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-[10px] border border-white/6 bg-white/[0.02] px-3.5 pb-3.5 pt-3">
            <MicroLabel className="mb-1.5">{t.k}</MicroLabel>
            <div className="tnum text-[22px] font-bold tracking-[-0.025em] text-zinc-50">{t.v}</div>
            <div className="tnum mt-1 text-[11px] text-zinc-500">{t.sub}</div>
          </div>
        ))}

        {models.length > 0 && (
          <div className="rounded-[10px] border border-white/6 bg-white/[0.02] p-3.5 md:col-span-2">
            <MicroLabel className="mb-2.5">Calls by model</MicroLabel>
            <div className="flex flex-col gap-2">
              {models.map((m) => (
                <div key={`${m.provider}:${m.model}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                  <span className="truncate font-mono text-[11px] text-zinc-300">{m.provider} · {m.model}</span>
                  <span className="tnum text-[11px] text-zinc-500">{m.calls} · {fmtInt(m.input_tokens + m.output_tokens)} tok</span>
                  <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                    <div data-m="bar" className={cn("h-full origin-left rounded-full", m.provider === "groq" ? "bg-amber-400/80" : "bg-teal-400/80")}
                      style={{ width: `${(m.calls / maxCalls) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {nodes.length > 0 && (
          <div className="rounded-[10px] border border-white/6 bg-white/[0.02] p-3.5 md:col-span-2">
            <MicroLabel className="mb-2.5">Slowest nodes (wall time)</MicroLabel>
            <div className="flex flex-col gap-2">
              {nodes.map(([name, v]) => (
                <div key={name} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                  <span className="truncate font-mono text-[11px] text-zinc-300">{name}</span>
                  <span className="tnum text-[11px] text-zinc-500">{fmtSec(v.wall_s)}{v.calls ? ` · ${v.calls} calls` : ""}</span>
                  <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                    <div data-m="bar" className="h-full origin-left rounded-full bg-violet-400/80" style={{ width: `${((v.wall_s ?? 0) / maxWall) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
