"use client";

import type { RefObject } from "react";
import { LayoutGrid, MoreHorizontal, RefreshCcw, Table2 } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { FilterChips, type FilterChipOption } from "@/components/kit/filter-chips";
import { IconButton } from "@/components/kit/icon-button";
import { ActionMenu, visibleMenuEntries, type MenuEntry } from "@/components/kit/menu";
import { CyclePicker } from "@/components/kit/pickers";
import { SegmentedControl } from "@/components/kit/segmented-control";
import type { CycleTab } from "./group-row-model";
import type { ViewMode } from "./use-groups-prefs";

export type GroupsFilter = "all" | "needs-you" | "behind";

const VIEW_OPTIONS = [
  { value: "cards" as const, icon: LayoutGrid, ariaLabel: "Tiles", label: <span className="max-sm:sr-only">Tiles</span> },
  { value: "chart" as const, icon: Table2, ariaLabel: "Progress", label: <span className="max-sm:sr-only">Progress</span> }
];

/**
 * The row under the header, anchored left in both views. Desktop: [Tiles | Progress] [chips] …
 * [Cycle] [Refresh]. Phones: [view] [Cycle (fills, truncates)] [Refresh] [⋯] on the first line
 * (it never breaks), the chip strip on the second, every control 40px. The ⋯ menu holds the
 * header actions, which are hidden on phones. Status (Saving…) lives in the page header, never
 * in this row.
 */
export function GroupsToolbar({
  viewMode,
  onViewModeChange,
  filter,
  onFilterChange,
  filterOptions,
  showFilters,
  cycles,
  activeCycleNumber,
  currentCycle,
  onCycleChange,
  refreshing,
  onRefresh,
  phoneMenu,
  phoneMenuTriggerRef
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  filter: GroupsFilter;
  onFilterChange: (filter: GroupsFilter) => void;
  filterOptions: Array<FilterChipOption<GroupsFilter>>;
  showFilters: boolean;
  cycles: CycleTab[];
  activeCycleNumber: number;
  currentCycle: number;
  onCycleChange: (cycleNumber: number) => void;
  refreshing: boolean;
  onRefresh: () => void;
  phoneMenu: MenuEntry[];
  /** The ⋯ button, so a dialog opened from the menu can return focus to it. */
  phoneMenuTriggerRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-x-3">
      <SegmentedControl ariaLabel="View" size="touch" value={viewMode} onChange={onViewModeChange} options={VIEW_OPTIONS} />
      {showFilters ? (
        <FilterChips
          ariaLabel="Filter groups"
          size="touch"
          value={filter}
          onChange={onFilterChange}
          options={filterOptions}
          className="max-sm:order-last max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:max-w-none max-sm:px-4"
        />
      ) : null}
      {/* Phones: flex-basis 0, so this cluster takes the rest of the first line and never wraps it. */}
      <ActionBar
        size="touch"
        align="end"
        aria-label="Cycle and refresh"
        className="ml-auto max-sm:min-w-0 max-sm:flex-1 max-sm:flex-nowrap"
      >
        <CyclePicker
          cycles={cycles}
          value={activeCycleNumber}
          currentCycle={currentCycle}
          onChange={onCycleChange}
          className="max-sm:min-w-0 max-sm:max-w-none max-sm:flex-1"
        />
        <IconButton label="Refresh" icon={RefreshCcw} variant="outline" busy={refreshing} onClick={onRefresh} />
        {visibleMenuEntries(phoneMenu).length > 0 ? (
          <ActionMenu
            label="More actions"
            items={phoneMenu}
            trigger={
              <IconButton
                ref={phoneMenuTriggerRef}
                label="More actions"
                title="More actions"
                icon={MoreHorizontal}
                variant="outline"
                size="touch"
                tooltip={false}
                className="sm:hidden"
              />
            }
          />
        ) : null}
      </ActionBar>
    </div>
  );
}
