"use client";

import type { ReactNode } from "react";
import { ArrowUpDown, ChevronDown, Grid3X3, List, ListFilter, Trash2 } from "lucide-react";
import { Toolbar } from "@/components/kit/action-bar";
import { ActionMenu } from "@/components/kit/menu";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { DropdownOption } from "@/components/video-card-menu";
import { LIST_CHECK_INSET } from "@/components/project-assets/list-layout";
import type { FilterValue, ScopeMode, SortValue, ViewMode } from "@/components/project-assets/types";
import { cn } from "@/src/lib/utils";

const STATUS_OPTIONS: DropdownOption<FilterValue>[] = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "in-progress", label: "In progress" },
  { value: "failed", label: "Failed" }
];

const SORT_OPTIONS: DropdownOption<SortValue>[] = [
  { value: "recent", label: "Recent" },
  { value: "name", label: "Name" },
  { value: "status", label: "Status" }
];

type ProjectAssetsToolbarProps = {
  scope: ScopeMode;
  filterValue: FilterValue;
  sortValue: SortValue;
  viewValue: ViewMode;
  onFilterChange: (value: FilterValue) => void;
  onSortChange: (value: SortValue) => void;
  onViewChange: (value: ViewMode) => void;
  /** Tri-state select-all over this page's assets. */
  selectAll: "none" | "some" | "all";
  canSelect: boolean;
  onToggleAll: () => void;
  /**
   * Muted count of the assets in this view ("12 assets", "2 failed", "41–80 of 112"): after the
   * Status filter from sm, on its own line under the row on phones (the row has no room left).
   */
  meta?: ReactNode;
  /** A filter, sort, folder or page change is loading. */
  busy: boolean;
  showDeleteAllPermanently: boolean;
  deleting: boolean;
  onDeleteAllPermanently: () => void;
  className?: string;
};

/**
 * The one row under the project header: select all · Status · count … Sort · Grid/List, all at
 * one height (40px below md). In List view the select-all box lines up with the rows' checkbox
 * column (LIST_CHECK_INSET). The Status filter is a segmented control when the page column is
 * wide and a menu when it's narrow (phones too, so the row stays one line). It's hidden in
 * Recently deleted, where the server ignores it.
 */
export function ProjectAssetsToolbar({
  scope,
  filterValue,
  sortValue,
  viewValue,
  onFilterChange,
  onSortChange,
  onViewChange,
  selectAll,
  canSelect,
  onToggleAll,
  meta,
  busy,
  showDeleteAllPermanently,
  deleting,
  onDeleteAllPermanently,
  className
}: ProjectAssetsToolbarProps) {
  const showStatus = scope === "active";
  const statusLabel = STATUS_OPTIONS.find((option) => option.value === filterValue)?.label ?? "All";
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sortValue)?.label ?? "Recent";

  return (
    <div className={cn("@container min-w-0", className)}>
      <Toolbar
        aria-label="Filter and view"
        size="touch"
        busy={busy}
        start={
          <>
            <span
              title="Select videos for bulk actions"
              className={cn("flex w-10 shrink-0 items-center justify-center", viewValue === "list" && LIST_CHECK_INSET.toolbar)}
            >
              <Checkbox
                size="md"
                checked={selectAll === "all" ? true : selectAll === "some" ? "indeterminate" : false}
                onCheckedChange={onToggleAll}
                disabled={!canSelect}
                aria-label="Select all on this page"
              />
            </span>
            {showStatus ? (
              <>
                <SegmentedControl<FilterValue>
                  ariaLabel="Status"
                  value={filterValue}
                  onChange={onFilterChange}
                  options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                  className="hidden @min-[47.5rem]:inline-flex"
                />
                <ActionMenu
                  label="Status filter"
                  align="start"
                  items={STATUS_OPTIONS.map((option) => ({
                    key: option.value,
                    label: option.label,
                    checked: option.value === filterValue,
                    onSelect: () => onFilterChange(option.value)
                  }))}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={`Status: ${statusLabel}`}
                      className="max-sm:px-3 @min-[47.5rem]:hidden"
                    >
                      <ListFilter aria-hidden className="sm:hidden" />
                      <span aria-hidden className="text-muted-foreground max-sm:hidden">
                        Status:
                      </span>
                      <span aria-hidden>{statusLabel}</span>
                      <ChevronDown className="opacity-50" aria-hidden />
                    </Button>
                  }
                />
              </>
            ) : null}
          </>
        }
        meta={meta ? <span className="max-sm:hidden">{meta}</span> : null}
        end={
          <>
            <ActionMenu
              label="Sort by"
              items={SORT_OPTIONS.map((option) => ({
                key: option.value,
                label: option.label,
                checked: option.value === sortValue,
                onSelect: () => onSortChange(option.value)
              }))}
              trigger={
                <Button type="button" variant="outline" aria-label={`Sort by ${sortLabel}`} className="max-sm:w-10 max-sm:px-0">
                  <ArrowUpDown aria-hidden />
                  <span className="max-sm:hidden">{sortLabel}</span>
                </Button>
              }
            />
            <SegmentedControl<ViewMode>
              ariaLabel="Layout"
              value={viewValue}
              onChange={onViewChange}
              iconOnly
              options={[
                { value: "grid", icon: Grid3X3, ariaLabel: "Grid view", title: "Grid view" },
                { value: "list", icon: List, ariaLabel: "List view", title: "List view" }
              ]}
            />
            {showDeleteAllPermanently ? (
              <Button type="button" variant="destructive-quiet" onClick={onDeleteAllPermanently} disabled={deleting}>
                <Trash2 aria-hidden />
                <span>
                  Delete all<span className="max-sm:sr-only"> permanently</span>
                </span>
              </Button>
            ) : null}
          </>
        }
      />
      {meta ? <p className="mt-2 text-xs text-muted-foreground sm:hidden">{meta}</p> : null}
    </div>
  );
}
