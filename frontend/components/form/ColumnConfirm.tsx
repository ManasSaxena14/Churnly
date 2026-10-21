"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RotateCw, XCircle } from "lucide-react";
import { API_BASE } from "@/lib/demo";
import { cn } from "@/lib/utils";

export type Role = "churn" | "tenure" | "customer_id" | "usage" | "support" | "plan" | "contract" | "channel";
export type ColumnMapping = Partial<Record<Role, string | null>>;

interface ColumnProfile { name: string; dtype: "number" | "text" | "bool"; unique: number; nulls: number; sample: string[] }
interface Inspection {
  file_path: string;
  columns: ColumnProfile[];
  roles: { role: Role; label: string; required: boolean }[];
  detected: ColumnMapping;
  resolved: ColumnMapping;
  errors: string[];
  warnings: string[];
  summary: { rows: number; columns: number; churn_rate?: number; tenure_min?: number; tenure_max?: number; churn_needs_normalizing?: boolean };
}

export type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "error"; message: string }
  | { status: "ready"; filePath: string; inspection: Inspection; mapping: ColumnMapping; checking: boolean };

/* Upload the CSV as soon as it's attached and ask the backend what it sees.
   The confirmed mapping travels with /analyze as `column_mapping`. */
export function useColumnInspection(file: File | null) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const reqId = useRef(0);

  const inspect = useCallback(async (filePath: string, mapping?: ColumnMapping): Promise<Inspection> => {
    const res = await fetch(`${API_BASE}/columns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: filePath, mapping }),
    });
    if (!res.ok) {
      const detail = await res.json().then((d) => d?.detail).catch(() => null);
      throw new Error(detail || `Column check failed (HTTP ${res.status})`);
    }
    return res.json();
  }, []);

  const start = useCallback(async () => {
    if (!file) return;
    const id = ++reqId.current;
    setState({ status: "uploading" });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch(`${API_BASE}/upload`, { method: "POST", body: fd });
      if (!up.ok) {
        const detail = await up.json().then((d) => d?.detail).catch(() => null);
        throw new Error(detail || "We couldn't upload your file. Please check the server is running and try again.");
      }
      const { file_path } = await up.json();
      const inspection = await inspect(file_path);
      if (id !== reqId.current) return;
      setState({ status: "ready", filePath: file_path, inspection, mapping: inspection.resolved, checking: false });
    } catch (err) {
      if (id !== reqId.current) return;
      const message = err instanceof TypeError ? `We can't reach the Churnly server (${API_BASE}). Please make sure it's running.` : (err as Error).message;
      setState({ status: "error", message });
    }
  }, [file, inspect]);

  useEffect(() => {
    if (!file) {
      reqId.current++;
      return;
    }
    // Kick off once per attached file; the effect owns this async request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    start();
  }, [file, start]);

  const setRole = useCallback(async (role: Role, column: string | null) => {
    if (state.status !== "ready") return;
    const mapping = { ...state.mapping, [role]: column };
    const id = ++reqId.current;
    setState({ ...state, mapping, checking: true });
    try {
      const inspection = await inspect(state.filePath, mapping);
      if (id !== reqId.current) return;
      setState({ status: "ready", filePath: state.filePath, inspection, mapping, checking: false });
    } catch (err) {
      if (id !== reqId.current) return;
      setState({ status: "error", message: (err as Error).message });
    }
  }, [state, inspect]);

  return { state: file ? state : ({ status: "idle" } as UploadState), retry: start, setRole };
}

const pct = (n?: number) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

export function ColumnConfirm({
  state, onRetry, onSetRole,
}: {
  state: UploadState; onRetry: () => void; onSetRole: (role: Role, column: string | null) => void;
}) {
  if (state.status === "idle") return null;

  if (state.status === "uploading") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4 text-[13.5px] text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin text-brand" /> Uploading and reading your columns…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.05] px-5 py-4 text-[13.5px] text-red-200">
        <XCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
        <span className="flex-1">{state.message}</span>
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1 text-[12px] text-zinc-200 hover:border-white/25">
          <RotateCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  const { inspection, mapping, checking } = state;
  const byName = Object.fromEntries(inspection.columns.map((c) => [c.name, c]));
  const ok = inspection.errors.length === 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-white/6 px-5 py-3.5">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-zinc-50">
          {checking ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : ok ? <CheckCircle2 className="h-4 w-4 text-brand" /> : <XCircle className="h-4 w-4 text-red-400" />}
          Confirm what each column means
        </span>
        <span className="tnum font-mono text-[11.5px] text-zinc-500">
          {inspection.summary.rows.toLocaleString()} rows · {inspection.summary.columns} columns
          {inspection.summary.churn_rate != null && <> · churn {pct(inspection.summary.churn_rate)}</>}
          {inspection.summary.tenure_max != null && <> · tenure {inspection.summary.tenure_min}–{inspection.summary.tenure_max}</>}
        </span>
      </div>

      <div className="grid gap-x-5 gap-y-3 px-5 py-4 sm:grid-cols-2">
        {inspection.roles.map(({ role, label, required }) => {
          const value = mapping[role] ?? "";
          const changed = (inspection.detected[role] ?? "") !== value;
          const col = value ? byName[value] : null;
          return (
            <label key={role} className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[12px] text-zinc-400">
                {label}
                {required && <span className="text-brand">*</span>}
                {changed && <span className="rounded-full bg-violet-400/10 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.1em] text-violet-300">edited</span>}
                {!changed && value && <span className="rounded-full bg-brand/10 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.1em] text-brand">auto</span>}
              </span>
              <select
                value={value}
                onChange={(e) => onSetRole(role, e.target.value || null)}
                className={cn(
                  "h-10 rounded-xl border bg-ink px-3 text-[13.5px] text-zinc-100 outline-none transition-colors focus:border-brand/60",
                  required && !value ? "border-red-500/40" : "border-white/10",
                )}
              >
                <option value="">— not in this file —</option>
                {inspection.columns.map((c) => (
                  <option key={c.name} value={c.name}>{c.name} ({c.dtype}, {c.unique} values)</option>
                ))}
              </select>
              {col && (
                <span className="truncate font-mono text-[10.5px] text-zinc-600">e.g. {col.sample.join(", ")}</span>
              )}
            </label>
          );
        })}
      </div>

      {(inspection.errors.length > 0 || inspection.warnings.length > 0 || inspection.summary.churn_needs_normalizing) && (
        <div className="flex flex-col gap-1.5 border-t border-white/6 px-5 py-3.5 text-[12.5px]">
          {inspection.errors.map((e) => (
            <div key={e} className="flex items-start gap-2 text-red-300"><XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {e}</div>
          ))}
          {inspection.warnings.map((w) => (
            <div key={w} className="flex items-start gap-2 text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {w}</div>
          ))}
          {inspection.summary.churn_needs_normalizing && ok && (
            <div className="flex items-start gap-2 text-zinc-400"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand" /> Yes/no values will be converted automatically.</div>
          )}
        </div>
      )}
    </div>
  );
}
