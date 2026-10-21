"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Plus, GitCompareArrows } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
];

/* Chrome for the logged-in-style app pages: sticky glass nav, drifting light. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.utils.toArray<HTMLElement>("[data-aurora]").forEach((el, i) => {
        gsap.to(el, {
          xPercent: gsap.utils.random(-20, 20), yPercent: gsap.utils.random(-15, 15), scale: gsap.utils.random(0.9, 1.2),
          duration: gsap.utils.random(10, 16), ease: "sine.inOut", repeat: -1, yoyo: true, delay: i,
        });
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="grain relative min-h-screen bg-ink text-zinc-50">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div data-aurora className="absolute right-[0%] top-[-25%] h-[60vh] w-[50vw] rounded-full bg-[radial-gradient(closest-side,rgba(94,234,212,0.08),transparent)] blur-2xl" />
        <div data-aurora className="absolute bottom-[-25%] left-[-10%] h-[60vh] w-[50vw] rounded-full bg-[radial-gradient(closest-side,rgba(129,140,248,0.09),transparent)] blur-2xl" />
        <div data-aurora className="absolute left-[40%] top-[30%] h-[40vh] w-[30vw] rounded-full bg-[radial-gradient(closest-side,rgba(232,121,249,0.05),transparent)] blur-2xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,#000,transparent_80%)]" />
      </div>
      <header className="sticky top-0 z-40 border-b border-white/6 bg-ink/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-8">
          <Logo />
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = path?.startsWith(href);
              return (
                <Link key={href} href={href}
                  className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors",
                    active ? "bg-white/[0.07] text-zinc-50" : "text-zinc-400 hover:text-zinc-100")}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </Link>
              );
            })}
          </nav>
          <Link href="/form" className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-zinc-50 px-4 text-[13px] font-semibold text-ink transition-transform hover:scale-[1.03]">
            <Plus className="h-3.5 w-3.5" /> New analysis
          </Link>
        </div>
      </header>
      <main className="relative mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-8">{children}</main>
    </div>
  );
}
