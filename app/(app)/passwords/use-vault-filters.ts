"use client";

import { useMemo, useState } from "react";
import { useRememberedState } from "@/components/kit/remembered-state";
import type { VaultEntrySummary } from "@/src/lib/password-vault";
import { countVaultEntries, filterVaultEntries, isVaultFilter, type VaultFilter } from "./vault-logic";

/**
 * Search text plus the remembered "All / Shared" chip (execs only; everyone else always sees
 * All), the visible entries and the counts the list shows.
 */
export function useVaultFilters(entries: VaultEntrySummary[], canShare: boolean) {
  const [query, setQuery] = useState("");
  const [remembered, setRemembered] = useRememberedState<VaultFilter>("passwords:filter:v1", "all", isVaultFilter);
  const filter: VaultFilter = canShare ? remembered : "all";

  const visible = useMemo(() => filterVaultEntries(entries, query, filter), [entries, query, filter]);
  const counts = useMemo(() => countVaultEntries(entries), [entries]);

  function clear() {
    setQuery("");
    setRemembered("all");
  }

  return {
    query,
    setQuery,
    filter,
    setFilter: setRemembered,
    visible,
    counts,
    filtered: Boolean(query.trim()) || filter !== "all",
    clear
  };
}

export type VaultFilters = ReturnType<typeof useVaultFilters>;
