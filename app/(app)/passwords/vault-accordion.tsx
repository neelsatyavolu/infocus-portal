"use client";

import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { ChevronDown } from "lucide-react";
import type { VaultEntrySummary } from "@/src/lib/password-vault";
import { cn } from "@/src/lib/utils";
import { VaultEntryRow } from "./vault-entry-row";

function rowId(entryId: string) {
  return `vault-row-${entryId}`;
}

/** Clear of the app bar plus the sticky search on top, and of the phone tab bar below. */
const SCROLL_MARGINS =
  "scroll-mt-[calc(var(--app-header-h,0px)+var(--vault-toolbar-h,0px))] scroll-mb-[var(--phone-tabbar-h,0px)]";

/** Focus a row and keep it clear of the sticky search and the phone tab bar (its scroll margins). */
function focusRow(row: HTMLElement) {
  row.focus({ preventScroll: true });
  row.scrollIntoView({ block: "nearest" });
}

/**
 * Bring an open row and as much of its details as fit into view (the item's scroll margins keep
 * it clear of the sticky search and the tab bar). A row that ended up above the visible area,
 * because an open row above it just collapsed, goes to the top so its header never hides.
 */
export function revealVaultRow(entryId: string) {
  const row = document.getElementById(rowId(entryId));
  const item = row?.closest("li");
  if (!row || !item) return;
  const visibleTop = Number.parseFloat(window.getComputedStyle(item).scrollMarginTop) || 0;
  item.scrollIntoView({ block: row.getBoundingClientRect().top < visibleTop ? "start" : "nearest" });
}

/**
 * The login list on narrow screens: each row expands in place to show that login's details.
 * One row open at a time; collapsing it or opening another unmounts the details, which wipes
 * anything revealed. ↑/↓ move between rows; Esc inside the details closes them.
 */
export function VaultAccordion({
  listRef,
  entries,
  expandedId,
  onToggle,
  renderDetail
}: {
  listRef: RefObject<HTMLUListElement | null>;
  entries: VaultEntrySummary[];
  expandedId: string | null;
  onToggle: (id: string | null) => void;
  renderDetail: (entry: VaultEntrySummary) => ReactNode;
}) {
  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const target = event.target as HTMLElement;
    if (!target.matches("[data-vault-row]")) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-vault-row]") ?? []);
    const next = rows[rows.indexOf(target) + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    focusRow(next);
  }

  function toggle(entryId: string, open: boolean) {
    onToggle(open ? null : entryId);
    // After React has rendered the new body (and collapsed the old one), show what just opened.
    if (!open) window.requestAnimationFrame(() => revealVaultRow(entryId));
  }

  function collapse(entryId: string) {
    onToggle(null);
    const row = document.getElementById(rowId(entryId));
    if (row) focusRow(row);
  }

  return (
    <ul ref={listRef} aria-label="Logins" className="divide-y divide-border" onKeyDown={onListKeyDown}>
      {entries.map((entry) => {
        const open = entry.id === expandedId;
        const bodyId = `vault-details-${entry.id}`;
        return (
          <li
            key={entry.id}
            className={cn(
              "relative",
              SCROLL_MARGINS,
              open && "before:absolute before:inset-y-0 before:left-0 before:z-[1] before:w-[3px] before:bg-[var(--brand-green)]"
            )}
          >
            <button
              type="button"
              id={rowId(entry.id)}
              data-vault-row
              aria-expanded={open}
              aria-controls={open ? bodyId : undefined}
              onClick={() => toggle(entry.id, open)}
              className={cn(
                SCROLL_MARGINS,
                "grid min-h-16 w-full grid-cols-[2.25rem_minmax(0,1fr)_auto_1rem] items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:pointer-fine:min-h-14",
                open && "bg-[var(--ink-3)]"
              )}
            >
              <VaultEntryRow entry={entry} />
              <ChevronDown
                aria-hidden
                className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
              />
            </button>
            {open ? (
              <div
                id={bodyId}
                role="region"
                aria-labelledby={rowId(entry.id)}
                className="border-t border-border px-3 pb-3"
                onKeyDown={(event) => {
                  if (event.key !== "Escape" || event.defaultPrevented) return;
                  event.preventDefault();
                  collapse(entry.id);
                }}
              >
                {renderDetail(entry)}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
