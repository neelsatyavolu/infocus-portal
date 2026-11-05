"use client";

import { useRef, type KeyboardEvent } from "react";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { FilterChips } from "@/components/kit/filter-chips";
import { Button } from "@/components/ui/button";
import type { VaultAccess, VaultEntrySummary } from "@/src/lib/password-vault";
import type { VaultFilters } from "./use-vault-filters";
import { VaultAccordion, revealVaultRow } from "./vault-accordion";
import { VaultCount } from "./vault-count";
import { VaultEntryDetail } from "./vault-entry-detail";
import { VaultListbox, vaultOptionId } from "./vault-listbox";
import type { VaultFilter, VaultLayout } from "./vault-logic";
import { VaultSearch } from "./vault-search";

const LIST_ID = "vault-logins";

type BrowserProps = {
  access: VaultAccess;
  layout: VaultLayout;
  filters: VaultFilters;
  canShare: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  version: number;
  onShare: (entry: VaultEntrySummary) => void;
  onEdit: (entry: VaultEntrySummary) => void;
  onAnnounce: (message: string) => void;
};

function FilterRow({ filters, size }: { filters: VaultFilters; size: "sm" | "touch" }) {
  return (
    <FilterChips<VaultFilter>
      ariaLabel="Show"
      size={size}
      value={filters.filter}
      onChange={filters.setFilter}
      options={[
        { value: "all", label: "All", count: filters.counts.all },
        { value: "shared", label: "Shared", count: filters.counts.shared }
      ]}
    />
  );
}

/** The count beside the chips; the "All N" chip already shows the total. */
function Count({ filters, canShare }: { filters: VaultFilters; canShare: boolean }) {
  return (
    <VaultCount visible={filters.visible.length} counts={filters.counts} filtered={filters.filtered} showTotal={!canShare} />
  );
}

/** Execs: the chips, then the count at the row's end. Everyone else: the count alone, under the search. */
function FilterAndCount({ filters, canShare, size }: { filters: VaultFilters; canShare: boolean; size: "sm" | "touch" }) {
  return (
    <>
      {canShare ? <FilterRow filters={filters} size={size} /> : null}
      <div className={canShare ? "ml-auto shrink-0" : "min-w-0"}>
        <Count filters={filters} canShare={canShare} />
      </div>
    </>
  );
}

function NoMatch({ filters }: { filters: VaultFilters }) {
  const q = filters.query.trim();
  return (
    <EmptyState
      icon={SearchX}
      title={q ? `No logins match “${q}”` : "No shared logins"}
      description={q ? undefined : "Share a login from its details to see it here."}
      action={
        <Button type="button" variant="ghost" onClick={filters.clear}>
          {q ? "Clear search" : "Show all"}
        </Button>
      }
    />
  );
}

/** Scroll a login into view in whichever layout is mounted (the list option, or the open row). */
export function revealVaultEntry(entryId: string) {
  const option = document.getElementById(vaultOptionId(entryId));
  if (option) option.scrollIntoView({ block: "nearest" });
  else revealVaultRow(entryId);
}

/**
 * The full vault in one card. Wide (`split`): the login list on the left under its own search
 * and chips, the selected login on the right; the first visible login is selected (its summary
 * only; nothing is revealed). Narrow (`accordion`): rows that expand in place, one at a time.
 * Only one layout is mounted, so a login's revealed values never live in two places.
 */
export function VaultBrowser(props: BrowserProps) {
  return (
    <div className="overflow-clip rounded-md border border-border bg-card">
      {props.layout === "accordion" ? <AccordionLayout {...props} /> : <SplitLayout {...props} />}
    </div>
  );
}

function SplitLayout({ access, layout, filters, canShare, selectedId, onSelect, version, onShare, onEdit, onAnnounce }: BrowserProps) {
  const detailRef = useRef<HTMLDivElement>(null);
  const { visible } = filters;
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0] ?? null;

  function moveTo(index: number) {
    const target = visible[Math.min(visible.length - 1, Math.max(0, index))];
    if (!target) return;
    onSelect(target.id);
    document.getElementById(vaultOptionId(target.id))?.scrollIntoView({ block: "nearest" });
  }

  /** ↑/↓ from the search field or the list; Home/End only in the list (the field keeps them). */
  function onNavKeyDown(event: KeyboardEvent<HTMLElement>) {
    const current = selected ? visible.findIndex((entry) => entry.id === selected.id) : -1;
    const inList = event.currentTarget.getAttribute("role") === "listbox";
    let next: number | null = null;
    if (event.key === "ArrowDown") next = current + 1;
    else if (event.key === "ArrowUp") next = current - 1;
    else if (inList && event.key === "Home") next = 0;
    else if (inList && event.key === "End") next = visible.length - 1;
    if (next !== null) {
      event.preventDefault();
      moveTo(next);
    } else if (event.key === "Enter" && selected) {
      event.preventDefault();
      detailRef.current?.querySelector<HTMLElement>("[data-vault-copy-slot] button:not(:disabled)")?.focus();
    }
  }

  return (
    // --vault-toolbar-h: the list header's height (p-3 around an h-9 search, an 8px gap and the
    // h-8 chips row, plus its 1px rule). The detail header beside it takes the same height, so
    // their rules line up; on touch (or below lg) its website link is 40px, hence the taller value.
    <div className="grid grid-cols-[22rem_minmax(0,1fr)] [--vault-toolbar-h:6.75rem] lg:pointer-fine:[--vault-toolbar-h:6.3125rem]">
      <div className="min-w-0 border-r border-border">
        <div className="sticky top-[var(--app-header-h,0px)] z-10 flex min-h-[var(--vault-toolbar-h)] flex-col justify-center gap-2 border-b border-border bg-card p-3">
          <VaultSearch
            value={filters.query}
            onChange={filters.setQuery}
            onKeyDown={onNavKeyDown}
            combobox={{ listId: LIST_ID, activeId: selected ? vaultOptionId(selected.id) : null }}
          />
          <div className="flex min-h-8 min-w-0 items-center gap-3">
            <FilterAndCount filters={filters} canShare={canShare} size="sm" />
          </div>
        </div>
        {selected ? (
          <VaultListbox id={LIST_ID} entries={visible} selectedId={selected.id} onSelect={onSelect} onKeyDown={onNavKeyDown} />
        ) : null}
      </div>
      {selected ? (
        <div
          ref={detailRef}
          className="sticky top-[var(--app-header-h,0px)] max-h-[calc(100dvh-var(--app-header-h,0px)-var(--phone-tabbar-h,0px))] min-w-0 self-start overflow-y-auto"
        >
          <VaultEntryDetail
            key={selected.id}
            entry={selected}
            access={access}
            variant="pane"
            activityLayout={layout === "split-rail" ? "rail" : "disclosure"}
            version={version}
            onShare={() => onShare(selected)}
            onEdit={() => onEdit(selected)}
            onAnnounce={onAnnounce}
          />
        </div>
      ) : (
        // A search or chip that matches nothing: one state, centred in the big pane.
        <div className="flex min-w-0 items-center justify-center">
          <NoMatch filters={filters} />
        </div>
      )}
    </div>
  );
}

function AccordionLayout({ access, filters, canShare, selectedId, onSelect, version, onShare, onEdit, onAnnounce }: BrowserProps) {
  const listRef = useRef<HTMLUListElement>(null);

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowDown") return;
    const first = listRef.current?.querySelector<HTMLElement>("[data-vault-row]");
    if (!first) return;
    event.preventDefault();
    first.focus();
  }

  return (
    // Only the search sticks (p-3 around an h-10 / md:h-9 field, plus its 1px rule), so a
    // phone keeps room for an open login; the chips and count scroll away with the list.
    <div className="[--vault-toolbar-h:4.0625rem] md:[--vault-toolbar-h:3.8125rem]">
      <div className="sticky top-[var(--app-header-h,0px)] z-10 border-b border-border bg-card p-3">
        <VaultSearch value={filters.query} onChange={filters.setQuery} size="touch" onKeyDown={onSearchKeyDown} />
      </div>
      <div className="flex min-h-12 min-w-0 items-center gap-3 border-b border-border px-3 py-1">
        <FilterAndCount filters={filters} canShare={canShare} size="touch" />
      </div>
      {filters.visible.length ? (
        <VaultAccordion
          listRef={listRef}
          entries={filters.visible}
          expandedId={selectedId}
          onToggle={onSelect}
          renderDetail={(entry) => (
            <VaultEntryDetail
              key={entry.id}
              entry={entry}
              access={access}
              variant="inline"
              version={version}
              onShare={() => onShare(entry)}
              onEdit={() => onEdit(entry)}
              onAnnounce={onAnnounce}
            />
          )}
        />
      ) : (
        <NoMatch filters={filters} />
      )}
    </div>
  );
}
