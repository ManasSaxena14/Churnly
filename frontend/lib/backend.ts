"use client";

import { API_BASE } from "./demo";

/* Backend availability. On free hosting the API sleeps when idle and needs
   ~30–60 s to wake. Instead of failing during that window, requests wait for
   it: the first page load pings /healthz (which also starts the wake-up), the
   UI shows a notice while it's waking, and requests retry once if the server
   drops mid-way. */

export type BackendStatus = "checking" | "waking" | "ready" | "down";

const WAKE_TIMEOUT_MS = 120_000;
const PING_TIMEOUT_MS = 6_000;

let status: BackendStatus = "checking";
let ready: Promise<boolean> | null = null;
const listeners = new Set<(s: BackendStatus) => void>();

function setStatus(s: BackendStatus) {
  if (s === status) return;
  status = s;
  listeners.forEach((l) => l(s));
}

export function getBackendStatus(): BackendStatus {
  return status;
}

export function onBackendStatus(l: (s: BackendStatus) => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

async function ping(): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/healthz`, { cache: "no-store", signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/* Resolves true once the API answers (false after ~2 minutes). Shared, so
   every caller waits on the same wake-up instead of each polling. */
export function backendReady(force = false): Promise<boolean> {
  if (status === "ready" && !force) return Promise.resolve(true);
  if (ready && !force) return ready;
  ready = (async () => {
    const start = Date.now();
    let first = true;
    while (Date.now() - start < WAKE_TIMEOUT_MS) {
      if (await ping()) { setStatus("ready"); return true; }
      if (first) { setStatus("waking"); first = false; }
      await new Promise((r) => setTimeout(r, 2500));
    }
    setStatus("down");
    ready = null; // let a later action try again
    return false;
  })();
  return ready;
}

const RETRYABLE = new Set([502, 503, 504]);

/* fetch() for API calls: waits for the server to be awake, and if it drops
   (network error or a 502/503/504 while it restarts) waits and retries once. */
export async function backendFetch(input: string, init?: RequestInit): Promise<Response> {
  await backendReady();
  try {
    const res = await fetch(input, init);
    if (!RETRYABLE.has(res.status)) return res;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
  }
  setStatus("waking");
  if (!(await backendReady(true))) throw new TypeError("The analysis server isn't responding. Please try again in a minute.");
  return fetch(input, init);
}
