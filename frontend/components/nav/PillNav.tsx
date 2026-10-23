"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

export interface NavItem { key: string; label: string; href: string; icon?: React.ComponentType<{ className?: string }> }

/* Link row with a highlight pill that glides to whichever link is hovered,
   and rests on the active one otherwise. */
export function PillLinks({ items, active, className }: { items: NavItem[]; active?: string | null; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const target = hover ?? active ?? null;

  useGSAP(
    () => {
      const el = target ? root.current?.querySelector<HTMLElement>(`[data-key="${target}"]`) : null;
      if (!pill.current) return;
      if (!el) {
        gsap.to(pill.current, { opacity: 0, duration: 0.25 });
        return;
      }
      const vars = { x: el.offsetLeft, width: el.offsetWidth, opacity: 1 };
      if (prefersReducedMotion()) gsap.set(pill.current, vars);
      else gsap.to(pill.current, { ...vars, duration: 0.45, ease: "expo.out" });
    },
    { scope: root, dependencies: [target] },
  );

  const isAnchor = (href: string) => href.startsWith("#");
  return (
    <div ref={root} onMouseLeave={() => setHover(null)} className={cn("relative flex items-center", className)}>
      <span ref={pill} aria-hidden="true" className="absolute inset-y-0 left-0 w-0 rounded-full bg-white/[0.07] opacity-0 ring-1 ring-inset ring-white/10" />
      {items.map(({ key, label, href, icon: Icon }) => {
        const cls = cn(
          "relative z-10 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13.5px] transition-colors duration-300",
          active === key ? "text-zinc-50" : "text-zinc-400 hover:text-zinc-100",
        );
        const inner = (<>{Icon && <Icon className="h-3.5 w-3.5" />}{label}{active === key && <span className="absolute -bottom-[3px] left-1/2 h-[3px] w-3 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand to-brand-3" />}</>);
        return isAnchor(href) ? (
          <a key={key} data-key={key} href={href} onMouseEnter={() => setHover(key)} onFocus={() => setHover(key)} className={cls} aria-current={active === key ? "true" : undefined}>{inner}</a>
        ) : (
          <Link key={key} data-key={key} href={href} onMouseEnter={() => setHover(key)} onFocus={() => setHover(key)} className={cls} aria-current={active === key ? "page" : undefined}>{inner}</Link>
        );
      })}
    </div>
  );
}

/* Hides the header while scrolling down, brings it back on scroll up. */
export function useHeadroom(ref: React.RefObject<HTMLElement | null>, { offset = 140 } = {}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = window.scrollY;
    let hidden = false;
    const reduced = prefersReducedMotion();
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 16);
      const goingDown = y > last + 4;
      const goingUp = y < last - 4;
      if (!reduced) {
        if (goingDown && y > offset && !hidden) { hidden = true; gsap.to(el, { yPercent: -130, duration: 0.45, ease: "power3.in" }); }
        else if ((goingUp || y < offset) && hidden) { hidden = false; gsap.to(el, { yPercent: 0, duration: 0.55, ease: "expo.out" }); }
      }
      last = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ref, offset]);
  return scrolled;
}

/* Thin page-progress line, meant to sit along the bottom edge of a nav bar. */
export function NavProgress() {
  const bar = useRef<HTMLSpanElement>(null);
  useGSAP(() => {
    gsap.to(bar.current, { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });
  });
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-0 h-px overflow-hidden">
      <span ref={bar} className="block h-full origin-left scale-x-0 bg-gradient-to-r from-brand via-brand-2 to-brand-3" />
    </span>
  );
}

/* Full-screen mobile menu with staggered links. */
export function MobileMenu({ items, footer }: { items: NavItem[]; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => { document.documentElement.style.overflow = ""; };
  }, [open]);

  useGSAP(
    () => {
      if (!open || prefersReducedMotion()) return;
      gsap.timeline({ defaults: { ease: "expo.out" } })
        .from(sheet.current, { clipPath: "circle(0% at 92% 4%)", duration: 0.7 })
        .from("[data-mm='link']", { y: 28, opacity: 0, stagger: 0.06, duration: 0.7 }, 0.15)
        .from("[data-mm='foot']", { y: 16, opacity: 0, duration: 0.6 }, 0.35);
    },
    { scope: sheet, dependencies: [open] },
  );

  return (
    <div className="md:hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}
        className="relative z-[95] grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200">
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>
      {open && (
        <div ref={sheet} className="fixed inset-0 z-[90] flex flex-col bg-[#07080b] px-6 pb-10 pt-24 [clip-path:circle(150%_at_92%_4%)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_80%_0%,rgba(129,140,248,0.14),transparent_70%)]" />
          <nav className="relative flex flex-col gap-1">
            {items.map(({ key, label, href }, i) => (
              <a key={key} data-mm="link" href={href} onClick={() => setOpen(false)}
                className="flex items-baseline gap-4 border-b border-white/6 py-4 font-display text-[30px] font-semibold tracking-[-0.03em] text-zinc-100">
                <span className="font-mono text-[12px] font-normal text-zinc-600">0{i + 1}</span>{label}
              </a>
            ))}
          </nav>
          {footer && <div data-mm="foot" className="relative mt-auto" onClick={() => setOpen(false)}>{footer}</div>}
        </div>
      )}
    </div>
  );
}
