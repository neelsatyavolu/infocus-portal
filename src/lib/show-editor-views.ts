import { SHOW_EDIT_STAGE_LABELS, type ShowEditStage, type ShowEditStatus } from "@/src/lib/show-editor";

/**
 * The Editing tab (`/editing`, producers only): its views, its links, and the one-line summary The Show
 * shows for a date. Client-safe; the link server and the notifications build their URLs from here too.
 */

export const EDITING_VIEWS = ["show", "machines", "settings"] as const;

/**
 * The InFocus Editor setup app, linked from Machines. It bundles the graphics package (real names in its working
 * files), so it lives on the Drive, never in a public release: this route checks the producer, then redirects to
 * a short-lived Drive link.
 */
export const EDITOR_SETUP_APP_URL = "/api/show-roles/edits?setup=1";
export type EditingView = (typeof EDITING_VIEWS)[number];
export const EDITING_VIEW_LABELS: Record<EditingView, string> = { show: "Show", machines: "Machines", settings: "Settings" };

/** `?view=` → a view; anything else is Show. A link code always opens Machines, where its approval is. */
export function parseEditingView(view: string | null | undefined, link?: string | null): EditingView {
  if (link) return "machines";
  return EDITING_VIEWS.find((entry) => entry === view) ?? "show";
}

/** `/editing` with only what differs from the defaults (the next show, the Show view). */
export function editingHref({ date, view, link }: { date?: string | null; view?: EditingView; link?: string | null } = {}) {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (view && view !== "show") params.set("view", view);
  if (link) params.set("link", link);
  const query = params.toString();
  return query ? `/editing?${query}` : "/editing";
}

/** GET /api/show-roles/edits?date=…&summary=1: just enough for The Show's summary line. */
export type ShowEditSummary = {
  status: ShowEditStatus | null;
  stage: ShowEditStage | null;
  /** The show's YouTube publication status (DRAFT until scheduled), or null when nothing was uploaded. */
  publicationStatus: string | null;
};

/** The Show's one-line status for that date's edit: Not started, Editing: <stage>, Ready for review, Scheduled or Failed. */
export function editSummaryStatus(summary: ShowEditSummary): { tone: "neutral" | "info" | "review" | "success" | "danger"; label: string } {
  const sent = summary.publicationStatus !== null && summary.publicationStatus !== "DRAFT";
  if (sent || summary.status === "PUBLISHED") return { tone: "success", label: "Scheduled" };
  switch (summary.status) {
    case "QUEUED":
      return { tone: "info", label: "Editing: Waiting for the editing machine" };
    case "RUNNING":
      return { tone: "info", label: `Editing: ${summary.stage ? SHOW_EDIT_STAGE_LABELS[summary.stage] : "Starting"}` };
    case "REVIEW":
      return { tone: "review", label: "Ready for review" };
    case "FAILED":
      return { tone: "danger", label: "Failed" };
    default:
      // No edit yet, or the last one was cancelled: either way it can be started.
      return { tone: "neutral", label: "Not started" };
  }
}
