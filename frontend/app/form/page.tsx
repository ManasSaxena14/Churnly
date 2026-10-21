"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Upload, ChevronLeft, FileSpreadsheet, X, Check, Loader2, ArrowRight, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { Logo } from "@/components/brand/Logo";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { API_BASE } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { ColumnConfirm, useColumnInspection } from "@/components/form/ColumnConfirm";
import { LaunchOverlay, type LaunchStage } from "@/components/form/LaunchOverlay";

/* ─── types ────────────────────────────────────────────────────── */

interface FormData {
  businessContext: string;
  csvFile: File | null;
  churnDefinition: string;
  churnDefinitionOther: string;
  churnInactivityDays: string;
  businessModel: string;
  typicalCustomer: string;
  companyStage: string;
  revenueModel: string;
  pricingFlexibility: string[];
  coreFeatures: string;
  canShipChanges: string;
  hasCompletionPoint: string;
  topChannels: string[];
  topCompetitors: string;
  churnDestination: string;
  supportModel: string;
  retentionTactics: string[];
  prioritySegment: string;
  prioritySegmentOther: string;
  topGoal: string;
  timeline: string;
  anythingElse: string;
  analysisDepth: string;
}

const INITIAL: FormData = {
  businessContext: "", csvFile: null, churnDefinition: "", churnDefinitionOther: "",
  churnInactivityDays: "", businessModel: "", typicalCustomer: "", companyStage: "",
  revenueModel: "", pricingFlexibility: [], coreFeatures: "", canShipChanges: "",
  hasCompletionPoint: "", topChannels: [], topCompetitors: "", churnDestination: "",
  supportModel: "", retentionTactics: [], prioritySegment: "", prioritySegmentOther: "",
  topGoal: "", timeline: "", anythingElse: "", analysisDepth: "quick",
};

const STEPS = [
  { label: "About & Data", why: "Your CSV feeds the stats engine — survival curves, hazard ratios and corrected significance tests run before any LLM call. Confirm the column roles: a wrong churn column silently poisons every number downstream." },
  { label: "Business & Revenue", why: "Picks the playbook priors and filters out interventions your pricing can't support." },
  { label: "Product & Market", why: "Grounds every agent in what you actually ship and who you lose to." },
  { label: "Ops & Goals", why: "Removes tactics you can't staff or have already tried, and sets the metric to optimise." },
  { label: "Final", why: "Quick runs the fast models end-to-end. Deep triples the diagnosis vote and adds a reasoning pass." },
];

/* ─── sub-components ───────────────────────────────────────────── */

function QuestionTitle({ children, required = true }: { children: React.ReactNode; required?: boolean }) {
  return (
    <h2 data-step-item className="mb-2 flex flex-wrap items-center gap-1 font-display text-[22px] font-semibold leading-[1.3] tracking-[-0.02em] text-zinc-50">
      {children}
      {required && <span className="ml-0.5 text-[18px] leading-none text-brand">*</span>}
    </h2>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p data-step-item className="mb-6 text-[14px] leading-[1.7] text-zinc-400">{children}</p>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p data-step-item className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">{children}</p>;
}

function Divider() {
  return <div className="my-10 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />;
}

function OptionGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <div data-step-item className={cn("grid gap-2", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3")}>
      {children}
    </div>
  );
}

function OptionCard({
  label, sublabel, selected, onClick, kind = "radio", disabled,
}: {
  label: string; sublabel?: string; selected: boolean; onClick: () => void; kind?: "radio" | "check"; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !selected}
      aria-pressed={selected}
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-[14px] transition-all duration-200 active:scale-[0.98]",
        selected
          ? "border-brand/50 bg-brand/[0.07] text-zinc-50 shadow-[0_0_0_1px_rgba(94,234,212,0.15),0_8px_30px_-12px_rgba(94,234,212,0.35)]"
          : disabled
            ? "cursor-not-allowed border-white/5 text-zinc-600"
            : "border-white/8 bg-white/[0.015] text-zinc-300 hover:-translate-y-px hover:border-white/16 hover:bg-white/[0.035]",
      )}
    >
      <span
        className={cn(
          "mt-[2px] grid h-[18px] w-[18px] flex-shrink-0 place-items-center border-[1.5px] transition-all duration-200",
          kind === "radio" ? "rounded-full" : "rounded-[5px]",
          selected ? "border-brand bg-brand" : "border-zinc-600 group-hover:border-zinc-400",
        )}
      >
        {selected && (kind === "radio"
          ? <span className="h-[6px] w-[6px] rounded-full bg-ink" />
          : <Check className="h-[11px] w-[11px] text-ink" strokeWidth={3} />)}
      </span>
      <span className="leading-[1.4]">
        {label}
        {sublabel && <span className="mt-0.5 block text-[12.5px] text-zinc-500">{sublabel}</span>}
      </span>
    </button>
  );
}

const INPUT_CLS =
  "rounded-xl border-white/10 bg-white/[0.03] text-[14px] text-zinc-50 placeholder:text-zinc-600 transition-colors focus-visible:border-brand/50 focus-visible:ring-0";

function NextBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <div data-step-item className="mt-14 flex justify-end">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "group inline-flex h-12 items-center gap-2 rounded-full px-7 text-[14px] font-semibold transition-all duration-300",
          !disabled ? "bg-zinc-50 text-ink hover:scale-[1.03]" : "cursor-not-allowed bg-white/[0.05] text-zinc-600",
        )}
      >
        {children}
      </button>
    </div>
  );
}

/* ─── main ─────────────────────────────────────────────────────── */

export default function FormPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const router = useRouter();
  const [maxStep, setMaxStep] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const total = STEPS.length;

  // Load saved state if available. If the landing page primed a demo run
  // (demo_csv_url present), also fetch the bundled CSV and attach it as a
  // File so the user doesn't need to re-upload.
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const saved = sessionStorage.getItem("latest_form_state");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setForm({ ...parsed, csvFile: null });
          setMaxStep(STEPS.length - 1);
        } catch (err) {
          console.error("Failed to load saved form state", err);
        }
      }

      const demoUrl = sessionStorage.getItem("demo_csv_url");
      const demoName = sessionStorage.getItem("demo_csv_name") || "demo.csv";
      if (demoUrl) {
        try {
          const res = await fetch(demoUrl);
          if (!res.ok) throw new Error(`fetch ${demoUrl} ${res.status}`);
          const blob = await res.blob();
          const file = new File([blob], demoName, { type: "text/csv" });
          if (!cancelled) {
            setForm((p) => ({ ...p, csvFile: file }));
            setMaxStep(STEPS.length - 1);
          }
        } catch (err) {
          console.error("Demo CSV hydrate failed:", err);
        } finally {
          // Single-shot: clear so a user navigating back to the form
          // organically doesn't get auto-filled forever.
          sessionStorage.removeItem("demo_csv_url");
          sessionStorage.removeItem("demo_csv_name");
        }
      }
    };
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Upload + column detection as soon as a CSV is attached (confirm step).
  const columnsCheck = useColumnInspection(form.csvFile);
  const upload = columnsCheck.state;
  const columnsReady = upload.status === "ready" && !upload.checking && upload.inspection.errors.length === 0;

  // Step transition: direction-aware — forward slides in from the right,
  // back from the left, with a blur that resolves as items settle.
  const prevStepRef = useRef(0);
  useGSAP(
    () => {
      const dir = step >= prevStepRef.current ? 1 : -1;
      prevStepRef.current = step;
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        "[data-step-item]",
        { x: 36 * dir, opacity: 0, filter: "blur(6px)" },
        { x: 0, opacity: 1, filter: "blur(0px)", duration: 0.7, ease: "expo.out", stagger: 0.03, overwrite: true, clearProps: "filter,transform" },
      );
    },
    { scope: panelRef, dependencies: [step] },
  );

  // Background light drifts slowly behind the form.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.utils.toArray<HTMLElement>("[data-aurora]").forEach((el, i) => {
        gsap.to(el, {
          xPercent: gsap.utils.random(-20, 20), yPercent: gsap.utils.random(-15, 15), scale: gsap.utils.random(0.9, 1.2),
          duration: gsap.utils.random(10, 15), ease: "sine.inOut", repeat: -1, yoyo: true, delay: i,
        });
      });
    },
    { scope: shellRef },
  );

  useGSAP(
    () => {
      gsap.to("[data-rail='fill']", { scaleY: (step + 1) / total, duration: 0.8, ease: "expo.out" });
      gsap.to("[data-rail='bar']", { scaleX: (step + 1) / total, duration: 0.8, ease: "expo.out" });
    },
    { scope: shellRef, dependencies: [step] },
  );

  const set = useCallback(<K extends keyof FormData>(k: K, v: FormData[K]) => setForm((p) => ({ ...p, [k]: v })), []);
  const toggle = useCallback((k: "pricingFlexibility" | "topChannels" | "retentionTactics", item: string) => {
    setForm((p) => { const a = p[k]; return { ...p, [k]: a.includes(item) ? a.filter((x) => x !== item) : [...a, item] }; });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.endsWith(".csv") || f?.type === "text/csv") set("csvFile", f); }, [set]);
  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) set("csvFile", f); }, [set]);

  const canNext = (): boolean => {
    switch (step) {
      case 0: return form.csvFile !== null && columnsReady && form.churnDefinition !== "";
      case 1: return form.businessModel !== "" && form.typicalCustomer !== "" && form.companyStage !== "" && form.revenueModel !== "" && form.pricingFlexibility.length > 0;
      case 2: return form.coreFeatures.trim() !== "" && form.canShipChanges !== "" && form.hasCompletionPoint !== "" && form.topChannels.length > 0 && form.topCompetitors.trim() !== "" && form.churnDestination !== "";
      case 3: return form.supportModel !== "" && form.retentionTactics.length > 0 && form.prioritySegment !== "" && form.topGoal !== "" && form.timeline !== "";
      case 4: return true;
      default: return false;
    }
  };

  const scroll0 = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const go = (t: number) => { setStep(t); scroll0(); };
  const next = () => { if (step < total - 1 && canNext()) { const n = step + 1; setStep(n); setMaxStep((p) => Math.max(p, n)); scroll0(); } };
  const prev = () => { if (step > 0) { setStep(step - 1); scroll0(); } };

  const [launchStage, setLaunchStage] = useState<LaunchStage | null>(null);

  const submit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLaunchStage("upload");
    setSubmitting(true);

    let resolvedCsvPath = form.csvFile?.name ?? "";
    // Already uploaded during the confirm step — reuse it with the confirmed mapping.
    const confirmed = upload.status === "ready" ? upload : null;

    try {
      if (confirmed) resolvedCsvPath = confirmed.filePath;
      // 1. Upload file if it wasn't uploaded during the confirm step
      if (form.csvFile && !confirmed) {
        const formData = new FormData();
        formData.append("file", form.csvFile);

        const uploadRes = await fetch(`${API_BASE}/upload`, {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const detail = await uploadRes.json().then((d) => d?.detail).catch(() => null);
          throw new Error(detail || "Failed to upload CSV file. Please make sure backend is running.");
        }
        const uploadData = await uploadRes.json();
        resolvedCsvPath = uploadData.file_path;
      }

      if (form.csvFile) {
        // Stash the raw CSV so "Rerun" on the results page can re-upload it.
        // The server temp file doesn't survive a restart / Render spin-down,
        // and the results page has no File object to re-send.
        try {
          const text = await form.csvFile.text();
          if (text.length < 4_000_000) {
            sessionStorage.setItem("latest_csv_text", text);
            sessionStorage.setItem("latest_csv_name", form.csvFile.name);
          } else {
            sessionStorage.removeItem("latest_csv_text");
            sessionStorage.removeItem("latest_csv_name");
          }
        } catch { /* text read failed — rerun falls back to the stale path */ }
      }

      const payload = {
        raw_csv_path: resolvedCsvPath,
        dataset_name: form.csvFile?.name ?? "",
        column_mapping: confirmed?.mapping ?? {},
        questionnaire: {
          business_context: form.businessContext, industry: "", size: "",
          business_model: form.businessModel, company_stage: form.companyStage,
          revenue_model: form.revenueModel, time_range: "",
          product_lines: form.coreFeatures.split(",").map((s) => s.trim()).filter(Boolean),
          market_segment: form.typicalCustomer, budget: "",
          legal_constraints: form.pricingFlexibility.includes("None — pricing is locked") ? ["Pricing locked"] : [],
          churn_definition: form.churnDefinition === "Other" ? form.churnDefinitionOther : form.churnDefinition === "Inactivity" ? `Inactivity (${form.churnInactivityDays} days)` : form.churnDefinition,
          competitors: form.topCompetitors.split(",").map((s) => s.trim()).filter(Boolean),
          top_channels: form.topChannels, support_model: form.supportModel,
          goal: form.topGoal, target_churn_rate: null,
          priority_segment: form.prioritySegment === "Specific tier or plan" ? form.prioritySegmentOther : form.prioritySegment,
          edge_cases: form.anythingElse ? [form.anythingElse] : [],
          pricing_flexibility: form.pricingFlexibility, can_ship_changes: form.canShipChanges,
          has_completion_point: form.hasCompletionPoint, churn_destination: form.churnDestination,
          retention_tactics: form.retentionTactics, timeline: form.timeline,
          typical_customer: form.typicalCustomer,
          analysis_depth: form.analysisDepth || "quick",
        },
      };

      sessionStorage.setItem("latest_form_payload", JSON.stringify(payload));
      sessionStorage.setItem("latest_form_state", JSON.stringify(form));

      setLaunchStage("queue");
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to start analysis pipeline.");

      const data = await res.json();
      toast.success("Analysis started");
      setLaunchStage("open");
      router.push(`/results/${data.job_id}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to submit questionnaire.");
      setSubmitting(false);
      setLaunchStage(null);
      submittingRef.current = false;
    }
  };

  /* ── step renderers ──────────────────────────────────────────── */

  const radio = (key: keyof FormData, options: (string | { value: string; sub: string })[], cols: 1 | 2 | 3 = 2) => (
    <OptionGrid cols={cols}>
      {options.map((o) => {
        const value = typeof o === "string" ? o : o.value;
        return (
          <OptionCard key={value} label={value} sublabel={typeof o === "string" ? undefined : o.sub}
            selected={form[key] === value} onClick={() => set(key, value as never)} />
        );
      })}
    </OptionGrid>
  );

  const checks = (key: "pricingFlexibility" | "topChannels" | "retentionTactics", options: string[], max?: number) => (
    <OptionGrid>
      {options.map((o) => {
        const checked = form[key].includes(o);
        return (
          <OptionCard key={o} kind="check" label={o} selected={checked}
            disabled={max !== undefined && form[key].length >= max}
            onClick={() => { if (!checked && max !== undefined && form[key].length >= max) return; toggle(key, o); }} />
        );
      })}
    </OptionGrid>
  );

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <>
            <QuestionTitle required={false}>Tell us about your business</QuestionTitle>
            <Hint>In a few sentences: what you sell, who you sell to, and why you think customers are leaving.</Hint>
            <div data-step-item>
              <Textarea id="q1-ctx" value={form.businessContext} onChange={(e) => set("businessContext", e.target.value)}
                placeholder="e.g. B2B SaaS for customer support. 500+ companies, $2K–$15K MRR. Seeing a churn spike at month 6…"
                className={`${INPUT_CLS} min-h-[140px] resize-none leading-[1.7]`} />
              <p className="mt-2 text-[12px] text-zinc-600">3–5 sentences suggested</p>
            </div>

            <Divider />

            <QuestionTitle>Upload your customer data</QuestionTitle>
            <Hint>A CSV with one row per customer. It needs a 0/1 churn column and a tenure / months-active column — everything else is detected automatically.</Hint>
            <div data-step-item onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onClick={() => fileRef.current?.click()}
              className={cn(
                "group relative cursor-pointer overflow-hidden rounded-2xl border border-dashed transition-all duration-300",
                form.csvFile ? "border-brand/40 bg-brand/[0.04]" : "border-white/12 hover:border-brand/40 hover:bg-white/[0.02]",
              )}>
              <input ref={fileRef} type="file" accept=".csv" onChange={onFile} className="hidden" id="csv-upload" />
              {form.csvFile ? (
                <div className="flex items-center gap-4 px-5 py-5">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand/15"><FileSpreadsheet className="h-5 w-5 text-brand" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-zinc-50">{form.csvFile.name}</p>
                    <p className="mt-0.5 font-mono text-[12px] text-zinc-500">{(form.csvFile.size / 1024).toFixed(1)} KB{upload.status === "ready" ? ` · ${upload.inspection.summary.rows.toLocaleString()} rows` : ""}</p>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); set("csvFile", null); }} className="rounded-lg p-1.5 transition-colors hover:bg-white/[0.06]" aria-label="Remove file"><X className="h-4 w-4 text-zinc-400" /></button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-14">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] transition-transform duration-500 group-hover:-translate-y-1">
                    <Upload className="h-5 w-5 text-zinc-400 group-hover:text-brand" />
                  </div>
                  <p className="text-[14px] text-zinc-400">Drop a CSV here or <span className="text-zinc-50 underline decoration-white/20 underline-offset-4">browse</span></p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600">.csv · up to 25 MB</p>
                </div>
              )}
            </div>

            {form.csvFile && (
              <div data-step-item className="mt-4">
                <ColumnConfirm state={upload} onRetry={columnsCheck.retry} onSetRole={columnsCheck.setRole} />
              </div>
            )}

            {form.csvFile && (
              <div className="mt-10">
                <SectionLabel>What does churn = 1 mean in this file?</SectionLabel>
                {radio("churnDefinition", ["Cancelled paid subscription", "Downgraded to free / lower tier", "Inactivity", "Contract not renewed", "Failed payment (involuntary)", "Other"])}
                {form.churnDefinition === "Inactivity" && <div data-step-item className="mt-3"><Input value={form.churnInactivityDays} onChange={(e) => set("churnInactivityDays", e.target.value)} placeholder="Number of days (e.g. 30)" className={`${INPUT_CLS} h-10 w-56`} /></div>}
                {form.churnDefinition === "Other" && <div data-step-item className="mt-3"><Input value={form.churnDefinitionOther} onChange={(e) => set("churnDefinitionOther", e.target.value)} placeholder="Describe your churn definition…" className={`${INPUT_CLS} h-10`} /></div>}
              </div>
            )}
            <NextBtn onClick={next} disabled={!canNext()}>Continue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></NextBtn>
          </>
        );

      case 1:
        return (
          <>
            <QuestionTitle>Business type, customer & stage</QuestionTitle>
            <Hint>Determines which retention playbook, benchmarks and diagnostic paths we use.</Hint>
            <SectionLabel>Business model</SectionLabel>
            {radio("businessModel", ["B2B SaaS", "B2C SaaS", "E-commerce / Subscription", "Marketplace", "Fintech", "Media/Content", "Other"])}
            <div className="h-7" />
            <SectionLabel>Typical customer</SectionLabel>
            {radio("typicalCustomer", ["Enterprise", "Mid-market", "SMB", "Individual consumer", "Prosumer"], 3)}
            <div className="h-7" />
            <SectionLabel>Company stage</SectionLabel>
            {radio("companyStage", [
              { value: "Pre-PMF", sub: "Under ~500 customers, still finding fit" },
              { value: "Growth", sub: "PMF reached, scaling acquisition" },
              { value: "Mature", sub: "Established, focused on efficiency" },
            ], 3)}
            <Divider />
            <QuestionTitle>Revenue model & pricing flexibility</QuestionTitle>
            <Hint>The single most important constraint filter — decides whether pricing-based interventions are on the table.</Hint>
            <SectionLabel>Revenue model</SectionLabel>
            {radio("revenueModel", ["Monthly subscription", "Annual subscription", "Usage-based", "Freemium", "One-time + renewals", "Transactional"], 3)}
            <div className="h-7" />
            <SectionLabel>Pricing flexibility — select all that apply</SectionLabel>
            {checks("pricingFlexibility", ["Can adjust base price", "Can offer discounts or promotions", "Can restructure plans or tiers", "Can extend free trials", "None — pricing is locked"])}
            <NextBtn onClick={next} disabled={!canNext()}>Continue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></NextBtn>
          </>
        );

      case 2:
        return (
          <>
            <QuestionTitle>Product — features & flexibility</QuestionTitle>
            <Hint>Features ground every downstream analysis. Without them the agents reason in a vacuum.</Hint>
            <SectionLabel>Core features — top 3–5 things customers use most</SectionLabel>
            <div data-step-item><Input id="q4-feat" value={form.coreFeatures} onChange={(e) => set("coreFeatures", e.target.value)} placeholder="e.g. Invoice creation, recurring billing, Stripe integration" className={`${INPUT_CLS} h-11`} /></div>
            <div className="h-7" />
            <SectionLabel>Can you ship product changes in the next 90 days?</SectionLabel>
            {radio("canShipChanges", ["Yes", "No"])}
            <div className="h-7" />
            <SectionLabel>Natural completion point? (tax software, wedding planning…)</SectionLabel>
            {radio("hasCompletionPoint", ["Yes", "No", "Partially"], 3)}
            <Divider />
            <QuestionTitle>Acquisition & competition</QuestionTitle>
            <Hint>Acquisition channel quality is a major hidden churn driver — paid customers often churn 2–3× more than organic.</Hint>
            <SectionLabel>Top acquisition channels — pick up to 2</SectionLabel>
            {checks("topChannels", ["Organic search / SEO", "Paid ads", "Outbound sales", "Referrals / word of mouth", "Content / community", "Partnerships / integrations", "Product-led (free → paid)"], 2)}
            <div className="h-7" />
            <SectionLabel>Top competitors</SectionLabel>
            <div data-step-item><Input id="q5-comp" value={form.topCompetitors} onChange={(e) => set("topCompetitors", e.target.value)} placeholder='1–3 names, comma-separated (or "not sure")' className={`${INPUT_CLS} h-11`} /></div>
            <div className="h-7" />
            <SectionLabel>When customers cancel, where do they go?</SectionLabel>
            {radio("churnDestination", ["To a competitor", "Build something in-house", "Stop using this category", "Downgrade to free alternative", "We don't know"])}
            <NextBtn onClick={next} disabled={!canNext()}>Continue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></NextBtn>
          </>
        );

      case 3:
        return (
          <>
            <QuestionTitle>Operational capacity & current efforts</QuestionTitle>
            <Hint>Removes unrealistic recommendations and stops us suggesting what you&apos;ve already tried.</Hint>
            <SectionLabel>Support model</SectionLabel>
            {radio("supportModel", ["Self-serve only", "Email support", "Email + chat", "Dedicated CSMs for key accounts", "Full-service"])}
            <div className="h-7" />
            <SectionLabel>Retention tactics already in place — select all</SectionLabel>
            {checks("retentionTactics", ["Onboarding flow / tutorials", "Health scoring / at-risk alerts", "Proactive outreach to at-risk users", "Win-back campaigns", "Loyalty / discount programs", "Customer success / account management", "NPS / feedback collection", "None of the above"])}
            <Divider />
            <QuestionTitle>Priority, goal & timeline</QuestionTitle>
            <Hint>Sets the metric to optimise, the segment to target, and whether to favour tactical or structural changes.</Hint>
            <SectionLabel>Which customer segment matters most?</SectionLabel>
            {radio("prioritySegment", ["All customers equally", "High-value / enterprise accounts", "Newest customers (first 90 days)", "Long-tenured customers showing decline", "Specific tier or plan"])}
            {form.prioritySegment === "Specific tier or plan" && <div data-step-item className="mt-3"><Input value={form.prioritySegmentOther} onChange={(e) => set("prioritySegmentOther", e.target.value)} placeholder="Which tier or plan?" className={`${INPUT_CLS} h-10`} /></div>}
            <div className="h-7" />
            <SectionLabel>Top goal</SectionLabel>
            {radio("topGoal", ["Reduce churn rate", "Increase LTV / expansion", "Retain a specific segment", "Recover churned customers", "Improve NPS / satisfaction"])}
            <div className="h-7" />
            <SectionLabel>Timeline</SectionLabel>
            {radio("timeline", ["Quick wins (30 days)", "90-day plan", "6-month strategic shift", "Long-term (12+ months)"])}
            <NextBtn onClick={next} disabled={!canNext()}>Continue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></NextBtn>
          </>
        );

      case 4:
        return (
          <>
            <QuestionTitle required={false}>Anything else we should know?</QuestionTitle>
            <Hint>Constraints, past failures, internal debates, upcoming launches. The people who fill this in get the sharpest playbooks.</Hint>
            <div data-step-item>
              <Textarea id="q8-extra" value={form.anythingElse} onChange={(e) => set("anythingElse", e.target.value)}
                placeholder="e.g. Win-back campaign failed — 12% ROI, $8K cost. CEO wants upsell focus. AI feature launching in 4 months…"
                className={`${INPUT_CLS} min-h-[140px] resize-none leading-[1.7]`} />
            </div>
            <Divider />
            <QuestionTitle>How deep should the analysis go?</QuestionTitle>
            <Hint>Same pipeline, same guarantees — dialled to the stakes.</Hint>
            <div data-step-item className="grid gap-3 sm:grid-cols-2">
              {[
                { v: "quick", t: "Quick scan", time: "~2–4 min", d: "Fast models end-to-end, single-pass diagnosis, no reasoning trace." },
                { v: "deep", t: "Deep analysis", time: "~10–20 min", d: "Stronger model on reasoning nodes, 3-run self-consistency vote, two-pass playbook." },
              ].map((o) => {
                const sel = form.analysisDepth === o.v;
                return (
                  <button key={o.v} type="button" onClick={() => set("analysisDepth", o.v)} aria-pressed={sel}
                    className={cn(
                      "relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300",
                      sel ? "border-brand/50 bg-brand/[0.07]" : "border-white/8 bg-white/[0.015] hover:border-white/16",
                    )}>
                    {sel && <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand/20 blur-2xl" />}
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[17px] font-semibold text-zinc-50">{o.t}</span>
                      <span className="font-mono text-[11px] text-zinc-500">{o.time}</span>
                    </div>
                    <p className="mt-2 text-[13px] leading-[1.6] text-zinc-400">{o.d}</p>
                  </button>
                );
              })}
            </div>
            <NextBtn onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting analysis…</> : <><Sparkles className="h-4 w-4" /> Run analysis</>}
            </NextBtn>
          </>
        );

      default: return null;
    }
  };

  /* ── layout ──────────────────────────────────────────────────── */
  return (
    <div ref={shellRef} className="grain relative flex min-h-screen flex-1 flex-col bg-ink">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div data-aurora className="absolute right-[-10%] top-[-20%] h-[60vh] w-[50vw] rounded-full bg-[radial-gradient(closest-side,rgba(94,234,212,0.09),transparent)] blur-2xl" />
        <div data-aurora className="absolute bottom-[-20%] left-[-10%] h-[60vh] w-[50vw] rounded-full bg-[radial-gradient(closest-side,rgba(129,140,248,0.1),transparent)] blur-2xl" />
        <div data-aurora className="absolute bottom-[10%] right-[10%] h-[40vh] w-[35vw] rounded-full bg-[radial-gradient(closest-side,rgba(232,121,249,0.06),transparent)] blur-2xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,#000,transparent_80%)]" />
      </div>
      {launchStage && <LaunchOverlay stage={launchStage} />}

      {/* mobile progress bar */}
      <div className="fixed inset-x-0 top-0 z-50 h-[3px] bg-white/[0.04] lg:hidden">
        <div data-rail="bar" className="h-full origin-left scale-x-0 bg-gradient-to-r from-brand to-violet-400" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/6 bg-ink/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="hidden text-[13px] text-zinc-500 transition-colors hover:text-zinc-200 sm:inline">Dashboard</Link>
            {step > 0 && (
              <button type="button" onClick={prev} className="inline-flex items-center gap-1 text-[13px] text-zinc-500 transition-colors hover:text-zinc-200">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
            )}
            <span className="font-mono text-[12px] text-zinc-500 tnum">{String(step + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
          </div>
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-6xl flex-1 gap-14 px-4 pb-24 pt-10 sm:px-6 lg:pt-16">
        {/* step rail */}
        <aside className="sticky top-32 hidden h-fit w-64 flex-shrink-0 lg:block">
          <div className="relative pl-6">
            <div className="absolute bottom-2 left-[5px] top-2 w-px bg-white/8" />
            <div data-rail="fill" className="absolute bottom-2 left-[5px] top-2 w-px origin-top scale-y-0 bg-gradient-to-b from-brand to-violet-400" />
            <ol className="flex flex-col gap-6">
              {STEPS.map((s, i) => {
                const state = i === step ? "active" : i <= maxStep ? "reachable" : "locked";
                return (
                  <li key={s.label} className="relative">
                    <span className={cn(
                      "absolute -left-6 top-1 h-[11px] w-[11px] rounded-full border-2 transition-all duration-500",
                      i < step || (i <= maxStep && i !== step) ? "border-brand bg-brand" : i === step ? "border-brand bg-ink shadow-[0_0_0_4px_rgba(94,234,212,0.15)]" : "border-zinc-700 bg-ink",
                    )} />
                    <button type="button" onClick={() => { if (i <= maxStep) go(i); }}
                      className={cn("text-left text-[14px] transition-colors", state === "active" ? "font-medium text-zinc-50" : state === "reachable" ? "text-zinc-400 hover:text-zinc-200" : "cursor-default text-zinc-600")}>
                      <span className="mr-2 font-mono text-[11px] text-zinc-600">{String(i + 1).padStart(2, "0")}</span>
                      {s.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="mt-10 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-brand">Why we ask</p>
            <p className="mt-2 text-[13px] leading-[1.65] text-zinc-400">{STEPS[step].why}</p>
          </div>
        </aside>

        {/* step content */}
        <div ref={panelRef} key={step} className="w-full min-w-0 max-w-[680px]">
          <p data-step-item className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-brand">
            Step {step + 1} · {STEPS[step].label}
          </p>
          {renderStep()}
        </div>
      </main>
    </div>
  );
}
