"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, LogOut, Plus } from "lucide-react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { initials, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/* Avatar button + dropdown. Shows "Log in / Sign up" when logged out. */
export function UserMenu({ className, compactAuthLinks }: { className?: string; compactAuthLinks?: boolean }) {
  const { user, status, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  useGSAP(
    () => {
      if (!open || prefersReducedMotion()) return;
      gsap.from("[data-um='panel']", { y: -8, scale: 0.97, opacity: 0, duration: 0.35, ease: "expo.out", transformOrigin: "top right" });
      gsap.from("[data-um='item']", { x: 6, opacity: 0, stagger: 0.04, duration: 0.3, ease: "power2.out", delay: 0.05 });
    },
    { scope: root, dependencies: [open] },
  );

  if (status === "loading") return <div className={cn("h-9 w-9 animate-pulse rounded-full bg-white/[0.05]", className)} />;

  if (status === "anon" || !user) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Link href="/login" className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] text-zinc-300 transition-colors hover:text-zinc-50">Log in</Link>
        {!compactAuthLinks && (
          <Link href="/signup" className="inline-flex h-9 items-center rounded-full bg-zinc-50 px-4 text-[13px] font-semibold text-ink transition-transform hover:scale-[1.03]">Sign up</Link>
        )}
      </div>
    );
  }

  const doLogout = async () => {
    setOpen(false);
    await logout(); // navigates home itself
  };

  return (
    <div ref={root} className={cn("relative", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
        className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand via-brand-2 to-brand-3 p-[1.5px] transition-transform hover:scale-105">
        <span className="grid h-full w-full place-items-center rounded-full bg-[#0d0f14] text-[12px] font-semibold text-zinc-50">{initials(user.name)}</span>
      </button>
      {open && (
        <div data-um="panel" role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-[80] w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f14] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]">
          <div className="border-b border-white/8 px-4 py-3">
            <div className="truncate text-[13.5px] font-medium text-zinc-50">{user.name}</div>
            <div className="truncate text-[12px] text-zinc-500">{user.email}</div>
          </div>
          <div className="p-1.5">
            <Link data-um="item" role="menuitem" href="/dashboard" onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-50">
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </Link>
            <Link data-um="item" role="menuitem" href="/form" onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-50">
              <Plus className="h-4 w-4" /> New analysis
            </Link>
            <button data-um="item" role="menuitem" type="button" onClick={doLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-zinc-300 hover:bg-rose-500/10 hover:text-rose-200">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
