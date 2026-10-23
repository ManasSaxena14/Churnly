"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Plus, GitCompareArrows } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { UserMenu } from "@/components/auth/UserMenu";
import { MobileMenu, NavProgress, PillLinks, useHeadroom, type NavItem } from "@/components/nav/PillNav";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

const NAV: NavItem[] = [
  { key: "/dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "/compare", href: "/compare", label: "Compare", icon: GitCompareArrows },
  { key: "/form", href: "/form", label: "New analysis", icon: Plus },
];

/* Floating glass bar: sliding highlight on the active page, hides on scroll
   down, progress hairline when scrolled. */
function AppHeader() {
  const header = useRef<HTMLElement>(null);
  const scrolled = useHeadroom(header, { offset: 80 });
  const path = usePathname();
  const active = NAV.find((n) => path?.startsWith(n.href))?.key ?? null;
  return (
    <header ref={header} className="sticky top-0 z-40 px-3 pt-3 will-change-transform">
      <nav className={cn(
        "relative mx-auto flex max-w-7xl items-center gap-4 rounded-full py-2 pl-4 pr-2 transition-[background,border-color,box-shadow] duration-500",
        scrolled
          ? "border border-white/10 bg-[#0b0d12]/92 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "border border-white/6 bg-white/[0.02]",
      )}>
        <Logo />
        <span className="hidden h-5 w-px bg-white/10 md:block" />
        <PillLinks items={NAV.slice(0, 2)} active={active} className="hidden md:flex" />
        <div className="ml-auto flex items-center gap-2">
          <Link href="/form" className={cn(
            "cta-ring hidden h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-transform hover:scale-[1.03] sm:inline-flex",
            active === "/form" ? "bg-white/[0.08] text-zinc-50" : "bg-zinc-50 text-ink",
          )}>
            <Plus className="h-3.5 w-3.5" /> New analysis
          </Link>
          <UserMenu />
          <MobileMenu items={NAV} />
        </div>
        {scrolled && <NavProgress />}
      </nav>
    </header>
  );
}

/* Chrome for the logged-in-style app pages: sticky glass nav, drifting light. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.utils.toArray<HTMLElement>("[data-aurora]").forEach((el, i) => {
        gsap.to(el, {
          xPercent: gsap.utils.random(-20, 20), yPercent: gsap.utils.random(-15, 15),
          duration: gsap.utils.random(10, 16), ease: "sine.inOut", repeat: -1, yoyo: true, delay: i,
        });
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="grain relative min-h-screen bg-ink text-zinc-50">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div data-aurora className="absolute right-[0%] top-[-25%] h-[60vh] w-[50vw] rounded-full bg-[radial-gradient(closest-side,rgba(94,234,212,0.08),transparent)] will-change-transform" />
        <div data-aurora className="absolute bottom-[-25%] left-[-10%] h-[60vh] w-[50vw] rounded-full bg-[radial-gradient(closest-side,rgba(129,140,248,0.09),transparent)] will-change-transform" />
        <div data-aurora className="absolute left-[40%] top-[30%] h-[40vh] w-[30vw] rounded-full bg-[radial-gradient(closest-side,rgba(232,121,249,0.05),transparent)] will-change-transform" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,#000,transparent_80%)]" />
      </div>
      <AppHeader />
      <main className="relative mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-8">{children}</main>
    </div>
  );
}
