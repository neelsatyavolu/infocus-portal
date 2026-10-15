"use client";

import type { ReactNode, RefObject } from "react";
import { AlertTriangle, ArrowUpDown, SearchX } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { FilterChips } from "@/components/kit/filter-chips";
import { ListRow } from "@/components/kit/list-row";
import { ActionMenu } from "@/components/kit/menu";
import { NameSortSelect } from "@/components/kit/pickers";
import { SearchField } from "@/components/kit/search-field";
import { StatusTag } from "@/components/kit/status-tag";
import { nameSortMenuEntries } from "@/components/people/people-ui";
import { Button } from "@/components/ui/button";
import type { NameSortKey } from "@/src/lib/name-sort";
import { cn } from "@/src/lib/utils";
import { type MemberRow, type NoteFilter, coverageLabel, personLabel } from "./member-notes-model";

export type FilterCounts = Record<NoteFilter, number>;

export const FILTER_LABELS: Record<NoteFilter, string> = {
  all: "All",
  with: "With note",
  without: "No note"
};

/**
 * The roster's own controls, on top of the roster card so they sit over what they filter:
 * search and sort, then All / With note / No note for the active tab (with counts).
 * `wide` (the whole-class layout): one row from lg, with the sort as a select at the end.
 */
export function RosterHeader({
  wide,
  query,
  onQueryChange,
  sortBy,
  onSortChange,
  filter,
  counts,
  onFilterChange,
  tabName,
  className
}: {
  wide: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  sortBy: NameSortKey;
  onSortChange: (sort: NameSortKey) => void;
  filter: NoteFilter;
  counts: FilterCounts;
  onFilterChange: (filter: NoteFilter) => void;
  /** "General" or "Cycle 03". */
  tabName: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3", className)}>
      <SearchField
        value={query}
        onChange={onQueryChange}
        placeholder="Search members…"
        shortcut="/"
        size="touch"
        className={cn("min-w-0 flex-1", wide && "lg:w-64 lg:flex-none")}
      />
      <ActionMenu
        label="Sort members"
        triggerIcon={ArrowUpDown}
        variant="outline"
        className={cn("h-10 md:h-9", wide && "lg:hidden")}
        items={nameSortMenuEntries(sortBy, onSortChange)}
      />
      <FilterChips
        ariaLabel={`Show members by ${tabName} note`}
        size="touch"
        value={filter}
        onChange={onFilterChange}
        options={(Object.keys(FILTER_LABELS) as NoteFilter[]).map((value) => ({
          value,
          label: FILTER_LABELS[value],
          count: counts[value]
        }))}
        className={cn("basis-full", wide && "lg:min-w-0 lg:flex-1 lg:basis-auto")}
      />
      {wide ? <NameSortSelect value={sortBy} onChange={onSortChange} ariaLabel="Sort members" className="hidden w-40 lg:flex" /> : null}
    </div>
  );
}

/** What the roster says when search or a filter leaves nobody (one compact row with its fix). */
export function RosterEmpty({
  query,
  filter,
  tabName,
  onClearSearch,
  onShowAll
}: {
  query: string;
  filter: NoteFilter;
  tabName: string;
  onClearSearch: () => void;
  onShowAll: () => void;
}) {
  if (query.trim()) {
    return (
      <EmptyState
        size="inline"
        icon={SearchX}
        title="No members match that search."
        action={
          <Button type="button" variant="ghost" size="sm" className="max-md:h-10!" onClick={onClearSearch}>
            Clear search
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      size="inline"
      title={filter === "without" ? `Everyone has a ${tabName} note.` : `No ${tabName} notes yet.`}
      action={
        <Button type="button" variant="ghost" size="sm" className="max-md:h-10!" onClick={onShowAll}>
          Show all
        </Button>
      }
    />
  );
}

/**
 * One small square per tab (General, then each cycle): filled green when this person has a note
 * there, outlined when not; the active tab's square is ringed. Decorative — the row's text says
 * the same for screen readers.
 */
function NoteCoverage({ tabs, filled, activeTab }: { tabs: number[]; filled: number[]; activeTab: number }) {
  return (
    <span aria-hidden className="flex items-center gap-1">
      {tabs.map((tab) => (
        <span
          key={tab}
          className={cn(
            "h-1.5 w-1.5 rounded-[1px] border",
            filled.includes(tab) ? "border-[var(--brand-green)] bg-[var(--brand-green)]" : "border-muted-foreground/60",
            tab === activeTab && "outline outline-1 outline-offset-1 outline-foreground"
          )}
        />
      ))}
    </span>
  );
}

/**
 * The roster pane of the one-person layout: the RosterHeader, then one 56px row per member (name
 * over email; save state, then the note-coverage squares on the right). From lg the card scrolls
 * on its own inside the sticky list column, with the header pinned.
 */
export function MemberList({
  header,
  empty,
  members,
  tabs,
  activeTab,
  selectedId,
  onSelect,
  filledTabs,
  savingFor,
  errorFor,
  listRef
}: {
  header: ReactNode;
  /** Shown in place of the rows when search or a filter leaves nobody. */
  empty: ReactNode;
  members: MemberRow[];
  /** General (0) and every cycle, in order. */
  tabs: number[];
  activeTab: number;
  selectedId: string | null;
  onSelect: (memberId: string, options: { viaKeyboard: boolean }) => void;
  filledTabs: (memberId: string) => number[];
  savingFor: (memberId: string) => boolean;
  errorFor: (memberId: string) => string | null;
  listRef: RefObject<HTMLUListElement | null>;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card lg:max-h-[inherit] lg:overflow-y-auto">
      <div className="lg:sticky lg:top-0 lg:z-10 lg:bg-card">{header}</div>
      {empty ?? (
        <ul ref={listRef} aria-label="Members" className="divide-y divide-border">
          {members.map((member) => {
            const filled = filledTabs(member.id);
            const error = errorFor(member.id);
            return (
              <ListRow
                key={member.id}
                className="scroll-mt-28"
                active={member.id === selectedId}
                // A keyboard press (Enter/Space) opens the person with the cursor in their note.
                onClick={(event) => onSelect(member.id, { viaKeyboard: event.detail === 0 })}
                title={personLabel(member)}
                subtitle={
                  <>
                    {member.email ? <span className="font-mono-broadcast text-[11px]">{member.email}</span> : null}
                    <span className="sr-only">{`. ${coverageLabel(filled)}`}</span>
                  </>
                }
                tags={
                  error ? (
                    <StatusTag tone="danger" size="sm" icon={AlertTriangle} title={error}>
                      Couldn&apos;t save
                    </StatusTag>
                  ) : null
                }
                busy={savingFor(member.id)}
                trailing={<NoteCoverage tabs={tabs} filled={filled} activeTab={activeTab} />}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
