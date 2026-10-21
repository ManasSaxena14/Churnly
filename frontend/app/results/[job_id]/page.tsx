"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { primeLiveDemo } from "@/lib/demo";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { API_BASE, statusText } from "./lib";
import {
  buildCtx,
  type ChurnProfile, type Ctx, type DiagnosisData, type ForensicFindingsRich,
  type Playbook, type ProfessionalSkepticOutput, type RiskData, type SimulationData,
} from "./types";
import { useAnalysisStream } from "./useAnalysisStream";
import { ChurnProfileSection } from "./components/ChurnProfileSection";
import { DiagnosisSection } from "./components/DiagnosisSection";
import { EvidenceDrawer } from "./components/EvidenceDrawer";
import { HITLModal } from "./components/HITLModal";
import { PendingSection } from "./components/PendingSection";
import { Section, StatusBtn, StatusDot } from "./components/primitives";
import { SignalSection } from "./components/SignalSection";
import { Sidebar } from "./components/Sidebar";
import { SimulationSection } from "./components/SimulationSection";
import { AnalysisStatusBanner, StatusBar } from "./components/StatusBar";
import { StrategySection } from "./components/StrategySection";
import { RunMetricsPanel } from "./components/RunMetricsPanel";
import { CompletionBurst } from "./components/CompletionBurst";
import { RiskPanel } from "./components/RiskPanel";
import { WhatIfPanel } from "./components/WhatIfPanel";
import { CopilotLauncher, CopilotPanel } from "./components/CopilotPanel";
import { ResultTabs, type ResultTab } from "./components/ResultTabs";
import { downloadText, playbookToMarkdown, reportDataFromStages, slugify } from "./export";

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.job_id as string;

  const stream = useAnalysisStream(jobId);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const [hitlSubmitting, setHitlSubmitting] = useState(false);
  const [ctx, setCtx] = useState<Ctx>(() => buildCtx({}));
  const [evidenceOpenIdx, setEvidenceOpenIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<ResultTab>("report");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-hdr]", { y: 18, opacity: 0, stagger: 0.07, duration: 0.9, ease: "expo.out" });
      gsap.utils.toArray<HTMLElement>("[data-aurora]").forEach((el, i) => {
        gsap.to(el, {
          xPercent: gsap.utils.random(-20, 20), yPercent: gsap.utils.random(-15, 15), scale: gsap.utils.random(0.9, 1.2),
          duration: gsap.utils.random(10, 16), ease: "sine.inOut", repeat: -1, yoyo: true, delay: i,
        });
      });
    },
    { scope: pageRef },
  );

  // Questionnaire context lives in sessionStorage (client only), so it's
  // applied after mount to keep server and client renders identical.
  useEffect(() => {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem("latest_form_payload"); } catch { /* storage blocked */ }
    if (!raw) return;
    const t = setTimeout(() => {
      try { setCtx(buildCtx(JSON.parse(raw!).questionnaire ?? {})); } catch { /* keep defaults */ }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  /* Derived stage payloads */
  const { stagesData, pipelineState, complete, connectionStatus, errorInfo } = stream;
  const risk: RiskData | null = stagesData.risk_ready ?? null;
  const churn: ChurnProfile | null = stagesData.churn_profile_ready ?? null;
  const dx: DiagnosisData | null = stagesData.diagnosis_ready ?? null;
  const hitlData = stagesData.hitl_questions_ready;
  const sim: SimulationData | null = stagesData.simulation_ready ?? null;
  // The architect node returns {error} instead of a playbook when its LLM call
  // fails — render that as a failed stage instead of crashing the page.
  const rawPlaybook = stagesData.solution_ready?.final_playbook ?? null;
  const playbookError: string | null =
    rawPlaybook && !rawPlaybook.executive_summary ? String(rawPlaybook.error ?? "Playbook generation failed.") : null;
  const playbook: Playbook | null = rawPlaybook && !playbookError ? rawPlaybook : null;
  const groundedness = stagesData.solution_ready?.groundedness ?? null;
  const isDemo = stream.isDemo;
  // Risk list, what-if and copilot read the saved run, which exists once the
  // analysis finishes (the cached demo is always available).
  const analyticsReady = isDemo || connectionStatus === "complete";
  const hitlOpen = !!hitlData && !stream.hitlSubmitted;
  const completedCount = Object.values(pipelineState).filter(v => v === "done").length;

  /* Actions */
  const respondToHitl = async (answers: Record<string, string>) => {
    setHitlSubmitting(true);
    try {
      await fetch(`${API_BASE}/analyze/${jobId}/respond`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      stream.markHitlSubmitted();
    } finally { setHitlSubmitting(false); }
  };
  const handleHitlSubmit = (answers: string[]) =>
    respondToHitl(Object.fromEntries(answers.map((a, i) => [String(i), a])));
  const handleSkipAll = () => respondToHitl({});

  const handleRefine = () => router.push("/form");

  const exportMarkdown = () => {
    const data = reportDataFromStages(jobId, stagesData, stream.metrics);
    if (!data) return toast.error("The playbook isn't ready yet.");
    downloadText(`${slugify(data.playbook.title)}.md`, playbookToMarkdown(data));
    toast.success("Markdown downloaded");
  };
  const exportButtons = playbook ? (
    <>
      <StatusBtn onClick={exportMarkdown} title="Download the playbook as Markdown">⤓ Markdown</StatusBtn>
      <Link
        href={`/results/${jobId}/report?print=1`}
        className="whitespace-nowrap rounded-md border border-white/12 px-[11px] py-[5px] text-[11px] font-medium tracking-[0.02em] text-zinc-200 transition-colors hover:border-brand/50 hover:text-zinc-50"
        title="Open a print-ready report and save it as PDF"
      >
        ⎙ PDF report
      </Link>
    </>
  ) : null;

  // Demo runs have no backend job: "rerun" means run it live on the sample.
  const runDemoLive = () => { primeLiveDemo(); router.push("/form"); };

  const handleCancel = async () => {
    if (isDemo) return;
    if (isCancelling || connectionStatus === "complete" || connectionStatus === "cancelled") return;
    if (!confirm("Cancel this analysis? In-flight work will be discarded.")) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`${API_BASE}/analyze/${jobId}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Backend pushes a `cancelled` SSE event; UI updates from that handler.
      // If SSE already dropped, force-set state here so user gets feedback.
      setTimeout(() => {
        stream.markCancelled();
        setIsCancelling(false);
      }, 3000);
    } catch {
      toast.error("Failed to cancel analysis. Check backend connectivity.");
      setIsCancelling(false);
    }
  };

  const handleRerun = async () => {
    if (isDemo) return runDemoLive();
    const payloadStr = sessionStorage.getItem("latest_form_payload");
    if (!payloadStr) return toast.error("No previous form data found to rerun.");
    setIsRerunning(true);
    try {
      const payload = JSON.parse(payloadStr);

      // Re-upload the stashed CSV to get a fresh server-side file. The original
      // temp file may be gone (server restart / Render spin-down), which is why
      // a bare rerun of the old payload failed with "CSV not found".
      const csvText = sessionStorage.getItem("latest_csv_text");
      const csvName = sessionStorage.getItem("latest_csv_name") || "data.csv";
      if (csvText) {
        const fd = new FormData();
        fd.append("file", new File([csvText], csvName, { type: "text/csv" }));
        const up = await fetch(`${API_BASE}/upload`, { method: "POST", body: fd });
        if (up.ok) {
          payload.raw_csv_path = (await up.json()).file_path;
        }
      }

      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success("Rerun started!");
      router.push(`/results/${data.job_id}`);
    } catch { toast.error("Failed to rerun analysis."); setIsRerunning(false); }
  };

  return (
    <div ref={pageRef} className='min-h-screen bg-ink text-[13px] leading-normal tracking-[-0.005em] text-zinc-50 antialiased [font-feature-settings:"cv11","ss01","ss03"]'>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div data-aurora className="absolute right-[5%] top-[-25%] h-[55vh] w-[45vw] rounded-full bg-[radial-gradient(closest-side,rgba(94,234,212,0.07),transparent)] blur-2xl" />
        <div data-aurora className="absolute bottom-[-25%] right-[-10%] h-[60vh] w-[45vw] rounded-full bg-[radial-gradient(closest-side,rgba(129,140,248,0.08),transparent)] blur-2xl" />
        <div data-aurora className="absolute bottom-[20%] left-[20%] h-[40vh] w-[30vw] rounded-full bg-[radial-gradient(closest-side,rgba(232,121,249,0.04),transparent)] blur-2xl" />
      </div>
      <CompletionBurst complete={complete && !isDemo} />
      <div className="relative flex min-h-screen">
        <Sidebar
          pipelineState={pipelineState}
          jobId={jobId}
          ctx={ctx}
          onRefine={handleRefine}
          onRerun={handleRerun}
          stageStartTs={stream.stageStartTs}
          stageEndTs={stream.stageEndTs}
          now={stream.now}
          forensicProgress={stream.forensicProgress}
          retryInfo={stream.retryInfo}
        />

        <main className="relative flex min-w-0 flex-1 flex-col">
          <StatusBar
            text={statusText(pipelineState, hitlOpen, complete)}
            hitlOpen={hitlOpen}
            complete={complete}
            completedCount={completedCount}
            jobStartTs={stream.jobStartTs}
            jobEndTs={stream.stageEndTs.strategy}
            now={stream.now}
            onCancel={handleCancel}
            onRerun={handleRerun}
            isCancelling={isCancelling}
            isRerunning={isRerunning}
            connectionStatus={connectionStatus}
          />

          {(connectionStatus === "error" || connectionStatus === "cancelled") && (
            <AnalysisStatusBanner
              status={connectionStatus}
              errorInfo={errorInfo}
              onRerun={handleRerun}
              isRerunning={isRerunning}
            />
          )}

          <div className="mx-auto w-full max-w-[1180px] px-4 pb-20 sm:px-10">
            <div className="flex flex-wrap items-end justify-between gap-6 pb-8 pt-10">
              <div>
                <p data-hdr className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-brand">
                  {isDemo ? "Cached demo run · replayed" : complete ? "Analysis complete" : "Live analysis"}
                </p>
                <h1 data-hdr className="mt-2 font-display text-[30px] font-semibold tracking-[-0.035em]">
                  Retention <span className="font-serif font-normal italic text-brand-gradient">intelligence</span>
                </h1>
                <div data-hdr className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xs text-zinc-400">
                  <span className="tnum font-mono">job · {jobId?.split("-")[0]}</span>
                  <span className="text-zinc-700">·</span>
                  <span>{ctx.businessModel}</span>
                  <span className="text-zinc-700">·</span>
                  <span>{ctx.segment}</span>
                </div>
              </div>
              <div data-hdr className="flex items-center gap-2">
                {exportButtons}
                {isDemo ? (
                  <>
                    <StatusBtn onClick={runDemoLive}>▶ Run it live</StatusBtn>
                    <Link href="/form" className="whitespace-nowrap rounded-md border border-zinc-50 bg-zinc-50 px-[11px] py-[5px] text-[11px] font-semibold tracking-[0.02em] text-black hover:bg-white">
                      Analyze your data →
                    </Link>
                  </>
                ) : (
                  <StatusBtn onClick={handleRefine}>⤓ Refine context</StatusBtn>
                )}
              </div>
            </div>

            <ResultTabs tab={tab} onChange={setTab} analyticsReady={analyticsReady} />

            {tab === "report" && (
              <div>
              {risk ? <SignalSection data={risk} ctx={ctx} visible={true} />
                    : <PendingSection title="Signal" tone="amber" label="Stage 1 · awaiting risk_ready" />}

              {churn ? <ChurnProfileSection data={churn} ctx={ctx} visible={true} />
                     : <PendingSection title="Churn Profile" tone="blue" label="Stage 2 · awaiting churn_profile_ready" />}

              {dx ? <DiagnosisSection data={dx} ctx={ctx} visible={true} onOpenEvidence={(i) => setEvidenceOpenIdx(i)} />
                  : <PendingSection title="Root Cause" tone="purple" label="Stage 3 · awaiting diagnosis_ready" />}

              {hitlData && stream.hitlSubmitted && (
                <Section tone="violet" title="Clarify" meta="Stage 4 · human in the loop">
                  <div className="flex animate-fade-in items-center gap-3 rounded-[10px] border border-violet-600/25 bg-violet-600/6 px-[18px] py-3.5 text-[13px] text-zinc-300 opacity-0">
                    <StatusDot tone="teal" />
                    <span>✓ Answers routed — strategies generating from your inputs.</span>
                  </div>
                </Section>
              )}

              {sim ? <SimulationSection data={sim} visible={true} />
                   : <PendingSection title="Projected Impact" tone="teal" label="Stage 5 · awaiting simulation_ready" />}

              {playbook ? <StrategySection data={playbook} ctx={ctx} visible={true} groundedness={groundedness} />
                : playbookError ? (
                  <Section tone="red" title="Strategy" meta="Stage 6 · failed">
                    <div className="rounded-[10px] border border-red-500/25 bg-red-500/[0.04] px-4 py-3.5 text-[12.5px] leading-[1.6] text-zinc-300">
                      <div className="mb-1 font-semibold text-red-300">The playbook could not be generated.</div>
                      <div className="font-mono text-[11.5px] text-zinc-500">{playbookError}</div>
                    </div>
                  </Section>
                )
                : <PendingSection title="Strategy" tone="emerald" label="Stage 6 · awaiting solution_ready" />}

              <RunMetricsPanel metrics={stream.metrics} complete={complete} />
              </div>
            )}
            {tab === "risk" && analyticsReady && <RiskPanel jobId={jobId} />}
            {tab === "whatif" && analyticsReady && <WhatIfPanel jobId={jobId} />}
          </div>
        </main>

        {analyticsReady && (
          <>
            {!copilotOpen && <CopilotLauncher onClick={() => setCopilotOpen(true)} />}
            <CopilotPanel jobId={jobId} open={copilotOpen} onClose={() => setCopilotOpen(false)} />
          </>
        )}

        {hitlOpen && (
          <HITLModal
            questions={(hitlData.questions ?? []) as string[]}
            onSubmit={handleHitlSubmit}
            onSkipAll={handleSkipAll}
            submitting={hitlSubmitting}
          />
        )}

        {evidenceOpenIdx !== null && dx?.merged_hypotheses?.[evidenceOpenIdx] && (
          <EvidenceDrawer
            hypothesis={dx.merged_hypotheses[evidenceOpenIdx]}
            rank={evidenceOpenIdx + 1}
            forensic={
              dx.forensic_findings && !Array.isArray(dx.forensic_findings)
                ? (dx.forensic_findings as ForensicFindingsRich)
                : undefined
            }
            skeptic={
              dx.skeptic_findings && !Array.isArray(dx.skeptic_findings)
                ? (dx.skeptic_findings as ProfessionalSkepticOutput)
                : undefined
            }
            driverFeatures={dx.driver_features ?? (
              dx.forensic_findings && !Array.isArray(dx.forensic_findings)
                ? (dx.forensic_findings as ForensicFindingsRich).driver_features
                : undefined
            )}
            topSegments={dx.top_segments}
            onClose={() => setEvidenceOpenIdx(null)}
          />
        )}
      </div>
    </div>
  );
}
