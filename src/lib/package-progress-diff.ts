/**
 * Helpers for the Package Cycle roster save: skip rows and member lists the
 * save would leave exactly as they are, so a big roster does not run 60-90
 * writes inside one transaction when only a cell or two changed.
 */

import { jsonEqual } from "@/src/lib/json-equal";

/**
 * True when writing `data` would change the stored row. A field whose value is
 * `undefined` is left alone by Prisma, so it never counts as a change. A field
 * missing from `prior` counts as a change, so an incomplete select can only
 * cause an extra write, never a skipped one.
 */
export function progressRowChanged(
  prior: Record<string, unknown>,
  data: Record<string, unknown>
): boolean {
  return Object.entries(data).some(([key, value]) => {
    if (value === undefined) return false;
    if (!Object.prototype.hasOwnProperty.call(prior, key)) return true;
    return !jsonEqual(prior[key], value);
  });
}

/** True when the saved member list differs from the requested one (order ignored). */
export function memberSetChanged(priorUserIds: string[], nextUserIds: string[]): boolean {
  const prior = new Set(priorUserIds);
  const next = new Set(nextUserIds);
  if (prior.size !== next.size) return true;
  for (const userId of next) {
    if (!prior.has(userId)) return true;
  }
  return false;
}
