"use client";

import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { CardGrid } from "@/components/kit/layout";
import { Button } from "@/components/ui/button";
import type { VaultFilters } from "./use-vault-filters";
import { VaultCount } from "./vault-count";
import { VaultEntryDetail } from "./vault-entry-detail";
import { VaultSearch } from "./vault-search";

/** Wide enough for a card's field rows to keep their label | value | buttons columns. */
const CARD_MIN_WIDTH = "28rem";

/**
 * Someone outside the vault with a few shared logins: search and the count on top, then one card
 * per login, ready to copy, with no list to pick from. No notes, no editing, no activity.
 */
export function VaultSharedCards({
  filters,
  version,
  onAnnounce
}: {
  filters: VaultFilters;
  version: number;
  onAnnounce: (message: string) => void;
}) {
  const q = filters.query.trim();

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Find a login" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <VaultSearch value={filters.query} onChange={filters.setQuery} size="touch" className="w-full sm:w-72" />
        <VaultCount visible={filters.visible.length} counts={filters.counts} filtered={filters.filtered} />
      </div>
      {filters.visible.length ? (
        <CardGrid minItemWidth={CARD_MIN_WIDTH}>
          {filters.visible.map((entry) => (
            <article key={entry.id} className="min-w-0 rounded-md border border-border bg-card">
              <VaultEntryDetail entry={entry} access="shared" variant="card" version={version} onAnnounce={onAnnounce} />
            </article>
          ))}
        </CardGrid>
      ) : (
        <div className="rounded-md border border-border bg-card">
          <EmptyState
            icon={SearchX}
            title={`No logins match “${q}”`}
            action={
              <Button type="button" variant="ghost" onClick={filters.clear}>
                Clear search
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
