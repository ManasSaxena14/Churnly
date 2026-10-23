"use client";

import { useParams } from "next/navigation";
import { RequireAuth } from "@/lib/auth";

/* Results need an account, except the cached demo, which anyone can explore. */
export default function Layout({ children }: { children: React.ReactNode }) {
  const { job_id } = useParams<{ job_id: string }>();
  return <RequireAuth allowAnonymous={job_id === "demo"}>{children}</RequireAuth>;
}
