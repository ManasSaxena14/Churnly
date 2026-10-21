"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUp, Paperclip } from "lucide-react";
import { prefersReducedMotion } from "@/lib/gsap";

const QUESTIONS = [
  "Why are monthly subscribers churning after day 30?",
  "Which segment should we save first — and what will it cost?",
  "Is support friction actually driving churn, or is it noise?",
  "What's the realistic lift if we fix onboarding?",
];

/* AI-product style input: cycles through questions the analysis answers.
   The whole bar is a link into the questionnaire — the CSV is the real prompt. */
export function PromptBar() {
  const [text, setText] = useState("");

  useEffect(() => {
    if (prefersReducedMotion()) {
      const t = setTimeout(() => setText(QUESTIONS[0]), 0);
      return () => clearTimeout(t);
    }
    let q = 0, i = 0, deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = QUESTIONS[q];
      if (!deleting) {
        i++;
        setText(full.slice(0, i));
        if (i >= full.length) { deleting = true; timer = setTimeout(tick, 2200); return; }
        timer = setTimeout(tick, 32 + Math.random() * 40);
      } else {
        i -= 2;
        setText(full.slice(0, Math.max(0, i)));
        if (i <= 0) { deleting = false; q = (q + 1) % QUESTIONS.length; timer = setTimeout(tick, 350); return; }
        timer = setTimeout(tick, 14);
      }
    };
    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Link
      href="/form"
      className="border-beam group flex w-full max-w-xl items-center gap-3 rounded-2xl border border-white/10 bg-[#0e1016]/90 p-2 pl-3 transition-colors hover:bg-[#13161e]/95"
      aria-label="Start an analysis"
    >
      <span className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 px-2.5 font-mono text-[11.5px] text-zinc-300">
        <Paperclip className="h-3.5 w-3.5 text-brand" /> <span className="hidden sm:inline">customers.csv</span>
      </span>
      <span className="caret min-w-0 flex-1 truncate text-[14.5px] text-zinc-300">{text}</span>
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand via-brand-2 to-brand-3 text-ink shadow-[0_0_24px_rgba(129,140,248,0.45)] transition-transform duration-300 group-hover:scale-105">
        <ArrowUp className="h-4.5 w-4.5" strokeWidth={2.5} />
      </span>
    </Link>
  );
}
