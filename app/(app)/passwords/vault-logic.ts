import type { VaultEntrySummary } from "@/src/lib/password-vault";

/** The chip filter. "shared" is only offered to execs; everyone else always sees All. */
export type VaultFilter = "all" | "shared";

export function isVaultFilter(value: unknown): value is VaultFilter {
  return value === "all" || value === "shared";
}

/** Trimmed, case-insensitive match on name, website or username, plus the chip filter (AND). */
export function filterVaultEntries(entries: VaultEntrySummary[], query: string, filter: VaultFilter) {
  const q = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter === "shared" && entry.sharedWith <= 0) return false;
    if (!q) return true;
    return [entry.name, entry.url ?? "", entry.username ?? ""].some((value) => value.toLowerCase().includes(q));
  });
}

export type VaultCounts = { all: number; shared: number; withTotp: number };

export function countVaultEntries(entries: VaultEntrySummary[]): VaultCounts {
  return {
    all: entries.length,
    shared: entries.filter((entry) => entry.sharedWith > 0).length,
    withTotp: entries.filter((entry) => entry.hasTotp).length
  };
}

export type VaultLayout = "split" | "split-rail" | "accordion";

/** List + detail side by side from this card width (px); narrower cards expand rows in place. */
const SPLIT_MIN_WIDTH = 896;
/** From this width the detail has room for Recent activity beside the fields. */
const RAIL_MIN_WIDTH = 1120;

/** Picks the vault layout from the card's measured width (0 before it is measured → narrow). */
export function layoutFor(width: number): VaultLayout {
  if (width >= RAIL_MIN_WIDTH) return "split-rail";
  if (width >= SPLIT_MIN_WIDTH) return "split";
  return "accordion";
}

/** "123456" → "123 456" (any other shape is shown as is). */
export function formatTotpCode(code: string) {
  return code.replace(/^(\d{3})(\d+)$/, "$1 $2");
}
