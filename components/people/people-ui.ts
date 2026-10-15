"use client";

import { useSyncExternalStore } from "react";
import type { MenuEntry } from "@/components/kit/menu";
import type { NameSortKey } from "@/src/lib/name-sort";

/** Shared by Members and Participation (the People hub). */

const NAME_SORT_KEYS: readonly NameSortKey[] = ["lastName", "firstName", "email"];

const NAME_SORT_LABELS: Record<NameSortKey, string> = {
  lastName: "Last name",
  firstName: "First name",
  email: "Email"
};

export function isNameSortKey(value: unknown): value is NameSortKey {
  return typeof value === "string" && (NAME_SORT_KEYS as readonly string[]).includes(value);
}

/** The Last name / First name / Email choices as ActionMenu items (the phone sort menu). */
export function nameSortMenuEntries(value: NameSortKey, onChange: (next: NameSortKey) => void): MenuEntry[] {
  return NAME_SORT_KEYS.map((key) => ({
    key: `sort-${key}`,
    label: NAME_SORT_LABELS[key],
    checked: value === key,
    onSelect: () => onChange(key)
  }));
}

function subscribeNever() {
  return () => undefined;
}

/**
 * False during the server render and hydration, true afterwards (and right away on a client-side
 * navigation). Pages that depend on the viewer's clock or viewport wait for it, so the server's
 * UTC date or desktop guess never flashes on screen.
 */
export function useMounted() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
}

function isApplePlatform() {
  return /Mac|iPhone|iPad/i.test(navigator.userAgent);
}

/**
 * True on Apple devices (⌘ in key hints), false elsewhere. False during the server render and
 * hydration, so the key hint never causes a hydration mismatch.
 */
export function useIsApplePlatform() {
  return useSyncExternalStore(subscribeNever, isApplePlatform, () => false);
}
