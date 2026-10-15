import { applyUserDisplayNames } from "@/src/lib/user-display";

/**
 * What `ok(data)` (src/lib/http.ts) sends, as plain props: display names applied, then a JSON
 * round trip (dates become strings). Pages that load their first data on the server use it so
 * first paint matches the API response exactly.
 */
export function asApiJson<T>(data: T): T {
  return JSON.parse(JSON.stringify(applyUserDisplayNames(data))) as T;
}
