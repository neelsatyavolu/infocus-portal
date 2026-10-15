"use client";

import type { KeyboardEvent } from "react";
import type { VaultEntrySummary } from "@/src/lib/password-vault";
import { cn } from "@/src/lib/utils";
import { VaultEntryRow } from "./vault-entry-row";

export function vaultOptionId(entryId: string) {
  return `vault-option-${entryId}`;
}

/**
 * The login list in the split layout. The search field drives it as a combobox, and the list is
 * also one Tab stop of its own: while either has focus, ↑/↓ (and Home/End in the list) move the
 * selection through aria-activedescendant, and Enter jumps to the first copy button. A click
 * selects. The options hold no buttons. Selected: Ink 3 fill and the 3px green bar. Options
 * scroll clear of the sticky toolbar (`--vault-toolbar-h`) and the phone tab bar.
 */
export function VaultListbox({
  id,
  entries,
  selectedId,
  onSelect,
  onKeyDown
}: {
  id: string;
  entries: VaultEntrySummary[];
  selectedId: string;
  onSelect: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Logins"
      tabIndex={0}
      aria-activedescendant={vaultOptionId(selectedId)}
      onKeyDown={onKeyDown}
      className="divide-y divide-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {entries.map((entry) => {
        const selected = entry.id === selectedId;
        return (
          <li
            key={entry.id}
            id={vaultOptionId(entry.id)}
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(entry.id)}
            className={cn(
              "relative grid h-14 cursor-pointer scroll-mt-[calc(var(--app-header-h,0px)+var(--vault-toolbar-h,0px))] scroll-mb-[var(--phone-tabbar-h,0px)] grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 transition-colors hover:bg-[var(--ink-3)]",
              selected &&
                "bg-[var(--ink-3)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--brand-green)]"
            )}
          >
            <VaultEntryRow entry={entry} />
          </li>
        );
      })}
    </ul>
  );
}
