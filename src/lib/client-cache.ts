/**
 * Last-seen data for pages that load on the client, so returning to a page shows it at once
 * while a quiet refresh runs (stale-while-revalidate). In memory only: it lasts for this tab,
 * and AppShell clears it whenever the signed-in identity changes (sign-in, View as).
 */
const MAX_ENTRIES = 40;
const store = new Map<string, unknown>();
let owner: string | null = null;

export function cachedValue<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function rememberValue<T>(key: string, value: T) {
  store.delete(key);
  store.set(key, value);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** Drops everything when the person changes; returns true when it did. */
export function setClientCacheOwner(next: string | null) {
  if (next === owner) return false;
  owner = next;
  store.clear();
  return true;
}
