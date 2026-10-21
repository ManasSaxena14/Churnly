"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, BadgeCheck, Bot, ChevronDown, Database, FlaskConical, Gauge, Loader2, ShieldAlert, Sigma, BookOpen, X } from "lucide-react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { askCopilot, type CopilotEvent } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { friendlyStat } from "@/lib/labels";

type Step = { tool: string; args: Record<string, unknown>; summary?: string; table?: { columns: string[]; rows: unknown[][]; truncated: boolean } | null };
type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; steps: Step[]; text?: string; citations?: string[]; unverified?: string[]; error?: string; pending: boolean };

const TOOL_META: Record<string, { icon: typeof Database; label: string }> = {
  run_sql: { icon: Database, label: "Looking up your data" },
  segment_stats: { icon: Sigma, label: "Checking which patterns are real" },
  churn_drivers: { icon: Gauge, label: "Checking what raises churn" },
  risk_summary: { icon: ShieldAlert, label: "Checking customer risk" },
  simulate_scenario: { icon: FlaskConical, label: "Testing a change" },
  playbook: { icon: BookOpen, label: "Reading the playbook" },
};

const SUGGESTIONS = [
  "Which segment churns the most, and is it significant?",
  "How many high-risk customers do we have and why?",
  "What if we moved 30% of monthly customers to annual?",
  "Show churn rate by plan tier",
];

/* Render **bold** and [stat_id] citations inside an answer. */
function AnswerText({ text, ok }: { text: string; ok: Set<string> }) {
  const parts = text.split(/(\[[a-z_]+::[^\]]+\]|\*\*[^*]+\*\*)/g);
  return (
    <p className="whitespace-pre-wrap text-[13.5px] leading-[1.7] text-zinc-200">
      {parts.map((p, i) => {
        if (/^\[[a-z_]+::/.test(p)) {
          const id = p.slice(1, -1);
          const good = ok.has(id);
          return <span key={i} title={good ? "Checked against your data" : "Couldn't be checked — treat with care"}
            className={cn("mx-0.5 rounded px-1.5 py-px text-[11.5px]", good ? "bg-teal-400/10 text-teal-300" : "bg-amber-400/10 text-amber-300 line-through decoration-amber-400/60")}>{friendlyStat(id)}</span>;
        }
        if (p.startsWith("**")) return <b key={i} className="font-semibold text-zinc-50">{p.slice(2, -2)}</b>;
        return <span key={i}>{p}</span>;
      })}
    </p>
  );
}

function StepRow({ step, live }: { step: Step; live: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[step.tool] ?? { icon: Bot, label: step.tool };
  const Icon = meta.icon;
  const sql = step.tool === "run_sql" ? String(step.args.query ?? "") : null;
  return (
    <div data-cp="step" className="rounded-lg border border-white/6 bg-white/[0.02]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11.5px]">
        <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", live ? "animate-pulse text-brand" : "text-zinc-500")} />
        <span className="text-zinc-300">{meta.label}</span>
        <span className="ml-auto truncate font-mono text-[10.5px] text-zinc-500">{step.summary ?? (live ? "…" : "")}</span>
        {(sql || step.table) && <ChevronDown className={cn("h-3 w-3 text-zinc-600 transition-transform", open && "rotate-180")} />}
      </button>
      {open && (
        <div className="border-t border-white/6 px-2.5 py-2">
          {sql && <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[10.5px] leading-[1.5] text-sky-200">{sql}</pre>}
          {step.table && step.table.columns && (
            <div className="mt-2 max-h-48 overflow-auto">
              <table className="w-full font-mono text-[10.5px]">
                <thead><tr>{step.table.columns.map((c) => <th key={c} className="border-b border-white/8 px-1.5 py-1 text-left text-zinc-500">{c}</th>)}</tr></thead>
                <tbody>{step.table.rows.slice(0, 12).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="px-1.5 py-0.5 text-zinc-300">{String(v)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CopilotPanel({ jobId, open, onClose }: { jobId: string; open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  const mounted = useRef(false);
  useGSAP(
    () => {
      if (!panel.current) return;
      // first run (closed) just parks it off-screen; later toggles animate
      if (!mounted.current || prefersReducedMotion()) {
        mounted.current = true;
        gsap.set(panel.current, { xPercent: open ? 0 : 105 });
        return;
      }
      gsap.to(panel.current, { xPercent: open ? 0 : 105, duration: 0.7, ease: "expo.out" });
      if (open) gsap.from("[data-cp='intro'] > *", { y: 14, opacity: 0, stagger: 0.06, duration: 0.6, ease: "power3.out", delay: 0.15 });
    },
    { scope: panel, dependencies: [open] },
  );

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  useEffect(() => () => abort.current?.abort(), []);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    type Turn = { role: "user" | "assistant"; content: string };
    const history = msgs.flatMap((m): Turn[] =>
      m.role === "user" ? [{ role: "user", content: m.text }] : m.text ? [{ role: "assistant", content: m.text }] : []);
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "assistant", steps: [], pending: true }]);
    const patch = (fn: (a: Extract<Msg, { role: "assistant" }>) => Extract<Msg, { role: "assistant" }>) =>
      setMsgs((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") copy[copy.length - 1] = fn(last);
        return copy;
      });

    abort.current = new AbortController();
    try {
      await askCopilot(jobId, q, history, (e: CopilotEvent) => {
        if (e.type === "step") patch((a) => ({ ...a, steps: [...a.steps, { tool: e.tool, args: e.args }] }));
        else if (e.type === "tool_result") patch((a) => {
          const steps = [...a.steps];
          const idx = steps.map((s) => s.tool).lastIndexOf(e.tool);
          if (idx >= 0) steps[idx] = { ...steps[idx], summary: e.summary, table: e.table };
          return { ...a, steps };
        });
        else if (e.type === "answer") patch((a) => ({ ...a, text: e.text, citations: e.citations, unverified: e.unverified, pending: false }));
        else if (e.type === "error") patch((a) => ({ ...a, error: e.message, pending: false }));
        else if (e.type === "done") patch((a) => ({ ...a, pending: false }));
      }, abort.current.signal);
    } catch (err) {
      patch((a) => ({ ...a, error: (err as Error).message, pending: false }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={panel} data-lenis-prevent
      className="fixed inset-y-0 right-0 z-[70] flex w-full flex-col border-l border-white/10 bg-[#0a0b0f]/95 shadow-[-30px_0_80px_-20px_rgba(129,140,248,0.35)] backdrop-blur-xl sm:w-[460px]"
      style={{ transform: "translateX(105%)" }} aria-hidden={!open} inert={!open}>
      <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand via-brand-2 to-brand-3"><Bot className="h-4 w-4 text-ink" /></span>
        <div>
          <div className="text-[14px] font-semibold">Ask {BRAND.name}</div>
          <div className="font-mono text-[10.5px] text-zinc-500">answers from your data and shows its sources</div>
        </div>
        <button type="button" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100" aria-label="Close copilot"><X className="h-4 w-4" /></button>
      </div>

      <div ref={list} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {msgs.length === 0 && (
          <div data-cp="intro" className="flex flex-col gap-3">
            <p className="text-[13.5px] leading-[1.7] text-zinc-400">
              Ask anything about your customers or this analysis. I look things up in your data, check which patterns are real, and can test changes — and I show you every step.
            </p>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)}
                className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5 text-left text-[13px] text-zinc-300 transition-all hover:-translate-y-px hover:border-brand/40 hover:text-zinc-50">
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-brand-2/25 to-brand-3/15 px-3.5 py-2 text-[13.5px] text-zinc-50">{m.text}</div>
          </div>
        ) : (
          <div key={i} className="flex gap-2.5">
            <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg bg-white/[0.05]"><Bot className="h-3.5 w-3.5 text-brand" /></span>
            <div className="min-w-0 flex-1 space-y-2">
              {m.steps.map((s, j) => <StepRow key={j} step={s} live={m.pending && j === m.steps.length - 1 && !s.summary} />)}
              {m.pending && !m.text && (
                <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                  <span className="relative h-2 w-24 overflow-hidden rounded-full bg-white/[0.05]"><span className="absolute inset-y-0 w-1/3 animate-[scan_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-brand/60 to-transparent" /></span>
                  thinking
                </div>
              )}
              {m.text && <AnswerText text={m.text} ok={new Set(m.citations)} />}
              {!!m.citations?.length && (
                <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-teal-300"><BadgeCheck className="h-3.5 w-3.5" /> {m.citations.length} source{m.citations.length > 1 ? "s" : ""} checked against your data</div>
              )}
              {!!m.unverified?.length && (
                <div className="text-[10.5px] text-amber-300">⚠ {m.unverified.length} reference{m.unverified.length > 1 ? "s" : ""} couldn&apos;t be checked</div>
              )}
              {m.error && <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-200">{m.error}</div>}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-white/8 p-4">
        <div className="border-beam flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 pl-3.5">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Ask about your customers, risk or ideas to try…"
            className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-600" />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand via-brand-2 to-brand-3 text-ink transition-opacity disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.5} />}
          </button>
        </div>
      </form>
    </div>
  );
}

/* Floating launcher, bottom-right. */
export function CopilotLauncher({ onClick }: { onClick: () => void }) {
  const el = useRef<HTMLButtonElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.from(el.current, { y: 40, scale: 0.8, opacity: 0, duration: 0.8, ease: "back.out(1.8)", delay: 0.6 });
  });
  return (
    <button ref={el} type="button" onClick={onClick}
      className="border-beam group fixed bottom-6 right-6 z-[65] inline-flex h-12 items-center gap-2 rounded-full border border-white/12 bg-[#0d0f14]/90 pl-3 pr-5 text-[13.5px] font-medium text-zinc-100 shadow-[0_16px_50px_-10px_rgba(129,140,248,0.55)] backdrop-blur-xl transition-transform hover:scale-[1.03]">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand via-brand-2 to-brand-3">
        <Bot className="h-4 w-4 text-ink transition-transform duration-500 group-hover:rotate-12" />
      </span>
      Ask {BRAND.name}
    </button>
  );
}
