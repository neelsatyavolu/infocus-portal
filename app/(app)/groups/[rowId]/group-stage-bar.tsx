import Link from "next/link";
import { AlertTriangle, Check, Circle, CircleDot, Clock, Lock, type LucideIcon } from "lucide-react";
import { StatusDot } from "@/components/kit/status-tag";
import { toneTextClass, type StatusTone } from "@/components/kit/tone";
import { stageStatusTone } from "@/components/package-stages/stage-status";
import { CYCLE_STAGE_STATUS_LABELS, type CycleStageStatus } from "@/src/lib/package-stage-status";
import { cn } from "@/src/lib/utils";
import type { ApprovalStep, StageCell, StageCellKey, StepState } from "./stage-bar-model";

/** The same icons and word colors as the student stage bar (PackageStageNav): one language. */
const STATUS_ICON: Partial<Record<CycleStageStatus, LucideIcon>> = {
  approved: Check,
  "stage-1-approved": Check,
  queued: Check,
  "needs-revisions": AlertTriangle,
  submitted: Clock,
  "stage-2": Clock,
  "stage-3": Clock,
  locked: Lock
};

function wordTone(status: CycleStageStatus): StatusTone {
  if (status === "submitted") return "warning";
  if (status === "pending" || status === "locked") return "muted";
  return stageStatusTone(status);
}

/**
 * The page being viewed: the student bar's 8% green tint (a token, so it follows --brand-green in
 * Light mode) plus the tabs' 2px green underline. The top rule says where the work is, not which
 * page is open.
 */
const ACTIVE = cn(
  "bg-brand-green/8",
  "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--brand-green)]"
);
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const STEP_SR: Record<StepState, string> = {
  done: "approved",
  current: "in progress",
  upcoming: "not started"
};

/**
 * The 4px top rule, split into three for Initial Cut's approval stages. Done is a full bar, in
 * progress half a bar, upcoming the bare track: the states differ by shape, not only by green
 * (Light mode draws both greens the same).
 */
function Strip({ segments }: { segments: StepState[] }) {
  return (
    <span aria-hidden className="absolute inset-x-0 top-0 flex h-1 gap-0.5">
      {segments.map((state, index) => (
        <span key={index} className="relative flex-1 bg-[var(--ink-4)]">
          {state === "upcoming" ? null : (
            <span
              className={cn(
                "absolute inset-y-0 left-0",
                state === "done" ? "w-full bg-[var(--brand-fill)]" : "w-1/2 bg-[var(--brand-green)]"
              )}
            />
          )}
        </span>
      ))}
    </span>
  );
}

function segmentsLabel(segments: StepState[]) {
  return segments.length > 1
    ? `, ${segments.map((state, index) => `Stage ${index + 1} ${STEP_SR[state]}`).join(", ")}`
    : "";
}

/**
 * One stage, laid out like the student bar's cells: number, status icon and word on top, the
 * stage name below (short names and the icon alone on phones; the word stays for screen readers),
 * a green dot when it changed since this viewer last opened it, and on extra-wide screens when it
 * happened.
 */
function StageCellLink({ cell, changed }: { cell: StageCell; changed: boolean }) {
  const Icon = cell.status ? STATUS_ICON[cell.status] : undefined;
  const word = cell.status ? CYCLE_STAGE_STATUS_LABELS[cell.status] : null;
  const tone = cell.status ? toneTextClass(wordTone(cell.status)) : undefined;
  const labelClass = cell.active
    ? "font-semibold text-foreground"
    : cell.dimmed
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <Link
      href={cell.href as never}
      aria-current={cell.active ? "page" : undefined}
      title={cell.title ?? (word ? `${cell.label} · ${word}` : cell.label)}
      className={cn(
        "relative flex h-14 min-w-0 flex-col justify-center gap-1.5 px-1.5 pt-1 transition-colors sm:h-16 sm:px-3",
        FOCUS,
        cell.active ? ACTIVE : "hover:bg-[var(--ink-3)]"
      )}
    >
      <Strip segments={cell.segments} />
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-[11px] font-medium uppercase leading-none tracking-[0.11em]",
          tone
        )}
      >
        <span className="font-mono-broadcast tabular-nums text-muted-foreground">{cell.index}</span>
        {Icon ? (
          <Icon aria-hidden className="h-3 w-3 shrink-0" />
        ) : cell.pending ? (
          <CircleDot aria-hidden className="h-3 w-3 shrink-0 text-[var(--brand-green)]" />
        ) : null}
        {word ? (
          <>
            <span className="hidden min-w-0 truncate sm:inline">{word}</span>
            <span className="sr-only sm:hidden">{word}</span>
          </>
        ) : null}
        {cell.pending ? <span className="sr-only">, where work waits</span> : null}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <span className={cn("min-w-0 flex-1 truncate text-xs sm:text-sm", labelClass)}>
          <span className="sm:hidden">{cell.shortLabel}</span>
          <span className="hidden sm:inline">{cell.label}</span>
          <span className="sr-only">{segmentsLabel(cell.segments)}</span>
        </span>
        {changed && !cell.active ? <StatusDot tone="new" label="Changed since your last visit" /> : null}
        {cell.meta ? (
          <span className="hidden shrink-0 font-mono-broadcast text-xs tabular-nums text-muted-foreground xl:inline">
            {cell.meta}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * A group's five stages with their status (the "did anything happen" bar). Every stage stays a
 * link, whatever the progress; Initial Cut's top rule shows its three approval stages.
 */
export function GroupStageBar({
  cells,
  changed
}: {
  cells: StageCell[];
  /** Stages that changed since this viewer last opened them. */
  changed: ReadonlySet<StageCellKey>;
}) {
  return (
    <nav aria-label="Stages">
      <ol className="grid grid-cols-5 gap-1 sm:gap-2">
        {cells.map((cell) => (
          <li key={cell.key} className="min-w-0">
            <StageCellLink cell={cell} changed={changed.has(cell.key)} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StepMark({ step }: { step: ApprovalStep }) {
  if (step.status === "needs-revisions") {
    return <AlertTriangle aria-hidden className={cn("h-4 w-4 shrink-0", toneTextClass("danger"))} />;
  }
  if (step.state === "done") return <Check aria-hidden className="h-4 w-4 shrink-0 text-[var(--brand-green)]" />;
  if (step.state === "current") return <CircleDot aria-hidden className="h-4 w-4 shrink-0 text-[var(--brand-green)]" />;
  return <Circle aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

/**
 * Initial Cut's approval chain (Stage 1 producer → Stage 2 adviser → Stage 3 executives) as a
 * second-level control under the stage bar: one compact, left-aligned segmented row (36px; 40px
 * below md, where the roles are left to screen readers) with no top rules, so it reads as Initial
 * Cut's sub-steps rather than more stages. Marks: a check when approved, a dot while in progress,
 * a warning when sent back (the decision bar below names the status). The open step gets a green
 * tint and green text.
 */
export function ApprovalPath({ steps }: { steps: ApprovalStep[] }) {
  return (
    <nav aria-label="Initial Cut approval stages" className="flex min-w-0">
      <ol className="flex h-10 max-w-full items-stretch gap-0.5 overflow-x-auto rounded-md border border-input p-0.5 [scrollbar-width:none] max-sm:w-full md:h-9 [&::-webkit-scrollbar]:hidden">
        {steps.map((step) => (
          <li key={step.key} className="flex min-w-0 max-sm:flex-1">
            <Link
              href={step.href as never}
              aria-current={step.active ? "page" : undefined}
              title={`Stage ${step.number} · ${step.role}${step.meta ? ` · ${step.meta}` : ""}`}
              className={cn(
                "inline-flex h-full min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-sm transition-colors sm:justify-start",
                FOCUS,
                step.active
                  ? "bg-brand-green/8 font-medium text-[var(--brand-green)]"
                  : "text-[var(--ink-text)] hover:bg-[var(--ink-3)] hover:text-foreground"
              )}
            >
              <StepMark step={step} />
              <span>Stage {step.number}</span>{" "}
              <span className={cn("max-md:sr-only", step.active ? "text-foreground" : "text-muted-foreground")}>
                {step.role}
              </span>
              <span className="sr-only">
                {`, ${STEP_SR[step.state]}`}
                {step.status ? `, ${CYCLE_STAGE_STATUS_LABELS[step.status].toLowerCase()}` : ""}
              </span>
              {step.meta ? (
                <span className="hidden font-mono-broadcast text-xs font-normal tabular-nums text-muted-foreground xl:inline">
                  {step.meta}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
