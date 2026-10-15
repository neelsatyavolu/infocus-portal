"use client";

import type { ReactNode } from "react";
import { Eye, Pencil, RefreshCcw } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { FilterChips } from "@/components/kit/filter-chips";
import { IconButton } from "@/components/kit/icon-button";
import { CyclePicker } from "@/components/kit/pickers";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Skeleton } from "@/components/kit/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ROSTER_FILTER_LABELS, ROSTER_FILTERS, type CycleTab, type RosterFilter } from "./roster-model";

export type RosterMode = "view" | "edit";

/**
 * The one row under the header (the same shape as the Groups toolbar): filter chips and the
 * roster counts at the start; View | Edit (editors), the cycle and Refresh at the end. One control
 * height: 40px on phones, 36px from md. On phones the controls come first and the chips scroll
 * sideways under them, edge to edge.
 */
export function RosterToolbar({
  filters,
  cycles,
  activeCycleNumber,
  currentCycleNumber,
  canEdit,
  mode,
  modeDisabled,
  refreshDisabled,
  refreshing,
  onCycleChange,
  onModeChange,
  onRefresh
}: {
  /** Filter chips and counts; null while there is nothing to filter. */
  filters: ReactNode;
  cycles: CycleTab[];
  activeCycleNumber: number;
  currentCycleNumber: number | null;
  canEdit: boolean;
  mode: RosterMode;
  /** A cycle is loading or failed to load: there is nothing to edit. */
  modeDisabled: boolean;
  refreshDisabled: boolean;
  refreshing: boolean;
  onCycleChange: (cycleNumber: number) => void;
  onModeChange: (mode: RosterMode) => void;
  onRefresh: () => void;
}) {
  return (
    <div role="group" aria-label="Roster controls" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      {filters ? (
        <div className="order-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 max-sm:w-full sm:order-1">
          {filters}
        </div>
      ) : null}
      <ActionBar
        size="touch"
        align="end"
        aria-label="Mode, cycle and refresh"
        className="order-1 max-sm:w-full sm:order-2 sm:ml-auto"
      >
        {canEdit ? (
          <SegmentedControl<RosterMode>
            ariaLabel="Roster mode"
            size="touch"
            value={mode}
            onChange={onModeChange}
            options={[
              { value: "view", icon: Eye, label: <span className="max-sm:sr-only">View</span>, disabled: modeDisabled },
              { value: "edit", icon: Pencil, label: <span className="max-sm:sr-only">Edit</span>, disabled: modeDisabled }
            ]}
            className="max-sm:mr-auto"
          />
        ) : null}
        {cycles.length > 1 ? (
          // The wrapper carries the hint for the [ and ] keys (the picker takes the row height from it).
          <span title="Switch cycles: [ and ]" className={canEdit ? "inline-flex min-w-0" : "inline-flex min-w-0 max-sm:mr-auto"}>
            <CyclePicker
              cycles={cycles}
              value={activeCycleNumber}
              currentCycle={currentCycleNumber}
              onChange={onCycleChange}
              className="h-full max-sm:min-w-0 max-sm:max-w-[10.5rem]"
            />
          </span>
        ) : null}
        <IconButton
          label="Refresh"
          icon={RefreshCcw}
          variant="outline"
          size="touch"
          busy={refreshing}
          disabled={refreshDisabled}
          onClick={onRefresh}
        />
      </ActionBar>
    </div>
  );
}

/**
 * The filter chips (each with its count; gap filters hide at 0) and, after them on wider screens,
 * how many groups have members and a producer (phones keep just the chips). Placeholder chips
 * while a cycle loads.
 */
export function RosterFilters({
  loading,
  value,
  counts,
  withMembers,
  withProducer,
  showMine,
  onChange
}: {
  loading: boolean;
  value: RosterFilter;
  counts: Record<RosterFilter, number>;
  withMembers: number;
  withProducer: number;
  /** "Assigned to me" needs to know who is signed in. */
  showMine: boolean;
  onChange: (filter: RosterFilter) => void;
}) {
  if (loading) {
    return (
      <div aria-hidden className="flex gap-2">
        <Skeleton className="h-10 w-20 rounded-md md:h-9" />
        <Skeleton className="h-10 w-28 rounded-md md:h-9" />
        <Skeleton className="h-10 w-28 rounded-md md:h-9" />
      </div>
    );
  }
  return (
    <>
      <FilterChips<RosterFilter>
        ariaLabel="Show groups"
        size="touch"
        value={value}
        onChange={onChange}
        options={ROSTER_FILTERS.map((id) => ({
          value: id,
          label: ROSTER_FILTER_LABELS[id],
          count: counts[id],
          hideWhenZero: id !== "all",
          hidden: id === "mine" && !showMine,
          tone: id === "all" || id === "mine" ? undefined : "warning"
        }))}
        // Phones: one row that scrolls sideways edge to edge (the shell gutter is 16px).
        className="-mx-4 w-[calc(100%+2rem)] max-w-none px-4 sm:mx-0 sm:w-auto sm:max-w-full sm:px-0"
      />
      <p className="text-sm text-muted-foreground max-sm:hidden">
        <span className="font-mono-broadcast tabular-nums text-foreground">{withMembers}</span> with members
        <span aria-hidden> · </span>
        <span className="sr-only">, </span>
        <span className="font-mono-broadcast tabular-nums text-foreground">{withProducer}</span> with a producer
      </p>
    </>
  );
}

/** Refresh after a failed save asks first: the saved roster it loads replaces those edits. */
export function RefreshConfirm({
  open,
  onOpenChange,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="default"
      title="Refresh the roster?"
      description="Some changes haven't saved. Refresh loads the saved roster and drops them."
      confirmLabel="Refresh anyway"
      cancelLabel="Stay"
      onConfirm={onConfirm}
    />
  );
}

/** Switching cycles while an edit is still saving (or failed to save) asks first. */
export function CycleSwitchConfirm({
  cycleNumber,
  open,
  saveFailed,
  onOpenChange,
  onConfirm
}: {
  cycleNumber: number | null;
  open: boolean;
  saveFailed: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const target = cycleNumber ?? "";
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="default"
      title="Switch cycles?"
      description={
        saveFailed
          ? `Some changes haven't saved. Switch to Cycle ${target} and drop them?`
          : `Changes are still saving. Switch to Cycle ${target} anyway?`
      }
      confirmLabel="Switch anyway"
      cancelLabel="Stay"
      onConfirm={onConfirm}
    />
  );
}
