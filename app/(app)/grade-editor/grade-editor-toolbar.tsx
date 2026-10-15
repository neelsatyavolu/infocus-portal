"use client";

import type { RefObject } from "react";
import { ArrowUpDown, Download, RotateCw, Save } from "lucide-react";
import { ActionBar, CONTROL_HEIGHT, type ControlSize } from "@/components/kit/action-bar";
import { FilterChips } from "@/components/kit/filter-chips";
import { IconButton } from "@/components/kit/icon-button";
import { Kbd } from "@/components/kit/kbd";
import { ActionMenu, type MenuEntry } from "@/components/kit/menu";
import { SearchField } from "@/components/kit/search-field";
import { Spinner } from "@/components/kit/spinner";
import { CountBadge, StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/src/lib/utils";
import { LATE_POLICY_HINT, type CycleFilter, type SortBy, type ViewMode } from "./grade-editor-types";
import { STATUS_TONE } from "./grade-editor-utils";

const SORT_LABELS: Record<SortBy, string> = { firstName: "First name", lastName: "Last name" };

/** First / Last name sort (same storage key as before). */
export function SortSelect({
  value,
  onChange,
  size = "md",
  className
}: {
  value: SortBy;
  onChange: (value: SortBy) => void;
  size?: ControlSize;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex", CONTROL_HEIGHT[size], className)}>
      <ArrowUpDown aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <NativeSelect
        aria-label="Sort by"
        value={value}
        onChange={(event) => onChange(event.target.value === "lastName" ? "lastName" : "firstName")}
        className="h-full pl-8"
        wrapperClassName="h-full w-full"
      >
        <option value="firstName">{SORT_LABELS.firstName}</option>
        <option value="lastName">{SORT_LABELS.lastName}</option>
      </NativeSelect>
    </span>
  );
}

const CSV_TITLE = "Every reporter, in the current sort (search and filters don't apply)";
const SAVE_ALL_TITLE = "Save every unsaved row now (rows also save on their own)";

/**
 * Row 1 of the work panel. From md: search and sort at the start; Refresh, Download CSV and
 * (cycle view) Save all at the end. On phones it is one 40px row: search, then a ⋯ menu with the
 * sort and the same three actions. Search only narrows what's shown: Save all, Publish all and
 * the CSV always cover every reporter.
 */
export function GradeEditorToolbar({
  viewMode,
  search,
  onSearchChange,
  searchRef,
  sortBy,
  onSortChange,
  onRefresh,
  refreshing,
  refreshDisabled,
  onDownloadCsv,
  csvDisabled,
  dirtyCount,
  savingAll,
  saveAllDisabled,
  onSaveAll
}: {
  viewMode: Exclude<ViewMode, "student">;
  search: string;
  onSearchChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  sortBy: SortBy;
  onSortChange: (value: SortBy) => void;
  onRefresh: () => void;
  refreshing: boolean;
  refreshDisabled: boolean;
  onDownloadCsv: () => void;
  csvDisabled: boolean;
  dirtyCount: number;
  savingAll: boolean;
  saveAllDisabled: boolean;
  onSaveAll: () => void;
}) {
  const phoneMenu: MenuEntry[] = [
    { type: "label", label: "Sort by" },
    ...(["firstName", "lastName"] as const).map((key) => ({
      key,
      label: SORT_LABELS[key],
      checked: sortBy === key,
      onSelect: () => onSortChange(key)
    })),
    "separator",
    { key: "refresh", label: refreshing ? "Refreshing…" : "Refresh", icon: RotateCw, disabled: refreshDisabled || refreshing, onSelect: onRefresh },
    { key: "csv", label: "Download CSV", icon: Download, hint: "Every reporter, in the current sort", disabled: csvDisabled, onSelect: onDownloadCsv },
    {
      key: "save-all",
      label: savingAll ? "Saving…" : dirtyCount > 0 ? `Save all · ${dirtyCount}` : "Save all",
      icon: Save,
      disabled: saveAllDisabled,
      hidden: viewMode !== "cycle",
      onSelect: onSaveAll
    }
  ];

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <ActionBar size="touch" className="min-w-0 flex-1">
        <SearchField
          value={search}
          onChange={onSearchChange}
          inputRef={searchRef}
          placeholder="Search reporters"
          shortcut="/"
          size="touch"
          className="min-w-0 flex-1 md:max-w-72"
        />
        <SortSelect value={sortBy} onChange={onSortChange} size="touch" className="w-36 shrink-0 max-md:hidden" />
        <span className="flex shrink-0 md:hidden">
          <ActionMenu label="Sort and table actions" items={phoneMenu} variant="outline" className="h-10 w-10" />
        </span>
      </ActionBar>
      <ActionBar size="md" className="max-md:hidden" aria-label="Table actions">
        <IconButton
          label="Refresh"
          icon={RotateCw}
          variant="outline"
          busy={refreshing}
          disabled={refreshDisabled}
          onClick={onRefresh}
        />
        <Button type="button" variant="outline" onClick={onDownloadCsv} disabled={csvDisabled} title={CSV_TITLE} className="shrink-0">
          <Download aria-hidden />
          Download CSV
        </Button>
        {viewMode === "cycle" ? (
          <Button type="button" variant="outline" onClick={onSaveAll} disabled={saveAllDisabled} title={SAVE_ALL_TITLE} className="shrink-0">
            {savingAll ? <Spinner /> : <Save aria-hidden />}
            {savingAll ? "Saving…" : "Save all"}
            {!savingAll ? <CountBadge count={dirtyCount} tone="neutral" srLabel={`${dirtyCount} unsaved`} /> : null}
          </Button>
        ) : null}
      </ActionBar>
    </div>
  );
}

const FILTER_LABELS: Record<CycleFilter, string> = {
  all: "All",
  "to-publish": "Unpublished",
  "not-entered": "Not entered",
  missed: "Missed",
  republish: "Revised",
  "over-extensions": "Over extensions"
};

const FILTER_TITLES: Partial<Record<CycleFilter, string>> = {
  "to-publish": "Scored and not published (Revised included): the rows Publish all will publish",
  "not-entered": "No Final Cut score yet (exempt is excused)",
  missed: "No approved Final Cut by the deadline",
  republish: "Changed after publishing and not published again",
  "over-extensions": "Used more extension days than they have, across all cycles"
};

/** Count tones: the same tone as the matching row tag. */
const FILTER_TONES: Partial<Record<CycleFilter, (typeof STATUS_TONE)[keyof typeof STATUS_TONE]>> = {
  "not-entered": STATUS_TONE.notEntered,
  missed: STATUS_TONE.missed,
  republish: STATUS_TONE.revised,
  "over-extensions": "warning"
};

/** Row 2 (cycle view): filter chips with live counts. The legend is the panel's footer. */
export function CycleFilterRow({
  value,
  onChange,
  counts,
  size
}: {
  value: CycleFilter;
  onChange: (value: CycleFilter) => void;
  counts: Record<CycleFilter, number>;
  size: ControlSize;
}) {
  const options = (Object.keys(FILTER_LABELS) as CycleFilter[]).map((key) => ({
    value: key,
    label: FILTER_LABELS[key],
    count: counts[key],
    title: FILTER_TITLES[key],
    hideWhenZero: key !== "all",
    tone: FILTER_TONES[key]
  }));
  return <FilterChips ariaLabel="Show reporters" value={value} onChange={onChange} options={options} size={size} className="min-w-0" />;
}

const GRAMMAR_TEXT = "- ungraded, \\ exempt: both left out of totals.";
/** The late and revision rules, shortened for the footer line (LATE_POLICY_HINT on hover). */
const LATE_POLICY_SHORT = "Late −20%, −30% after 14 days · 2nd revision under 75% capped at 37/50";
const TOTAL_RULE = "Edits here only change this page and the CSV, and are gone after a reload. Notes save automatically.";

/**
 * The tables' one-line footer, under the scroll box: the score grammar, the Enter shortcut and
 * the view's rule (the late and revision rules on a cycle; temporary edits on Total grade). It
 * truncates on a narrow window; hover shows every word. Phones and tablets use the row sheets,
 * which carry the same words.
 */
export function Legend({ viewMode }: { viewMode: Exclude<ViewMode, "student"> }) {
  const rule = viewMode === "cycle" ? LATE_POLICY_HINT : `Temporary: ${TOTAL_RULE}`;
  return (
    <p
      title={`${GRAMMAR_TEXT} Enter / Shift+Enter in a score box: next or previous row. ${rule}`}
      className="flex min-w-0 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-t border-border px-4 py-2 text-xs text-muted-foreground"
    >
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <Kbd>-</Kbd> ungraded
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <Kbd>\</Kbd> exempt
      </span>
      <span className="shrink-0">both left out of totals</span>
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <Kbd>Enter</Kbd> next row
      </span>
      {viewMode === "total" ? (
        <StatusTag tone="neutral" size="sm">
          Temporary
        </StatusTag>
      ) : null}
      <span className="min-w-0 truncate">{viewMode === "cycle" ? LATE_POLICY_SHORT : TOTAL_RULE}</span>
    </p>
  );
}
