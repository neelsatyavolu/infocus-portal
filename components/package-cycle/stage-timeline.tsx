import Link from "next/link";
import type { HomeStageStep } from "@/src/lib/home-stages";
import { cn } from "@/src/lib/utils";

const TONE_LABEL = { done: "Submitted", current: "Now", locked: "Later" } as const;

/** One bar per stage across the card: green when submitted, bright green for now, grey later. */
export function StageTimeline({ steps, dueLabels }: { steps: HomeStageStep[]; dueLabels?: Record<string, string | null> }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {steps.map((step) => (
        <li key={step.key}>
          <Link
            href={step.href as never}
            aria-current={step.tone === "current" ? "step" : undefined}
            className={cn(
              "flex h-full flex-col gap-0.5 border-t-4 px-2 pb-1 pt-2 transition hover:bg-[var(--ink-3)]",
              step.tone === "done" && "border-[var(--brand-fill)]",
              step.tone === "current" && "border-[var(--brand-green)] bg-[rgb(43,179,110,0.08)]",
              step.tone === "locked" && "border-border"
            )}
          >
            <span
              className={cn(
                "text-[11px] font-medium uppercase tracking-[0.11em]",
                step.tone === "done" ? "text-[var(--brand-green)]" : step.tone === "current" ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {TONE_LABEL[step.tone]}
            </span>
            <span className={cn("text-sm", step.tone === "current" ? "font-semibold text-foreground" : step.tone === "locked" ? "text-muted-foreground" : "text-foreground")}>
              {step.label}
            </span>
            {dueLabels?.[step.key] && step.tone !== "done" ? (
              <span className="text-xs text-muted-foreground">{dueLabels[step.key]}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ol>
  );
}
