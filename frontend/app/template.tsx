import { LogoMark } from "@/components/brand/Logo";

/* Route transition: re-mounts on every navigation. Kept under ~0.5s so a
   click never feels blocked:
   1. the brand mark flashes in the centre of an ink curtain,
   2. a light sweep crosses it,
   3. the curtain lifts away as the new page fades up.
   Pure CSS (see .route-* in globals.css) so a slow script or a background tab
   can never leave the curtain covering the page. Only opacity animates on the
   page wrapper — a transform there would break position:fixed children
   (nav, pinned ScrollTrigger sections, modals). */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div aria-hidden="true" className="route-curtain pointer-events-none fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-ink">
        <div className="route-glow absolute h-[60vmin] w-[60vmin] rounded-full bg-[radial-gradient(closest-side,rgba(129,140,248,0.22),rgba(94,234,212,0.08)_50%,transparent)]" />
        <div className="route-mark relative">
          <LogoMark className="h-14 w-14" />
        </div>
        <div className="route-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-brand via-brand-2 to-brand-3 shadow-[0_0_24px_rgba(129,140,248,0.9)]" />
      </div>
      <div className="route-page flex min-h-full flex-1 flex-col">{children}</div>
    </>
  );
}
