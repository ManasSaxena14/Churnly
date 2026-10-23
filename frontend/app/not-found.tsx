"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { RetentionOrbit } from "@/components/three/RetentionOrbit";
import { Magnetic } from "@/components/motion";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

export default function NotFound() {
  const root = useRef<HTMLDivElement>(null);
  const retain = useRef(0);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.timeline({ defaults: { ease: "expo.out" } })
        .from("[data-nf='digit']", { yPercent: 120, opacity: 0, stagger: 0.1, duration: 1.2 })
        .from("[data-nf='copy'] > *", { y: 16, opacity: 0, stagger: 0.1, duration: 0.9 }, 0.5);
      // the drifting digit keeps trying to leave orbit
      gsap.to("[data-nf='drift']", { x: 18, y: -10, rotate: 8, duration: 2.4, ease: "sine.inOut", repeat: -1, yoyo: true });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="grain relative flex min-h-screen flex-col overflow-hidden bg-ink text-zinc-50">
      <RetentionOrbit retainRef={retain} className="absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_45%_40%_at_50%_50%,rgba(7,8,11,0.9),transparent_75%)]" />
      <header className="relative z-10 mx-auto w-full max-w-site px-4 py-5 sm:px-8"><Logo /></header>
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-24 text-center">
        <div className="flex overflow-hidden font-display text-[120px] font-bold leading-none tracking-[-0.06em] sm:text-[200px]">
          <span data-nf="digit" className="inline-block">4</span>
          <span data-nf="digit" className="inline-block"><span data-nf="drift" className="inline-block text-brand-gradient">0</span></span>
          <span data-nf="digit" className="inline-block">4</span>
        </div>
        <div data-nf="copy" className="mt-4 flex flex-col items-center">
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.03em]">This page drifted out of orbit.</h1>
          <p className="mt-3 max-w-md text-[15px] leading-[1.7] text-zinc-400">
            Unlike your customers, we couldn&apos;t win this one back. Let&apos;s get you somewhere useful.
          </p>
          <Magnetic>
            <Link href="/" className="cta-ring mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-zinc-50 px-7 text-[14px] font-semibold text-ink">
              <ArrowLeft className="h-4 w-4" /> Back to home
            </Link>
          </Magnetic>
        </div>
      </main>
    </div>
  );
}
