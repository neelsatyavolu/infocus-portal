"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AllGradesView } from "@/components/grades/all-grades-view";
import { otherTotalsOf, packageTotalsOf, semesterCyclesOf } from "@/components/grades/grade-math";
import { weightLabel } from "@/components/grades/grade-math";
import { GradesOverview } from "@/components/grades/grades-overview";
import { gradesSeenItems, seenSummary } from "@/components/grades/grades-seen";
import { GradesOverviewSkeleton } from "@/components/grades/grades-skeleton";
import type { GradesMePayload } from "@/components/grades/grades-types";
import { useGradesSeen } from "@/components/grades/use-grades-seen";
import { ErrorState } from "@/components/kit/empty-state";
import { shouldHandleHotkey, useHotkeys } from "@/components/kit/hotkeys";
import { Panel } from "@/components/kit/panel";
import { LoadingRegion } from "@/components/kit/skeleton";
import { StatusTag } from "@/components/kit/status-tag";
import { ViewTabPanel, ViewTabs, viewTabIds } from "@/components/kit/view-tabs";
import { PageHeader } from "@/components/page-header";
import { GRADE_WEIGHTS } from "@/src/lib/grading";
import { currentGradebookWeekIndex, type GradeTab } from "@/src/lib/grades-view";
import { REQUIRED_LIVESTREAM_HOURS } from "@/src/lib/livestream";

export type { GradesMePayload } from "@/components/grades/grades-types";

type GradeView = "overview" | "gradebook";

/** Older ?tab= values that now open a section of Overview (scrolled into view; the value stays as a deep link). */
const SECTION_FOR_TAB: Partial<Record<GradeTab, string>> = {
  packages: "grades-packages",
  participation: "grades-participation",
  other: "grades-other"
};

const VIEW_COPY: Record<GradeView, { title: string; description: string }> = {
  overview: {
    title: "Grades",
    // The band shows the Packages and Participation weights but not the portfolio's (its Other
    // cell is livestream + portfolio), so the plate names all three.
    description: `Packages ${weightLabel(GRADE_WEIGHTS.packages)} · participation ${weightLabel(
      GRADE_WEIGHTS.participation
    )} · portfolio ${weightLabel(GRADE_WEIGHTS.portfolio)}. Ungraded work doesn't count until a producer marks it.`
  },
  gradebook: {
    title: "Gradebook",
    description: "Every score this semester, grouped by category."
  }
};

/** "What's new" memory, per person (shared lab computers) and per signature format. */
const SEEN_STORAGE_PREFIX = "grades:seen:v2:";

async function fetchGrades() {
  const response = await fetch("/api/grades/me", { cache: "no-store" });
  const payload = (await response.json()) as { data?: GradesMePayload; error?: { message?: string } };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load grade viewer.");
  }

  return payload.data;
}

const OVERVIEW_PANEL_ID = viewTabIds("grades", "overview").panel;

/**
 * True when the arrow keys have no other job: focus on the page itself or inside the Participation
 * card. A click on plain content focuses the nearest focusable ancestor, which is the shell's
 * <main tabIndex=-1> or the Overview tabpanel (tabIndex 0), so those count as "the page" too.
 * Anything else (the view tabs, a button in another card) keeps its usual arrow behaviour.
 */
function arrowsStepWeek(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  if (target === document.body || target === document.documentElement) return true;
  if (target.tagName === "MAIN" || target.id === OVERVIEW_PANEL_ID) return true;
  return target.closest("#grades-participation") !== null;
}

/**
 * Student grades: two views under top tabs. Overview (the default) answers "what's my grade,
 * what changed, how did this week go" on one screen; Gradebook is the full what-if table.
 * Keys: 1 / 2 switch views; ← / → change the participation week on Overview (when focus is on
 * the page, including after a click on plain content, or in the Participation card, so arrows in
 * the view tabs and other controls keep their usual job).
 */
export default function GradesClient({
  initialData,
  initialTab,
  initialWeekIndex,
  seenKey = ""
}: {
  /** Loaded on the server for first paint; null falls back to fetching (and showing any error). */
  initialData: GradesMePayload | null;
  initialTab: GradeTab;
  initialWeekIndex: number;
  /** Opaque per-person key for the "New since your last visit" memory. Empty turns it off. */
  seenKey?: string;
}) {
  const [data, setData] = useState<GradesMePayload | null>(initialData);
  const [loading, setLoading] = useState(initialData === null);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<GradeView>(initialTab === "all" ? "gradebook" : "overview");
  const [weekIndex, setWeekIndex] = useState(initialWeekIndex);
  const [attempt, setAttempt] = useState(0);
  const landed = useRef(false);

  // Keep the open view in the URL (?tab=all for the gradebook) without a server round trip.
  const selectView = useCallback((next: GradeView) => {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", "all");
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    if (initialData) return;
    let active = true;

    async function hydrate() {
      try {
        setLoading(true);
        setMessage(null);
        const next = await fetchGrades();
        if (!active) return;
        setData(next);

        const weeks = next.gradebook?.weeks ?? [];
        if (weeks.length > 0) {
          setWeekIndex(currentGradebookWeekIndex(weeks, new Date().toISOString().slice(0, 10)));
        }
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Failed to load grade viewer.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [initialData, attempt]);

  // Old links (?tab=packages / participation / other) land on Overview scrolled to that section
  // once the grades are on screen. The value stays in the URL, so a bookmark keeps working.
  useEffect(() => {
    if (landed.current || !data) return;
    landed.current = true;
    const section = SECTION_FOR_TAB[initialTab];
    if (section) document.getElementById(section)?.scrollIntoView({ block: "start" });
  }, [data, initialTab]);

  const orderedCycles = useMemo(() => {
    return [...(data?.cycles ?? [])].sort((a, b) => a.cycleNumber - b.cycleNumber);
  }, [data]);

  const estimated = data?.estimated;
  const gradebook = data?.gradebook;
  const semesterLabel = gradebook?.semester.label;
  const weeks = useMemo(() => gradebook?.weeks ?? [], [gradebook?.weeks]);
  const semesterCycles = useMemo(() => semesterCyclesOf(orderedCycles, semesterLabel), [orderedCycles, semesterLabel]);
  const packageTotals = useMemo(() => packageTotalsOf(estimated), [estimated]);
  const otherTotals = useMemo(() => otherTotalsOf(estimated), [estimated]);
  const checkInByCycle = useMemo(
    () => new Map((gradebook?.checkIns ?? []).map((row) => [row.cycleNumber, row])),
    [gradebook?.checkIns]
  );

  const seenItems = useMemo(() => (data ? gradesSeenItems(data) : []), [data]);
  const changes = useGradesSeen({
    items: seenItems,
    ready: data !== null,
    storageKey: seenKey ? `${SEEN_STORAGE_PREFIX}${seenKey}` : ""
  });
  const newKeys = useMemo(() => new Set(changes.map((change) => change.key)), [changes]);
  const summary = seenSummary(changes);

  useHotkeys({
    "1": () => selectView("overview"),
    "2": () => selectView("gradebook")
  });

  // ← / → step the participation week (not through useHotkeys, which would claim the arrows everywhere).
  const weekCount = weeks.length;
  useEffect(() => {
    if (view !== "overview" || weekCount < 2) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (!shouldHandleHotkey(event) || !arrowsStepWeek(event.target)) return;
      event.preventDefault();
      const step = event.key === "ArrowLeft" ? -1 : 1;
      setWeekIndex((index) => Math.min(Math.max(index + step, 0), weekCount - 1));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, weekCount]);

  const failed = data === null && !loading && message !== null;
  const errorState = failed ? (
    <Panel as="div" tone="danger" padding="none">
      <ErrorState
        title="Couldn't load your grades"
        message={message}
        onRetry={() => setAttempt((count) => count + 1)}
      />
    </Panel>
  ) : null;

  const copy = VIEW_COPY[view];
  const showNew = view === "overview" && changes.length > 0;
  // What changed is said once: the "N new" tag plus this line (the rows carry their own New tags).
  const description = showNew ? `New since your last visit: ${summary}` : copy.description;

  return (
    <div className="space-y-5">
      <ViewTabs
        idPrefix="grades"
        ariaLabel="Grade views"
        value={view}
        onChange={selectView}
        className="-mt-1"
        items={[
          {
            value: "overview",
            label: "Overview",
            title: "Overview (1)",
            // Only from Gradebook: on Overview the plate already says what's new.
            dot: view === "gradebook" && changes.length > 0 ? "new" : undefined,
            dotLabel: "New since your last visit"
          },
          { value: "gradebook", label: "Gradebook", title: "Gradebook and what-if (2)" }
        ]}
      />

      <PageHeader
        eyebrow={semesterLabel ? `Grades · ${semesterLabel}` : "Grades"}
        status={
          showNew ? (
            <StatusTag tone="success" dot title="New since your last visit">
              {changes.length} new
            </StatusTag>
          ) : null
        }
        title={copy.title}
        description={description}
      />

      <div>
        {/* Only the open view is mounted, so Overview never pays to render the whole gradebook. */}
        <ViewTabPanel idPrefix="grades" value="overview" active={view === "overview"}>
          {view === "overview"
            ? errorState ??
              (data ? (
                <GradesOverview
                  estimated={estimated}
                  gradebook={gradebook}
                  semesterCycles={semesterCycles}
                  scoreCycles={orderedCycles}
                  packageTotals={packageTotals}
                  otherTotals={otherTotals}
                  checkInByCycle={checkInByCycle}
                  weeks={weeks}
                  weekIndex={weekIndex}
                  onWeekIndex={setWeekIndex}
                  newKeys={newKeys}
                />
              ) : (
                <LoadingRegion label="Loading grades">
                  <GradesOverviewSkeleton />
                </LoadingRegion>
              ))
            : null}
        </ViewTabPanel>
        <ViewTabPanel idPrefix="grades" value="gradebook" active={view === "gradebook"}>
          {view === "gradebook"
            ? errorState ?? (
                <AllGradesView
                  loading={loading}
                  intro={false}
                  semesterLabel={semesterLabel ?? "26-27 S1"}
                  cycles={orderedCycles}
                  estimated={estimated}
                  weeks={weeks}
                  livestreamHours={gradebook?.livestreamHours ?? 0}
                  requiredHours={gradebook?.requiredLivestreamHours ?? REQUIRED_LIVESTREAM_HOURS}
                />
              )
            : null}
        </ViewTabPanel>
      </div>
    </div>
  );
}
