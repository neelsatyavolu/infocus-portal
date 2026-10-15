"use client";

import { ClipboardList, Send } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Spinner } from "@/components/kit/spinner";
import { CountBadge, SaveState, StatusTag, type SaveStateValue } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { MAX_PACKAGE_PER_CYCLE, type CycleTab, type ViewMode } from "./grade-editor-types";
import { formatLongDate, formatPercent, totalsMaxPoints } from "./grade-editor-utils";

/** The cycle's numbers for the context line. Null while another cycle is still loading. */
export type CycleStats = {
  reporterCount: number;
  /** Published, scored grades (exempt and ungraded left out, as the server counts them). */
  publishedCount: number;
  averageTotal: number | null;
  averagePercentage: number | null;
  overExtensions: number;
};

function joinParts(parts: Array<string | null | false>) {
  return parts.filter(Boolean).join(" · ");
}

/**
 * The page plate: eyebrow + status tags (save state, temporary edits), the view's title, one line
 * of context (in a cycle: the Final Cut date, the published count and the average; phones drop
 * only the over-extensions count, which their filter chip shows), and the actions: Missing
 * grades, plus Publish all (the one primary) in a
 * cycle. On phones both actions share one row (shorter Missing label, no Send icon).
 */
export function GradeEditorHeader({
  viewMode,
  cycleNumber,
  cycle,
  stats,
  totalsReporterCount,
  totalsLoading,
  cycleCount,
  saveState,
  dirtyCount,
  temporaryEdits,
  student,
  missingPeople,
  onOpenMissing,
  publishAllCount,
  publishingAll,
  publishAllDisabled,
  onPublishAll
}: {
  viewMode: ViewMode;
  /** The cycle on screen (or loading), so the title follows the tab at once. */
  cycleNumber: number;
  cycle: CycleTab | null;
  stats: CycleStats | null;
  totalsReporterCount: number;
  /** The first totals are still loading (nothing to count yet). */
  totalsLoading: boolean;
  cycleCount: number;
  saveState: SaveStateValue;
  dirtyCount: number;
  temporaryEdits: number;
  student: { name: string | null; email: string | null } | null;
  missingPeople: number | null;
  onOpenMissing: () => void;
  publishAllCount: number;
  publishingAll: boolean;
  publishAllDisabled: boolean;
  onPublishAll: () => void;
}) {
  const focus = cycle?.focus?.trim();
  const maxPoints = totalsMaxPoints(cycleCount);

  const status =
    viewMode === "cycle" ? (
      <SaveState state={saveState} count={dirtyCount} savedLabel="All saved" errorLabel="Not saved" />
    ) : viewMode === "total" && temporaryEdits > 0 ? (
      <StatusTag tone="warning" title="Temporary: these change this page and the CSV only, and are gone after a reload">
        {`${temporaryEdits} edited`}
      </StatusTag>
    ) : null;

  const title =
    viewMode === "total" ? (
      "Total grade"
    ) : viewMode === "student" ? (
      "Student gradebook"
    ) : (
      <>
        Package Cycle {cycleNumber}
        {focus ? <span className="text-muted-foreground"> · {focus}</span> : null}
      </>
    );

  const description =
    viewMode === "total" ? (
      totalsLoading ? (
        "Loading totals…"
      ) : (
        <span title="50 × cycles + 20 × cycles + 40 livestream + 100 portfolio">
          {totalsReporterCount} reporters · out of {maxPoints} pts
        </span>
      )
    ) : viewMode === "student" ? (
      student ? (
        joinParts([
          student.name?.trim() || student.email || "Unnamed user",
          student.name?.trim() ? student.email : null,
          "the gradebook they see"
        ])
      ) : (
        "Pick a reporter from the list"
      )
    ) : (
      <span className="tabular-nums">
        {!cycle ? "Loading cycle…" : cycle.finalCutDate ? `Final Cut ${formatLongDate(cycle.finalCutDate)}` : "Final Cut date not set"}
        {stats ? (
          <>
            {" · "}
            <span title="Published, scored grades out of every reporter (exempt and ungraded left out)">
              {stats.publishedCount}/{stats.reporterCount} published
            </span>
            {" · "}
            <span title="Average of the published, scored grades in this cycle">
              avg{" "}
              {stats.averageTotal === null
                ? "—"
                : `${stats.averageTotal.toFixed(1)}/${MAX_PACKAGE_PER_CYCLE} (${formatPercent(stats.averagePercentage)})`}
            </span>
            {/* Phones leave this out: the Over extensions filter chip shows the same count. */}
            {stats.overExtensions > 0 ? (
              <span className="max-sm:hidden">
                {" · "}
                <span title="Used more extension days than they have, across all cycles">{stats.overExtensions} over extensions</span>
              </span>
            ) : null}
          </>
        ) : null}
      </span>
    );

  return (
    <PageHeader
      size="compact"
      eyebrow="Grade Editor"
      status={status}
      title={title}
      description={description}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onOpenMissing}>
            <ClipboardList aria-hidden />
            {/* Phones, in a cycle: the short label (still read out in full), so both actions share one row. */}
            <span>
              Missing<span className={viewMode === "cycle" ? "max-sm:sr-only" : undefined}> grades</span>
            </span>
            {missingPeople ? (
              <CountBadge count={missingPeople} tone="warning" srLabel={`${missingPeople} ${missingPeople === 1 ? "person" : "people"}`} />
            ) : null}
          </Button>
          {viewMode === "cycle" ? (
            <Button
              type="button"
              onClick={onPublishAll}
              disabled={publishAllDisabled}
              title="Publish every scored, unpublished grade in this cycle (search and filters don't apply). Unsaved scores save first."
            >
              {publishingAll ? <Spinner /> : <Send aria-hidden className="max-sm:hidden" />}
              {publishingAll ? "Publishing…" : "Publish all"}
              {!publishingAll ? <CountBadge count={publishAllCount} tone="onBrand" srLabel={`${publishAllCount} to publish`} /> : null}
            </Button>
          ) : null}
        </>
      }
    />
  );
}
