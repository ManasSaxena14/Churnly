"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_BASE } from "./demo";

/* Session state for the whole app. The session itself is an HttpOnly cookie
   set by the backend (app/auth.py) — this context only mirrors who is
   logged in; it never sees or stores the token. */

export interface User { id: string; email: string; name: string; created_at: number }
type Status = "loading" | "authed" | "anon";

interface AuthCtx {
  user: User | null;
  status: Status;
  login: (email: string, password: string) => Promise<User>;
  signup: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** true between "Log out" and the redirect home, so guards don't bounce to /login */
  signingOut: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function post(path: string, body?: unknown): Promise<{ user?: User }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AuthError(0, "Can't reach the server. Is the backend running?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AuthError(res.status, typeof data?.detail === "string" ? data.detail : "Something went wrong. Try again.");
  return data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/auth/me`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setUser(d?.user ?? null); setStatus(d?.user ? "authed" : "anon"); } })
      .catch(() => { if (alive) setStatus("anon"); });
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u } = await post("/auth/login", { email, password });
    setUser(u!); setStatus("authed");
    return u!;
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const { user: u } = await post("/auth/signup", { name, email, password });
    setUser(u!); setStatus("authed");
    return u!;
  }, []);

  const logout = useCallback(async () => {
    setSigningOut(true);
    await post("/auth/logout").catch(() => {});
    setUser(null); setStatus("anon");
    // Hard navigation home: clears any per-user state held in memory.
    window.location.assign("/");
  }, []);

  const value = useMemo(() => ({ user, status, login, signup, logout, signingOut }), [user, status, login, signup, logout, signingOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/* Sends anonymous visitors to /login?next=<this page>. Renders nothing until
   the session check finishes, so protected pages never flash for a logged-out user. */
export function RequireAuth({ children, allowAnonymous = false }: { children: React.ReactNode; allowAnonymous?: boolean }) {
  const { status, signingOut } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (status === "anon" && !allowAnonymous && !signingOut) {
      const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : path;
      router.replace(`/login?next=${encodeURIComponent(next || "/dashboard")}`);
    }
  }, [status, allowAnonymous, signingOut, router, path]);

  if (allowAnonymous) return <>{children}</>;
  if (status !== "authed") {
    return (
      <div className="grid min-h-screen place-items-center bg-ink">
        <span className="relative h-1 w-32 overflow-hidden rounded-full bg-white/[0.06]">
          <span className="absolute inset-y-0 w-1/3 animate-[scan_1.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-brand to-transparent" />
        </span>
      </div>
    );
  }
  return <>{children}</>;
}

/** Only allow same-site relative redirects after login (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/login") || next.startsWith("/signup")) return fallback;
  return next;
}

export function initials(name?: string | null): string {
  return (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}
