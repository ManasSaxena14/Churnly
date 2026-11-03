"use client";

import { useEffect, useState } from "react";
import { Loader2, ServerCrash } from "lucide-react";
import { backendReady, getBackendStatus, onBackendStatus, type BackendStatus } from "@/lib/backend";
import { cn } from "@/lib/utils";

/* Wakes the API on every page load and, while it's starting (free hosting
   sleeps when idle), explains the short wait instead of letting things fail. */
export function BackendNotice() {
  const [status, setStatus] = useState<BackendStatus>(getBackendStatus);

  useEffect(() => {
    const off = onBackendStatus(setStatus);
    backendReady();
    return off;
  }, []);

  const show = status === "waking" || status === "down";
  return (
    <div aria-live="polite" className={cn(
      "pointer-events-none fixed left-1/2 top-4 z-[130] -translate-x-1/2 transition-all duration-500",
      show ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0",
    )}>
      {show && (
        <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-white/10 bg-[#0d0f14] px-4 py-2.5 text-[12.5px] text-zinc-300 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)]">
          {status === "waking" ? (
            <>
              <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-brand" />
              <span><span className="font-medium text-zinc-100">Starting the analysis server…</span> it sleeps when idle on free hosting, so this takes up to a minute.</span>
            </>
          ) : (
            <>
              <ServerCrash className="h-4 w-4 flex-shrink-0 text-amber-300" />
              <span>The analysis server isn&apos;t responding.</span>
              <button type="button" onClick={() => backendReady(true)} className="rounded-full border border-white/15 px-2.5 py-0.5 text-zinc-100 hover:border-brand/50">Retry</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
