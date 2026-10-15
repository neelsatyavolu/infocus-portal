/**
 * Endpoints the hosted StageWorkspace writes through: A-roll approval (PATCH stage), queue and
 * uploads. Its reads of the same paths always carry a query string (`?stage=`, `?rowId=`), so a
 * bare path is a write.
 */
const WRITE_PATHS = new Set(["/api/package-cycle/stage", "/api/package-cycle/queue", "/api/package-cycle/upload"]);

/**
 * Feedback notes: the comments hook already shows the saved note, so a note only changes the
 * server statuses on A/B-roll, where it clears the A-roll approval.
 */
const COMMENTS_PATH = "/api/package-cycle/comments";

/**
 * True when a finished request (a Resource Timing entry) was one of the stage page's own writes
 * for this group: the paths above, a feedback note on the A/B-roll page, or this group's
 * Stage 1/2/3 decision endpoint.
 */
export function isStageWrite(
  entry: { name: string; initiatorType: string },
  origin: string,
  rowId: string,
  stage: string | undefined
): boolean {
  if (entry.initiatorType !== "fetch") return false;
  let url: URL;
  try {
    url = new URL(entry.name);
  } catch {
    return false;
  }
  if (url.origin !== origin || url.search) return false;
  if (url.pathname === COMMENTS_PATH) return stage === "a-roll";
  return WRITE_PATHS.has(url.pathname) || url.pathname === `/api/package-progress/${rowId}/approval`;
}
