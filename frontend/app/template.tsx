/* Route transition: re-mounts on every navigation. A gradient curtain lifts
   off the page while content fades in. Pure CSS (see .route-curtain in
   globals.css) so a slow script or a background tab can never leave the
   curtain covering the page. Only opacity animates on the wrapper — a
   transform there would break position:fixed children (nav, pinned
   ScrollTrigger sections, modals). */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div aria-hidden="true" className="route-curtain pointer-events-none fixed inset-0 z-[100] bg-ink">
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-brand via-brand-2 to-brand-3 shadow-[0_0_24px_rgba(129,140,248,0.9)]" />
      </div>
      <div className="route-page flex min-h-full flex-1 flex-col">{children}</div>
    </>
  );
}
