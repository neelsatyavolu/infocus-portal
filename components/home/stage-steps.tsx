import { SegmentNav, type SegmentState } from "@/components/kit/segment-nav";
import { DueTag, StatusTag } from "@/components/kit/status-tag";
import { formatDueTagLabel, formatShortDueDate, shortStageLabel, stageDueDays, stageDueTone } from "@/components/home/home-format";
import type { HomeStageStep } from "@/src/lib/home-stages";

const STATE: Record<HomeStageStep["tone"], SegmentState> = {
  done: "done",
  current: "current",
  locked: "upcoming"
};

/** Spoken after the stage name; the current stage is announced by aria-current instead. */
const SR_STATE: Record<HomeStageStep["tone"], string> = {
  done: "",
  current: "",
  locked: ", later"
};

/**
 * Home's stage strip, built on the kit SegmentNav so it is the same strip as every other stage
 * bar (4px top rule, tinted current cell, two up on phones, four across from sm). Each cell is
 * a link: number and short stage name; then a Submitted tag, or for every unsubmitted stage the
 * countdown tag (kit wording "in 2d", "Today", "1d ago"; amber when close, red when past, so a
 * later stage whose date has passed reads as overdue) beside its due date. The full stage name
 * and due label are the hover text, and screen readers hear the full stage name.
 */
export function StageSteps({ steps }: { steps: HomeStageStep[] }) {
  return (
    <SegmentNav
      ariaLabel="Package stages"
      columns={4}
      items={steps.map((step, index) => {
        const done = step.tone === "done";
        const days = done ? null : stageDueDays(step.dueDate);
        const date = done ? null : formatShortDueDate(step.dueDate);
        const fullDue = done ? null : formatDueTagLabel(step.dueDate);
        return {
          key: step.key,
          index: index + 1,
          href: step.href,
          state: STATE[step.tone],
          title: fullDue ? `${step.label} · ${fullDue}` : step.label,
          label: (
            <>
              <span aria-hidden>{shortStageLabel(step.key)}</span>
              <span className="sr-only">{`${step.label}${SR_STATE[step.tone]}`}</span>
            </>
          ),
          tag: done ? (
            <StatusTag tone="success" size="sm">
              Submitted
            </StatusTag>
          ) : days !== null ? (
            <DueTag days={days} tone={stageDueTone(days)} size="sm" />
          ) : undefined,
          meta: done ? undefined : date ? (
            <span className="font-mono-broadcast tabular-nums">{date}</span>
          ) : (
            "No due date"
          )
        };
      })}
    />
  );
}
