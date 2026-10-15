/**
 * Endpoints the hosted StageWorkspace writes through: A-roll approval (PATCH stage), queue,
 * uploads and feedback. Its reads of the same paths always carry a query string (`?stage=`,
 * `?rowId=`), so a bare path is a write.
 */
const WRITE_PATHS = new Set([
  "/api/package-cycle/stage",
  "/api/package-cycle/queue",
  "/api/package-cycle/upload",
  "/api/package-cycle/comments"
]);

/**
 * True when a finished request (a Resource Timing entry) was one of the stage page's own writes
 * for this group: the paths above, or this group's Stage 1/2/3 decision endpoint.
 */
export function isStageWrite(
  entry: { name: string; initiatorType: string },
  origin: string,
  rowId: string
): boolean {
  if (entry.initiatorType !== "fetch") return false;
  let url: URL;
  try {
    url = new URL(entry.name);
  } catch {
    return false;
  }
  if (url.origin !== origin || url.search) return false;
  return WRITE_PATHS.has(url.pathname) || url.pathname === `/api/package-progress/${rowId}/approval`;
}
