/* Animated mini-illustrations for the six pipeline stage cards.
   Each one is a tiny "screen" showing what that stage actually does, looping
   with CSS keyframes (.sv-* in globals.css) so they cost nothing in JS and
   freeze cleanly under prefers-reduced-motion. Values are illustrative. */

import { cn } from "@/lib/utils";

const d = (s: number) => ({ animationDelay: `${s}s` });

function Screen({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative h-[168px] w-full overflow-hidden rounded-2xl border border-white/8 bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", className)}>
      {children}
    </div>
  );
}

/* 01 — a CSV being scanned: roles get detected, a null gets fixed, quality scored */
function IngestVisual() {
  const rows = [[0.7, 0.4, 0.55, 0.2], [0.5, 0.65, 0.35, 0.2], [0.8, 0.3, 0.6, 0.2], [0.45, 0.55, 0.3, 0.2]];
  return (
    <Screen>
      <div className="flex items-center gap-1.5 border-b border-white/6 px-3 py-2 font-mono text-[9.5px] text-zinc-500">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> customers.csv
        <span className="ml-auto">12,480 rows</span>
      </div>
      <div className="grid grid-cols-4 gap-2 px-3 pt-2 font-mono text-[9px]">
        {[["id", ""], ["tenure", "text-teal-300 border-teal-400/40 bg-teal-400/10"], ["plan", ""], ["churn", "text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-400/10"]].map(([c, tone], i) => (
          <span key={c} className={cn("sv sv-fade truncate rounded-md border border-white/8 px-1.5 py-0.5 text-zinc-400", tone)} style={d(0.3 + i * 0.25)}>
            {c}{tone ? " ✓" : ""}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-col gap-2 px-3">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-4 gap-2">
            {r.map((w, j) => (
              i === 2 && j === 2 ? (
                <span key={j} className="relative h-2 rounded-full">
                  <span className="sv sv-null absolute inset-0 rounded-full bg-rose-400/60" />
                  <span className="sv sv-fixed absolute inset-y-0 left-0 origin-left rounded-full bg-sky-300/50" style={{ width: `${w * 100}%` }} />
                </span>
              ) : (
                <span key={j} className="h-2 rounded-full bg-white/10" style={{ width: `${w * 100}%` }} />
              )
            ))}
          </div>
        ))}
      </div>
      <span className="sv sv-scan pointer-events-none absolute inset-x-0 h-6 bg-gradient-to-b from-transparent via-sky-300/15 to-transparent" />
      <div className="absolute bottom-2.5 right-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 font-mono text-[9.5px] text-zinc-300">
        <svg viewBox="0 0 20 20" className="h-4 w-4 -rotate-90">
          <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
          <circle className="sv sv-ring" cx="10" cy="10" r="8" fill="none" stroke="#5eead4" strokeWidth="3" pathLength={1} strokeDasharray="0.92 1" strokeLinecap="round" />
        </svg>
        quality 0.92
      </div>
    </Screen>
  );
}

/* 02 — KM curve draws; tests pass or get struck out by BH correction */
function StatsVisual() {
  const km = "M4 8 H40 V22 H70 V30 H98 V44 H126 V52 H150 V62";
  return (
    <Screen className="grid grid-cols-[1fr_1.15fr]">
      <div className="relative border-r border-white/6 p-3">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-teal-300/80">customers staying</div>
        <svg viewBox="0 0 154 70" className="mt-2 h-[100px] w-full" preserveAspectRatio="none">
          {[18, 36, 54].map((y) => <line key={y} x1="0" x2="154" y1={y} y2={y} stroke="rgba(255,255,255,0.05)" vectorEffect="non-scaling-stroke" />)}
          <path className="sv sv-draw" d={km} fill="none" stroke="url(#sv-km)" strokeWidth="2" pathLength={1} strokeDasharray="1" vectorEffect="non-scaling-stroke" />
          <defs>
            <linearGradient id="sv-km" x1="0" x2="1"><stop offset="0" stopColor="#5eead4" /><stop offset="1" stopColor="#818cf8" /></linearGradient>
          </defs>
        </svg>
      </div>
      <div className="flex flex-col justify-center gap-2 p-3 font-mono text-[9.5px]">
        <div className="sv sv-fade flex items-center justify-between rounded-md bg-teal-400/[0.07] px-2 py-1.5" style={d(0.6)}>
          <span className="text-zinc-300">contract::Monthly</span><span className="text-teal-300">p&lt;.001 ✓</span>
        </div>
        <div className="sv sv-fade relative flex items-center justify-between rounded-md bg-white/[0.03] px-2 py-1.5" style={d(1.1)}>
          <span className="text-zinc-500">plan::Basic</span>
          <span className="text-zinc-500">p .04 → <span className="text-rose-300">.11</span></span>
          <span className="sv sv-strike absolute left-2 right-2 top-1/2 h-px origin-left bg-rose-400/70" />
        </div>
        <div className="sv sv-fade flex items-center justify-between rounded-md bg-teal-400/[0.07] px-2 py-1.5" style={d(1.6)}>
          <span className="text-zinc-300">support::4+</span><span className="text-teal-300">p .003 ✓</span>
        </div>
        <div className="text-center text-[8.5px] uppercase tracking-[0.14em] text-zinc-600">chance patterns removed</div>
      </div>
    </Screen>
  );
}

/* 03 — three diagnosis runs send their causes to a vote; 2 of 3 agree.
   Drawn on a fixed 284px stage (centred) so the lines and travelling dots
   line up at any card width. */
function DiscoveryVisual() {
  const runs = [{ t: "t 0.2", y: 28 }, { t: "t 0.5", y: 79 }, { t: "t 0.7", y: 130 }];
  const X1 = 96, VX = 206, VY = 79;
  return (
    <Screen>
      <div className="relative mx-auto mt-[5px] h-[158px] w-[284px]">
        <svg viewBox="0 0 284 158" className="absolute inset-0 h-full w-full">
          {runs.map((r, i) => (
            <line key={i} x1={X1} y1={r.y} x2={VX} y2={VY} stroke="rgba(129,140,248,0.28)" strokeDasharray="3 4" />
          ))}
        </svg>
        {runs.map((r, i) => (
          <div key={i} className="absolute left-0 flex w-[96px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-indigo-400/25 bg-indigo-400/[0.08] px-2 py-1 font-mono text-[9.5px] text-indigo-200"
            style={{ top: r.y - 11 }}>
            <span className="sv sv-dot h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-300" style={d(i * 0.3)} /> run {i + 1} · {r.t.split(" ")[1]}
          </div>
        ))}
        {runs.map((r, i) => (
          <span key={i} className="sv sv-travel absolute h-2 w-2 rounded-full bg-indigo-300 shadow-[0_0_10px_#a5b4fc]"
            style={{ left: X1 - 4, top: r.y - 4, ["--dx" as string]: `${VX - X1}px`, ["--dy" as string]: `${VY - r.y}px`, ...d(0.2 + i * 0.35) }} />
        ))}
        <div className="absolute grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-fuchsia-400/40 bg-fuchsia-400/10 font-mono text-[9px] text-fuchsia-200"
          style={{ left: VX, top: VY }}>
          <span className="sv sv-glow absolute inset-0 rounded-full" />
          vote
        </div>
        <div className="sv sv-pop absolute bottom-3 right-0 rounded-full border border-teal-400/40 bg-teal-400/10 px-2.5 py-1 font-mono text-[9.5px] text-teal-200" style={d(1.8)}>
          2 / 3 agree ✓
        </div>
      </div>
    </Screen>
  );
}

/* 04 — the graph pauses and asks you a question */
function HitlVisual() {
  return (
    <Screen className="flex flex-col justify-center gap-2.5 px-4">
      <div className="sv sv-fade flex items-end gap-2" style={d(0.2)}>
        <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-fuchsia-400/20 font-mono text-[9px] text-fuchsia-200">AI</span>
        <span className="rounded-2xl rounded-bl-md bg-white/[0.06] px-3 py-1.5 text-[11px] text-zinc-200">What retention budget can you commit this quarter?</span>
      </div>
      <div className="sv sv-typing ml-auto flex gap-1 rounded-full bg-white/[0.04] px-3 py-2" style={d(0.9)}>
        {[0, 0.15, 0.3].map((t) => <span key={t} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${t}s` }} />)}
      </div>
      <div className="sv sv-fade ml-auto rounded-2xl rounded-br-md bg-gradient-to-br from-brand-2/40 to-brand-3/30 px-3 py-1.5 text-[11px] text-zinc-50" style={d(1.8)}>
        About $15k — no discounts though.
      </div>
      <div className="sv sv-fade flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-teal-300" style={d(2.4)}>
        <span className="h-1.5 w-1.5 rounded-full bg-teal-300" /> routed to strategy pod
      </div>
    </Screen>
  );
}

/* 05 — three strategists propose, the skeptic vetoes the weak one */
function StrategyVisual() {
  const tactics = [
    { who: "Unit economist", what: "Annual plan offer", score: 0.82 },
    { who: "JTBD", what: "Onboarding milestone", score: 0.74 },
    { who: "Growth", what: "30% blanket discount", score: 0.41, veto: true },
  ];
  return (
    <Screen className="flex flex-col justify-center gap-2 px-3">
      {tactics.map((t, i) => (
        <div key={t.who} className="sv sv-fade relative grid grid-cols-[1fr_70px] items-center gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5" style={d(0.2 + i * 0.3)}>
          <div className="min-w-0">
            <div className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-amber-300/80">{t.who}</div>
            <div className="truncate text-[11px] text-zinc-200">{t.what}</div>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06]">
            <div className={cn("sv sv-grow-x h-full origin-left rounded-full", t.veto ? "bg-rose-400" : "bg-amber-300")} style={{ width: `${t.score * 100}%`, ...d(0.5 + i * 0.3) }} />
          </div>
          {t.veto && (
            <span className="sv sv-stamp absolute right-6 top-1/2 -mt-3 rounded-md border-2 border-rose-400 px-1.5 font-mono text-[11px] font-bold tracking-[0.12em] text-rose-300" style={d(1.6)}>
              VETO
            </span>
          )}
        </div>
      ))}
    </Screen>
  );
}

/* 06 — 10k simulations pile into a distribution; the plan lights up */
function SimVisual() {
  const bars = [0.08, 0.16, 0.3, 0.5, 0.72, 0.92, 1, 0.86, 0.64, 0.42, 0.24, 0.12, 0.06];
  return (
    <Screen className="flex flex-col px-3 pb-2.5 pt-3">
      <div className="flex items-center justify-between font-mono text-[9px] text-zinc-500">
        <span>10,000 simulations</span><span className="text-emerald-300">+6.8% retention</span>
      </div>
      <div className="relative mt-2 flex flex-1 items-end gap-[3px]">
        <span className="absolute inset-y-0 left-[23%] right-[23%] rounded-md border-x border-dashed border-emerald-300/30 bg-emerald-300/[0.04]" />
        {bars.map((b, i) => (
          <span key={i} className="sv sv-grow relative flex-1 origin-bottom rounded-t-sm bg-gradient-to-t from-emerald-500/50 to-teal-300/80"
            style={{ height: `${b * 100}%`, ...d(i * 0.06) }} />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {["30 days", "60 days", "90 days"].map((p, i) => (
          <span key={p} className="sv sv-light rounded-md border border-white/8 py-1 text-center font-mono text-[9px] text-zinc-400" style={d(1.4 + i * 0.3)}>{p}</span>
        ))}
      </div>
    </Screen>
  );
}

export const STAGE_VISUALS = [IngestVisual, StatsVisual, DiscoveryVisual, HitlVisual, StrategyVisual, SimVisual];
