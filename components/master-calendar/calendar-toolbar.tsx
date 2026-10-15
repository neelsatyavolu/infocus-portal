"use client";

import { Check, Eraser, FileUp, Users } from "lucide-react";
import { Toolbar } from "@/components/kit/action-bar";
import { ActionMenu } from "@/components/kit/menu";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { monthCountsLine, type MonthSummary } from "@/components/master-calendar/calendar-model";
import type { SyncState } from "@/components/master-calendar/use-master-calendar";

function monthShort(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function SyncTag({ state }: { state: SyncState }) {
  if (state.kind === "syncing") {
    return (
      <StatusTag tone="neutral" spinner>
        Syncing…
      </StatusTag>
    );
  }
  if (state.kind === "failed") return <StatusTag tone="danger">Sync failed</StatusTag>;
  if (state.kind === "synced") {
    return (
      <StatusTag tone="success" icon={Check}>
        In Doc
      </StatusTag>
    );
  }
  if (state.kind === "dirty") {
    const label = state.includesViewed ? "Not in Doc yet" : `${state.months.map(monthShort).join(", ")} not in Doc yet`;
    return (
      <StatusTag tone="neutral" dot title="Edits sync to the Google Doc after a minute with no changes, or press Sync to Doc.">
        {label}
      </StatusTag>
    );
  }
  return null;
}

/**
 * Producers' month status for the PageHeader's status slot: what still needs people (upcoming
 * days only), or Cast complete, then the Google Doc sync state (announced politely).
 */
export function MonthStatusTags({ summary, syncState }: { summary: MonthSummary; syncState: SyncState }) {
  const needsAnchors = summary.showsNeedingAnchors;
  const needsPa = summary.paDaysNeedingAnnouncers;
  const castComplete = summary.upcomingCastDays > 0 && needsAnchors === 0 && needsPa === 0;
  return (
    <>
      {needsAnchors > 0 ? (
        <StatusTag tone="warning">{plural(needsAnchors, "show needs anchors", "shows need anchors")}</StatusTag>
      ) : null}
      {needsPa > 0 ? (
        <StatusTag tone="warning">{plural(needsPa, "PA day needs announcers", "PA days need announcers")}</StatusTag>
      ) : null}
      {castComplete ? (
        <StatusTag tone="success" icon={Check}>
          Cast complete
        </StatusTag>
      ) : null}
      <span aria-live="polite" className="inline-flex">
        <SyncTag state={syncState} />
      </span>
    </>
  );
}

/**
 * The row under the header (producers and executives): the month's counts, then Anchors & PA,
 * Sync to Doc and Wipe anchors in one row of matched controls. On phones, Sync stays and the
 * other two move into the ⋯ menu. A thin bar under the row shows a month loading.
 */
export function CalendarToolbar({
  summary,
  loading,
  canEdit,
  canViewCastCounts,
  syncing,
  wipingAnchors,
  onOpenCastCounts,
  onSync,
  onWipe
}: {
  summary: MonthSummary;
  loading: boolean;
  canEdit: boolean;
  canViewCastCounts: boolean;
  syncing: boolean;
  wipingAnchors: boolean;
  onOpenCastCounts: () => void;
  onSync: () => void;
  onWipe: () => void;
}) {
  if (!canEdit && !canViewCastCounts) return null;
  return (
    <Toolbar
      aria-label="Calendar actions"
      size="touch"
      busy={loading}
      meta={monthCountsLine(summary)}
      end={
        <>
          {canViewCastCounts ? (
            <Button type="button" variant="outline" onClick={onOpenCastCounts} className="max-sm:hidden">
              <Users aria-hidden />
              Anchors & PA
            </Button>
          ) : null}
          {canEdit ? (
            <Button type="button" variant="outline" onClick={onSync} disabled={syncing || wipingAnchors} aria-busy={syncing || undefined}>
              {syncing ? <Spinner /> : <FileUp aria-hidden />}
              Sync to Doc
            </Button>
          ) : null}
          {canEdit ? (
            <Button type="button" variant="destructive-quiet" onClick={onWipe} disabled={wipingAnchors || syncing} className="max-sm:hidden">
              <Eraser aria-hidden />
              Wipe anchors…
            </Button>
          ) : null}
          <span className="contents sm:hidden">
            <ActionMenu
              label="More calendar actions"
              variant="outline"
              className="h-10"
              items={[
                { label: "Anchors & PA", icon: Users, onSelect: onOpenCastCounts, hidden: !canViewCastCounts },
                {
                  label: "Wipe anchors…",
                  icon: Eraser,
                  tone: "danger",
                  onSelect: onWipe,
                  disabled: wipingAnchors || syncing,
                  hidden: !canEdit
                }
              ]}
            />
          </span>
        </>
      }
    />
  );
}
