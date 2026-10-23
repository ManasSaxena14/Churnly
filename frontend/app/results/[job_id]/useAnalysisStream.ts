"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { API_BASE, PIPELINE_STEPS, derivePipelineState } from "./lib";
import { fetchCachedDemo } from "@/lib/demo";
import type { RunMetrics } from "./types";

export type ConnectionStatus = "connecting" | "connected" | "complete" | "error" | "cancelled";
export interface ErrorInfo { type?: string; message?: string; lastNode?: string }
export interface ForensicProgress { run: number; total: number; status: "started" | "completed" | "failed" }
export interface RetryInfo { iteration: number; max: number; verdict: string; reason: string; weakPoints: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StagesData = Record<string, any>;

interface Snapshot {
  stagesData?: StagesData;
  connectionStatus?: string;
  errorInfo?: ErrorInfo | null;
  hitlSubmitted?: boolean;
  jobStartTs?: number;
  // eventKey (SSE event type) → backend ts_ms when that stage completed.
  stageEventTs?: Record<string, number>;
  metrics?: RunMetrics | null;
}

/* SSE — survives page refresh.
   Persistence model:
     - Every event mutates sessionStorage `job_${jobId}` with the latest
       stagesData + connectionStatus + errorInfo + hitlSubmitted + stageEventTs.
     - On mount we restore the snapshot first. If status is terminal
       (complete / error / cancelled) we never open a new SSE — backend
       has already cleaned up and would 404.
     - If status is non-terminal, we open SSE; the backend broadcasts the full
       event history from cursor 0, so a refresh replays everything.

   Stage durations come from each event's backend `ts_ms` (fixed wall-clock),
   NOT from client arrival time. That's the whole point: on a refresh the
   server replays the entire history in one burst, so client arrival times all
   collapse to ~now — using ts_ms keeps every duration correct across refreshes. */
export function useAnalysisStream(jobId: string) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [stagesData, setStagesData] = useState<StagesData>({});
  const [hitlSubmitted, setHitlSubmitted] = useState(false);
  const [forensicProgress, setForensicProgress] = useState<ForensicProgress | null>(null);
  const [retryInfo, setRetryInfo] = useState<RetryInfo | null>(null);
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const isDemo = jobId === "demo";

  // Backend completion timestamp per stage event; durations derived from these.
  const [jobStartTs, setJobStartTs] = useState<number | null>(null);
  const [stageEventTs, setStageEventTs] = useState<Record<string, number>>({});
  const [now, setNow] = useState<number>(() => Date.now());

  const sseRef = useRef<EventSource | null>(null);
  // Cache latest snapshot pieces in refs so writeSnapshot() (called from SSE
  // handlers) always writes the freshest combined state, regardless of React
  // setState batching.
  const stagesDataRef = useRef<StagesData>({});
  const hitlSubmittedRef = useRef(false);

  const writeSnapshot = (patch: Snapshot) => {
    try {
      const existing = sessionStorage.getItem(`job_${jobId}`);
      const prev = existing ? JSON.parse(existing) : {};
      sessionStorage.setItem(`job_${jobId}`, JSON.stringify({ ...prev, ...patch }));
    } catch { /* quota or serialization — non-fatal */ }
  };

  const markHitlSubmitted = () => {
    setHitlSubmitted(true);
    hitlSubmittedRef.current = true;
    writeSnapshot({ hitlSubmitted: true });
  };

  const markCancelled = () => {
    setConnectionStatus((prev) => (prev === "cancelled" || prev === "complete") ? prev : "cancelled");
  };

  useEffect(() => {
    if (!jobId) return;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(`job_${jobId}`); } catch { /* storage blocked */ }
    let restoredStatus: ConnectionStatus | null = null;
    let snap: Snapshot | null = null;
    if (saved) {
      try {
        snap = JSON.parse(saved) as Snapshot;
        if (snap.stagesData) stagesDataRef.current = snap.stagesData;
        if (snap.hitlSubmitted) hitlSubmittedRef.current = true;
        if (snap.connectionStatus === "complete" || snap.connectionStatus === "error" || snap.connectionStatus === "cancelled") {
          restoredStatus = snap.connectionStatus;
        }
      } catch { snap = null; }
    }
    // Apply the restored snapshot in one microtask (not synchronously in the
    // effect body), then decide below whether a live SSE is still needed.
    if (snap) {
      const p = snap;
      const rs = restoredStatus;
      queueMicrotask(() => {
        if (p.stagesData) setStagesData(p.stagesData);
        if (p.hitlSubmitted) setHitlSubmitted(true);
        if (p.errorInfo) setErrorInfo(p.errorInfo);
        // Restore stage timing (ts_ms per event + job start) so durations
        // survive refresh instead of resetting to 0s.
        if (typeof p.jobStartTs === "number") setJobStartTs(p.jobStartTs);
        if (p.stageEventTs) setStageEventTs(p.stageEventTs);
        if (p.metrics) setMetrics(p.metrics);
        if (rs) setConnectionStatus(rs);
      });
    }
    // Terminal state already cached — skip SSE so we don't 404 into a fake error.
    if (restoredStatus) return;

    let closeSource = () => {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleEvent = (event: any) => {
      const evTs = typeof event.ts_ms === "number" ? event.ts_ms : Date.now();

      // Seed the job timer from the first event's backend timestamp.
      setJobStartTs((prev) => {
        if (prev != null) return prev;
        writeSnapshot({ jobStartTs: evTs });
        return evTs;
      });

      if (event.type === "run_metrics") {
        setMetrics(event.data ?? null);
        writeSnapshot({ metrics: event.data ?? null });
        return;
      }

      // Interim progress events — not stages, don't store in stagesData.
      if (event.type === "forensic_progress") {
        setForensicProgress({
          run: event.data?.run ?? 0,
          total: event.data?.total ?? 3,
          status: event.data?.status ?? "started",
        });
        return;
      }
      if (event.type === "critic_retry_started") {
        const info: RetryInfo = {
          iteration: Number(event.data?.iteration ?? 1),
          max: Number(event.data?.max ?? 2),
          verdict: String(event.data?.verdict ?? "low_lift"),
          reason: String(event.data?.reason ?? ""),
          weakPoints: Number(event.data?.weak_points_count ?? 0),
        };
        setRetryInfo(info);
        const summary = info.verdict === "violation"
          ? `Critic flagged constraint violations — agents revising (pass ${info.iteration + 1}/${info.max})`
          : `Critic flagged low lift — agents revising (${info.weakPoints} weak points)`;
        toast(summary, { icon: "↻", duration: 6000 });
        return;
      }

      if (event.type === "cancelled") {
        setConnectionStatus("cancelled");
        writeSnapshot({ connectionStatus: "cancelled" });
        toast("Analysis cancelled.", { icon: "■", duration: 4000 });
        closeSource();
        return;
      }

      if (event.type === "error") {
        const errInfo: ErrorInfo = {
          type: event.data?.error_type,
          message: event.data?.error_message,
          lastNode: event.data?.last_node,
        };
        setErrorInfo(errInfo);
        setConnectionStatus("error");
        writeSnapshot({ connectionStatus: "error", errorInfo: errInfo });
        toast.error(`Analysis failed at ${event.data?.last_node || "unknown stage"}.`, { duration: 8000 });
        closeSource();
        return;
      }

      // Record the stage completion timestamp (first occurrence wins, so
      // replay on refresh keeps the original backend time).
      setStageEventTs((prev) => {
        if (prev[event.type] !== undefined) return prev;
        const next = { ...prev, [event.type]: evTs };
        writeSnapshot({ stageEventTs: next });
        return next;
      });

      setStagesData((prev) => {
        const updated = { ...prev, [event.type]: event.data };
        stagesDataRef.current = updated;
        writeSnapshot({
          stagesData: updated,
          hitlSubmitted: hitlSubmittedRef.current,
          connectionStatus: event.type === "complete" ? "complete" : "connected",
        });
        return updated;
      });
      if (event.type === "complete") { setConnectionStatus("complete"); closeSource(); }
    };

    // Cached demo: replay a recorded run with compressed timing, no backend
    // job involved. HITL questions are shown as answered automatically.
    if (isDemo) {
      let cancelled = false;
      const timers: ReturnType<typeof setTimeout>[] = [];
      closeSource = () => {};
      fetchCachedDemo().then((run) => {
        if (cancelled) return;
        setConnectionStatus("connected");
        if (!run) {
          const errInfo: ErrorInfo = { type: "DemoUnavailable", message: "No cached demo run has been recorded yet." };
          setErrorInfo(errInfo);
          setConnectionStatus("error");
          return;
        }
        const events = run.events;
        const t0 = events[0]?.ts_ms ?? 0;
        const tEnd = events[events.length - 1]?.ts_ms ?? t0;
        const span = Math.max(1, tEnd - t0);
        const replayMs = 6500; // whole run in ~6.5s
        const base = Date.now();
        events.forEach((ev) => {
          const at = ev.ts_ms != null ? ((ev.ts_ms - t0) / span) * replayMs : 0;
          timers.push(setTimeout(() => {
            if (cancelled) return;
            // Re-stamp onto "now" so stage timers show the compressed replay.
            handleEvent({ ...ev, ts_ms: base + at });
            if (ev.type === "hitl_questions_ready") {
              hitlSubmittedRef.current = true;
              setHitlSubmitted(true);
            }
          }, at));
        });
      });
      return () => { cancelled = true; timers.forEach(clearTimeout); };
    }

    const sse = new EventSource(`${API_BASE}/analyze/stream/${jobId}`, { withCredentials: true });
    sseRef.current = sse;
    closeSource = () => { sse.close(); sseRef.current = null; };
    sse.onopen = () => setConnectionStatus("connected");
    sse.onmessage = (e) => {
      try {
        handleEvent(JSON.parse(e.data));
      } catch (err) { console.error("SSE parse error:", err); }
    };
    // EventSource auto-reconnects on transient drops; only declare error after
    // repeated failures AND only if the cached snapshot isn't already usable.
    let errorCount = 0;
    sse.onerror = () => {
      errorCount++;
      if (errorCount >= 5) {
        sse.close();
        sseRef.current = null;
        if (stagesDataRef.current?.solution_ready || stagesDataRef.current?.complete) {
          setConnectionStatus("complete");
          writeSnapshot({ connectionStatus: "complete" });
          return;
        }
        const errInfo: ErrorInfo = { type: "ConnectionLost", message: "Lost connection to backend after multiple retries." };
        setErrorInfo(errInfo);
        setConnectionStatus("error");
        writeSnapshot({ connectionStatus: "error", errorInfo: errInfo });
      }
    };
    return () => { sse.close(); sseRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  /* Live tick while job runs (timers show whole seconds, so 1s is enough);
     stops once the run ends for any reason. */
  useEffect(() => {
    if (connectionStatus === "complete" || connectionStatus === "error" || connectionStatus === "cancelled") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [connectionStatus]);

  const complete = connectionStatus === "complete";
  const pipelineState = useMemo(
    () => derivePipelineState(stagesData, hitlSubmitted, complete),
    [stagesData, hitlSubmitted, complete],
  );

  /* Derive per-stage [start, end] from backend event timestamps.
     Each stage's END = its completion event's ts_ms. Its START = the previous
     completed stage's ts_ms (or the job start). The active (not-yet-done) stage
     gets a start but no end, so the Sidebar ticks it against `now`. Pending
     stages get nothing. All refresh-proof because ts_ms is fixed server-side. */
  const { stageStartTs, stageEndTs } = useMemo(() => {
    const start: Record<string, number> = {};
    const end: Record<string, number> = {};
    let prevTs = jobStartTs ?? undefined;
    for (const step of PIPELINE_STEPS) {
      const evTs = stageEventTs[step.key];
      if (evTs !== undefined) {
        if (prevTs !== undefined) start[step.id] = prevTs;
        end[step.id] = evTs;
        prevTs = evTs;
      } else if (pipelineState[step.id] === "active") {
        if (prevTs !== undefined) start[step.id] = prevTs;
        // no end → ticks with `now`
      }
      // pending → no start, no timer shown
    }
    return { stageStartTs: start, stageEndTs: end };
  }, [stageEventTs, jobStartTs, pipelineState]);

  return {
    connectionStatus, errorInfo, stagesData, pipelineState, complete,
    hitlSubmitted, markHitlSubmitted, markCancelled,
    forensicProgress, retryInfo, metrics, isDemo,
    jobStartTs, stageStartTs, stageEndTs, now,
  };
}
