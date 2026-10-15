/** J/K list shortcuts (Groups list and group stage pages). */
export type ListShortcut = "next" | "previous";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function listShortcut(event: KeyboardEvent): ListShortcut | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (target && (TYPING_TAGS.has(target.tagName ?? "") || target.isContentEditable)) return null;
  const key = event.key.toLowerCase();
  if (key === "j") return "next";
  if (key === "k") return "previous";
  return null;
}

export function neighborIds(order: string[], currentId: string) {
  const index = order.indexOf(currentId);
  if (index === -1) return { previous: null, next: null };
  return { previous: order[index - 1] ?? null, next: order[index + 1] ?? null };
}

/** The Groups page saves the order it shows so a group's page can step to the next one. */
const GROUP_ORDER_KEY = "groups:order:v1";

type OrderStorage = Pick<Storage, "getItem" | "setItem">;

export function writeGroupOrder(storage: OrderStorage, ids: string[]) {
  try {
    storage.setItem(GROUP_ORDER_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private mode); Previous/Next just won't show.
  }
}

export function readGroupOrder(storage: OrderStorage): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(GROUP_ORDER_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
