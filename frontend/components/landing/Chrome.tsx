"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { RetentionOrbit } from "@/components/three/RetentionOrbit";
import { BRAND } from "@/lib/brand";
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { useStartDemo } from "@/lib/useStartDemo";
import { cn } from "@/lib/utils";

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3">
      <nav
        className={cn(
          "flex w-full max-w-7xl items-center justify-between rounded-full px-4 py-2.5 transition-all duration-500 sm:px-5",
          scrolled ? "border border-white/8 bg-ink/70 shadow-[0_8px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl" : "border border-transparent",
        )}
      >
        <Logo />
        <div className="hidden items-center gap-7 text-[13.5px] text-zinc-400 md:flex">
          {[["How it works", "#how"], ["Output", "#product"], ["Evals", "#evals"], ["Receipts", "#receipts"], ["FAQ", "#faq"]].map(([l, h]) => (
            <a key={h} href={h} className="group relative py-1 transition-colors hover:text-zinc-50">
              {l}
              <span className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-gradient-to-r from-brand to-brand-3 transition-transform duration-300 group-hover:scale-x-100" />
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="hidden h-9 items-center rounded-full border border-white/10 px-4 text-[13px] text-zinc-300 transition-colors hover:border-white/25 hover:text-zinc-50 sm:inline-flex">
            Dashboard
          </Link>
          <Link
            href="/form"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-zinc-50 px-4 text-[13px] font-semibold text-ink transition-transform hover:scale-[1.03]"
          >
            Start <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>
    </header>
  );
}

const TECH = [
  "LangGraph", "FastAPI", "Server-Sent Events", "Gemini", "Groq · gpt-oss-120b", "ChromaDB", "HyDE",
  "lifelines · CoxPH", "Kaplan-Meier", "Benjamini-Hochberg", "Monte Carlo", "DuckDB", "Inngest", "Langfuse",
  "Next.js 16", "GSAP", "Three.js",
];

export function TechMarquee() {
  return (
    <div className="relative overflow-hidden border-y border-white/6 py-5 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
      <div className="animate-marquee flex w-max gap-10 whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.18em] text-zinc-500">
        {[...TECH, ...TECH].map((t, i) => (
          <span key={i} className="inline-flex items-center gap-10">
            {t}
            <span className="h-1 w-1 rounded-full bg-zinc-700" />
          </span>
        ))}
      </div>
    </div>
  );
}

export function FinalCTA() {
  const root = useRef<HTMLElement>(null);
  const btn = useRef<HTMLAnchorElement>(null);
  const { start, loading } = useStartDemo();
  const retainRef = useRef(0);

  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: root.current, start: "top 80%", end: "center center", scrub: true,
        onUpdate: (self) => { retainRef.current = self.progress; },
      });
      if (prefersReducedMotion()) return;
      gsap.from("[data-cta='reveal']", {
        y: 40, opacity: 0, stagger: 0.1, duration: 1, ease: "expo.out",
        scrollTrigger: { trigger: root.current, start: "top 75%" },
      });
      // Magnetic primary button.
      const el = btn.current;
      if (!el) return;
      const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.3);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.3);
      };
      const leave = () => { xTo(0); yTo(0); };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      return () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", leave);
      };
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative isolate overflow-hidden px-4 py-36 sm:px-8">
      {/* customers in orbit — churners drift out, the playbook pulls them back */}
      <RetentionOrbit retainRef={retainRef} className="absolute inset-0 -z-10 opacity-70" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_45%_at_50%_50%,rgba(7,8,11,0.85),rgba(7,8,11,0.4)_60%,transparent)]" />
      <div className="relative mx-auto max-w-4xl text-center">
        <h2 data-cta="reveal" className="font-display text-[40px] font-semibold leading-[1.02] tracking-[-0.045em] text-zinc-50 sm:text-[64px]">
          Hold on to the customers <br className="hidden sm:block" />
          <span className="font-serif font-normal italic text-brand-gradient">you&apos;re about to lose.</span>
        </h2>
        <p data-cta="reveal" className="mx-auto mt-5 max-w-xl text-[16px] leading-[1.7] text-zinc-400">
          A quick scan takes about 3 minutes. A deep analysis about 15. Either way you get a
          playbook you can defend in a board meeting.
        </p>
        <div data-cta="reveal" className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            ref={btn}
            href="/form"
            className="cta-ring inline-flex h-14 items-center gap-2.5 rounded-full bg-zinc-50 px-9 text-[16px] font-semibold text-ink"
          >
            Analyze your data <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={start}
            disabled={loading}
            className="inline-flex h-14 items-center gap-2.5 rounded-full border border-white/12 px-7 text-[15px] font-medium text-zinc-200 transition-colors hover:border-brand/50 disabled:opacity-60"
          >
            <Play className="h-3.5 w-3.5 fill-brand text-brand" />
            {loading ? "Loading demo…" : "Watch a full run"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      // Giant wordmark: letters rise in, then the gradient sweeps across.
      gsap.from("[data-ft='letter']", {
        yPercent: 100, opacity: 0, stagger: 0.05, duration: 1.1, ease: "expo.out",
        scrollTrigger: { trigger: root.current, start: "top 85%" },
      });
      gsap.fromTo("[data-ft='fill']", { backgroundPosition: "100% 0" }, {
        backgroundPosition: "0% 0", ease: "none",
        scrollTrigger: { trigger: root.current, start: "top 90%", end: "bottom bottom", scrub: true },
      });
    },
    { scope: root },
  );
  const word = BRAND.name.split("");
  return (
    <footer ref={root} className="relative overflow-hidden border-t border-white/6">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-[13.5px] leading-[1.7] text-zinc-500">{BRAND.tagline}. Survival models, corrected statistics and a multi-agent graph — with a receipt for every claim.</p>
        </div>
        <div className="flex flex-col gap-2.5 text-[13.5px]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-zinc-600">Product</span>
          {[["How it works", "#how"], ["Output", "#product"], ["Evals", "#evals"], ["FAQ", "#faq"]].map(([l, h]) => (
            <a key={h} href={h} className="w-fit text-zinc-400 transition-colors hover:text-zinc-50">{l}</a>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 text-[13.5px]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-zinc-600">Start</span>
          <Link href="/form" className="w-fit text-zinc-400 transition-colors hover:text-zinc-50">Analyze your data</Link>
          <a href="https://github.com/Abhayanthk/Retain_AI" target="_blank" rel="noreferrer" className="w-fit text-zinc-400 transition-colors hover:text-zinc-50">Original Retain AI project ↗</a>
        </div>
      </div>

      <div aria-hidden="true" className="mx-auto mt-10 max-w-7xl select-none overflow-hidden px-2 sm:px-6">
        <div
          data-ft="fill"
          className="flex justify-center bg-[linear-gradient(100deg,#5eead4_0%,#818cf8_30%,#e879f9_50%,rgba(255,255,255,0.05)_60%,rgba(255,255,255,0.05)_100%)] bg-[length:250%_100%] bg-clip-text font-display text-[22vw] font-bold leading-[0.82] tracking-[-0.07em] text-transparent lg:text-[260px]"
        >
          {word.map((ch, i) => (
            <span key={i} data-ft="letter" className="inline-block">{ch}</span>
          ))}
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-white/6 px-4 py-6 text-[12px] text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>© {new Date().getFullYear()} {BRAND.name}</span>
        <span>
          Built on the open-source{" "}
          <a href="https://github.com/Abhayanthk/Retain_AI" className="text-zinc-400 underline decoration-white/20 underline-offset-4 hover:text-zinc-200" target="_blank" rel="noreferrer">Retain AI</a>{" "}
          project.
        </span>
      </div>
    </footer>
  );
}
