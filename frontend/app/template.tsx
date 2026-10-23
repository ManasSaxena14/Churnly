/* Route transition: re-mounts on every navigation and fades the new page in
   (paired with the top loading bar in RouteProgress). Pure CSS, and only
   opacity animates — a transform here would break position:fixed children
   (nav, pinned ScrollTrigger sections, modals). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-page flex min-h-full flex-1 flex-col">{children}</div>;
}
