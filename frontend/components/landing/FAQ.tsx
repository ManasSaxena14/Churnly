"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { SplitReveal, Reveal } from "@/components/motion";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const QA = [
  {
    q: "What does my data need to include?",
    a: "A CSV with one row per customer. It needs a column that says whether the customer left (yes/no or 1/0) and a column for how long they've been a customer. Anything else — usage, support tickets, plan, contract type, sign-up channel — is picked up automatically, and you confirm what each column means before the analysis starts.",
  },
  {
    q: "How is this different from pasting my data into an AI chatbot?",
    a: "A chatbot can make up causes and numbers that sound convincing. Churnly runs proven statistics first and only lets the AI explain patterns that are real. A separate AI reviewer challenges every idea, and expected results come from simulations based on published case studies.",
  },
  {
    q: "How long does an analysis take?",
    a: "A quick analysis takes about 2–4 minutes. A deep analysis double-checks the diagnosis three times and uses stronger AI models, so it takes about 10–20 minutes.",
  },
  {
    q: "How do you know the results are accurate?",
    a: "We test Churnly on customer datasets where we already know the real reasons people leave, and measure how often it finds them. Across 50 test datasets, our false-alarm filter cut wrong findings from 16.3% to 6.0%. The numbers on this page come straight from those tests.",
  },
  {
    q: "Where does my data go?",
    a: `Your file stays on the server you run ${BRAND.name} on. Saved analyses keep summaries and the final plan, never your raw customer rows. The AI agents work from summary statistics; only the Ask ${BRAND.name} assistant may look at up to 50 rows when you ask about specific customers.`,
  },
  {
    q: "Can I share the results?",
    a: "Yes. Export the plan as a PDF report or a Markdown file, including the evidence behind each recommendation, the 30-60-90 day roadmap, success metrics and risks.",
  },
];

function Item({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  const body = useRef<HTMLDivElement>(null);
  const icon = useRef<SVGSVGElement>(null);
  const first = useRef(true);

  // Animate on every open/close — including when another item opening closes this one.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const instant = first.current || prefersReducedMotion();
    first.current = false;
    if (instant) {
      gsap.set(el, { height: open ? "auto" : 0, opacity: open ? 1 : 0 });
      gsap.set(icon.current, { rotate: open ? 135 : 0 });
      return;
    }
    if (open) gsap.fromTo(el, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.55, ease: "power3.out" });
    else gsap.to(el, { height: 0, opacity: 0, duration: 0.45, ease: "power3.inOut" });
    gsap.to(icon.current, { rotate: open ? 135 : 0, duration: 0.45, ease: "back.out(2)" });
  }, [open]);

  return (
    <div className={cn("rounded-2xl border transition-colors duration-300", open ? "border-white/14 bg-white/[0.035]" : "border-white/6 bg-white/[0.015] hover:border-white/12")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 px-6 py-5 text-left">
        <span className="flex-1 font-display text-[17px] font-medium tracking-[-0.01em] text-zinc-100">{q}</span>
        <span className={cn("grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border transition-colors", open ? "border-brand/50 bg-brand/10" : "border-white/10")}>
          <Plus ref={icon} className={cn("h-4 w-4", open ? "text-brand" : "text-zinc-400")} />
        </span>
      </button>
      <div ref={body} className="h-0 overflow-hidden opacity-0">
        <p className="px-6 pb-6 text-[14.5px] leading-[1.75] text-zinc-400">{a}</p>
      </div>
    </div>
  );
}

export function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="mx-auto grid max-w-7xl gap-12 px-4 py-28 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">FAQ</p>
        <SplitReveal className="mt-3 font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-zinc-50 sm:text-[44px]">
          Questions, <span data-keep className="inline-block font-serif font-normal italic text-zinc-400">answered.</span>
        </SplitReveal>
        <p className="mt-5 max-w-sm text-[15px] leading-[1.75] text-zinc-400">
          Everything teams ask before trusting an AI with their retention strategy.
        </p>
      </div>
      <Reveal onScroll className="flex flex-col gap-3" stagger={0.07}>
        {QA.map((item, i) => (
          <Item key={item.q} {...item} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
        ))}
      </Reveal>
    </section>
  );
}
