import { Card, Section, SkeletonLine, type Tone } from "./primitives";

/* Placeholder for a stage that hasn't streamed yet: skeleton rows with a
   light beam sweeping across, so waiting reads as "working", not "broken". */
export function PendingSection({ title, tone, label }: { title: string; tone: Tone; label: string }) {
  return (
    <Section tone={tone} title={title} titleClassName="text-zinc-500" meta={label} className="opacity-50" animate={false}>
      <Card className="relative overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-[scan_2.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
        <div className="flex flex-col gap-2">
          <SkeletonLine className="w-[60%]" />
          <SkeletonLine className="w-[85%]" />
          <SkeletonLine className="w-[40%]" />
        </div>
        <div className="mt-4 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-600">
          agents working
          <span className="inline-flex gap-0.5">
            <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-500" />
          </span>
        </div>
      </Card>
    </Section>
  );
}
