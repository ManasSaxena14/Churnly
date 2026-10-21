"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { fetchCachedDemo, primeDemoContext, primeLiveDemo } from "./demo";

/* "Try the demo": replay the cached run instantly if one has been promoted,
   otherwise pre-fill the form with demo answers + the bundled CSV for a live
   run (which needs the backend and API keys). */
export function useStartDemo() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const start = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const cached = await fetchCachedDemo();
      if (cached) {
        sessionStorage.removeItem("job_demo"); // replay from scratch every time
        primeDemoContext();
        router.push("/results/demo");
        return;
      }
      primeLiveDemo();
      toast("No cached demo yet — running live on the sample dataset.", { icon: "▶", duration: 4000 });
      router.push("/form");
    } catch (err) {
      console.error("Demo init failed:", err);
      setLoading(false);
    }
  };

  return { start, loading };
}
