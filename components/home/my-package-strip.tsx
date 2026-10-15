import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { ProgressSegments } from "@/components/kit/progress";
import { StatusTag } from "@/components/kit/status-tag";
import { buttonVariants } from "@/components/ui/button";
import { formatDueTagLabel, shortStageLabel, stageDueDays, stageDueTone } from "@/components/home/home-format";
import { homeStageSteps } from "@/src/lib/home-stages";
import type { DashboardUpNext } from "@/src/server/dashboard-data";
import { cn } from "@/src/lib/utils";

/**
 * A producer's own package when they are on a roster, as one full-width strip under the header:
 * topic and people (the due tag, or "All submitted", beside the "My package" label) | the four
 * stages at a glance | the Open button. One row at xl; from md the stages drop to a second row;
 * stacked on phones, where only the current stage is named under the bar.
 */
export function MyPackageStrip({ upNext, peopleLine }: { upNext: DashboardUpNext; peopleLine: string }) {
  const steps = homeStageSteps(upNext.stages);
  const currentIndex = steps.findIndex((step) => step.tone === "current");
  const current = currentIndex >= 0 ? steps[currentIndex] : null;
  const dueLabel = current ? formatDueTagLabel(current.dueDate) : null;
  const topic = upNext.groupTopic?.trim() || "Untitled package";
  const progressLabel = current
    ? `Stage ${currentIndex + 1} of ${steps.length}: ${current.label}`
    : `All ${steps.length} stages submitted`;

  return (
    <section
      aria-labelledby="home-my-package-title"
      className="grid min-w-0 gap-4 rounded-md border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:gap-6"
    >
      <div className="min-w-0">
        <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground">My package</p>
          {current ? (
            dueLabel ? <StatusTag tone={stageDueTone(stageDueDays(current.dueDate))}>{dueLabel}</StatusTag> : null
          ) : (
            <StatusTag tone="success" icon={Check}>
              All submitted
            </StatusTag>
          )}
        </div>
        <h2 id="home-my-package-title" title={topic} className="mt-1 truncate text-base font-semibold leading-snug tracking-[-0.01em] text-foreground">
          {topic}
        </h2>
        <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground md:line-clamp-1">{peopleLine}</p>
      </div>

      <div className="min-w-0 md:col-span-2 md:row-start-2 xl:col-span-1 xl:col-start-2 xl:row-start-1">
        <ProgressSegments
          label={progressLabel}
          segments={steps.map((step) => (step.tone === "done" ? "done" : step.tone === "current" ? "current" : "later"))}
        />
        <p aria-hidden className="mt-1.5 truncate text-[11px] leading-tight text-muted-foreground sm:hidden">
          {current ? (
            <>
              Stage {currentIndex + 1} of {steps.length} · <span className="font-medium text-foreground">{shortStageLabel(current.key)}</span>
            </>
          ) : (
            `All ${steps.length} stages submitted`
          )}
        </p>
        <ol aria-hidden className="mt-1.5 grid grid-cols-4 gap-1 text-[11px] leading-tight max-sm:hidden">
          {steps.map((step) => (
            <li
              key={step.key}
              title={step.label}
              className={cn("truncate", step.tone === "current" ? "font-medium text-foreground" : "text-muted-foreground")}
            >
              {shortStageLabel(step.key)}
            </li>
          ))}
        </ol>
      </div>

      {current ? (
        <div className="flex min-w-0 items-center md:col-start-2 md:row-start-1 md:justify-end xl:col-start-3">
          <Link
            href={current.href as never}
            aria-label={`Open ${current.label}`}
            className={buttonVariants({ variant: "outline", className: "max-sm:w-full" })}
          >
            Open {shortStageLabel(current.key)}
            <ArrowRight aria-hidden />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
