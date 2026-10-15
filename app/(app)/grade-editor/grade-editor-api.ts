import type { AdminGradesPayload, MissingPayload, TotalsPayload } from "./grade-editor-types";

/** GET /api/grades/admin readers. Same URLs and errors as before the split. */

export async function fetchTotals() {
  const response = await fetch(`/api/grades/admin?view=totals`, { cache: "no-store" });
  const payload = (await response.json()) as { data?: TotalsPayload; error?: { message?: string } };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load totals.");
  }
  return payload.data;
}

export async function fetchGrades(cycleNumber: number) {
  const response = await fetch(`/api/grades/admin?cycle=${cycleNumber}`, { cache: "no-store" });
  const payload = (await response.json()) as { data?: AdminGradesPayload; error?: { message?: string } };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load grades.");
  }

  return payload.data;
}

export async function fetchMissing() {
  const response = await fetch(`/api/grades/admin?view=missing`, { cache: "no-store" });
  const payload = (await response.json()) as { data?: MissingPayload; error?: { message?: string } };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load missing grades.");
  }
  return payload.data;
}

/** Client-cache keys (src/lib/client-cache.ts): last-seen payloads for an instant return. */
export const TOTALS_CACHE_KEY = "grade-editor:totals";
export const MISSING_CACHE_KEY = "grade-editor:missing";
export function studentCacheKey(userId: string) {
  return `grade-editor:student:${userId}`;
}
