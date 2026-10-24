import { toast } from "sonner";

export function clipDownloadHref(rowId: string, ids: string[]) {
  const params = new URLSearchParams(ids.map((id) => ["id", id]));
  const query = params.toString();
  return `/api/package-cycle/a-roll/${encodeURIComponent(rowId)}/download${query ? `?${query}` : ""}`;
}

/**
 * Download one clip (its original file) or a zip of several; no ids means every clip. A HEAD
 * check runs first so a refusal (not ready, too big) shows as a toast; then the browser takes
 * the file itself, so a multi-GB zip streams straight to disk instead of into page memory.
 */
export async function downloadClips(rowId: string, ids: string[]) {
  const href = clipDownloadHref(rowId, ids);
  try {
    const check = await fetch(href, { method: "HEAD", cache: "no-store" });
    if (!check.ok) {
      const message = check.headers.get("x-infocus-error-message");
      toast.error(message ? decodeURIComponent(message) : "Could not start the download.");
      return false;
    }
  } catch {
    toast.error("Could not start the download. Check your connection and try again.");
    return false;
  }
  const link = document.createElement("a");
  link.href = href;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast.success(ids.length === 1 ? "Download started." : "Zip download started. Large footage can take a while.");
  return true;
}
