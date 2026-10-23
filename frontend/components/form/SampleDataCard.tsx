"use client";

import { useState } from "react";
import { ChevronDown, Database, Download, Loader2, Sparkles } from "lucide-react";
import { celebrate } from "@/lib/celebrate";
import { cn } from "@/lib/utils";

const SAMPLE_URL = "/churn_demo_300.csv";
const SAMPLE_NAME = "churnly-sample-customers.csv";
const COLUMNS = ["CustomerID", "Age", "Gender", "Tenure", "Usage Frequency", "Support Calls", "Payment Delay", "Plan Tier", "Contract Length", "Total Spend", "Last Interaction", "Churn"];
const PREVIEW = [
  ["205947", "35", "Female", "27", "29", "7", "11", "Premium", "Monthly", "729.93", "13", "1"],
  ["46912", "42", "Male", "52", "3", "0", "2", "Premium", "Monthly", "876.00", "6", "1"],
];

/* For visitors without their own data: attach a ready-made customer file in
   one click, or download it to look at first. */
export function SampleDataCard({ onUse }: { onUse: (file: File) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const use = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      onUse(new File([blob], SAMPLE_NAME, { type: "text/csv" }));
      celebrate("Sample data attached", { description: "300 customers from a subscription business. Checking the columns…" });
    } catch {
      setError("Couldn't load the sample file. Try downloading it instead.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.035] to-transparent">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand/20 via-brand-2/15 to-brand-3/20 ring-1 ring-inset ring-white/10">
          <Database className="h-5 w-5 text-brand" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-zinc-100">No data handy? Try our sample dataset</p>
          <p className="mt-0.5 text-[12.5px] leading-[1.6] text-zinc-500">
            300 customers · 12 columns · plan, contract, usage, support calls and who left.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <a href={SAMPLE_URL} download={SAMPLE_NAME}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/12 px-3.5 text-[12.5px] text-zinc-300 transition-colors hover:border-white/25 hover:text-zinc-50">
            <Download className="h-3.5 w-3.5" /> Download
          </a>
          <button type="button" onClick={use} disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-zinc-50 px-4 text-[12.5px] font-semibold text-ink transition-colors hover:bg-white disabled:opacity-70">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Use sample data
          </button>
        </div>
      </div>

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-1.5 border-t border-white/6 px-5 py-2.5 text-left text-[12px] text-zinc-500 transition-colors hover:text-zinc-300">
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", open && "rotate-180")} /> Preview the columns
      </button>
      <div className={cn("grid transition-all duration-300", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="overflow-x-auto px-5 pb-4">
            <table className="w-full min-w-[760px] border-collapse font-mono text-[11px]">
              <thead>
                <tr>{COLUMNS.map((c) => <th key={c} className="whitespace-nowrap border-b border-white/8 px-2 py-1.5 text-left font-normal text-zinc-400">{c}</th>)}</tr>
              </thead>
              <tbody>
                {PREVIEW.map((row) => (
                  <tr key={row[0]}>{row.map((v, i) => <td key={i} className="whitespace-nowrap px-2 py-1.5 text-zinc-500">{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11.5px] text-zinc-600"><span className="text-zinc-400">Churn</span> = 1 if the customer left · <span className="text-zinc-400">Tenure</span> = months as a customer</p>
          </div>
        </div>
      </div>
      {error && <p className="border-t border-white/6 px-5 py-2.5 text-[12px] text-rose-300">{error}</p>}
    </div>
  );
}
