import { sanitizeSegment } from "@/src/lib/project-folders";

/** The headline becomes the YouTube title, which YouTube caps at 100 characters. */
export const HEADLINE_MAX_LENGTH = 100;

/** Why a Final Cut headline can't be used, or null when it is fine. */
export function headlineError(headline: string): string | null {
  const trimmed = headline.trim();
  if (!trimmed) return "Add a headline for your package.";
  if (trimmed.length > HEADLINE_MAX_LENGTH) return `Keep the headline to ${HEADLINE_MAX_LENGTH} characters or fewer.`;
  if (/[<>]/.test(trimmed)) return "The headline can't include < or >.";
  return null;
}

/**
 * The Final Cut video's title is the package headline. Final Cuts uploaded before
 * headlines were required were titled with the file name, so those return null.
 */
export function finalCutHeadline(
  item: { title: string; currentVersion: { nasPath: string | null } | null } | null | undefined
): string | null {
  const title = item?.title.trim();
  const nasPath = item?.currentVersion?.nasPath;
  if (!title || !nasPath) return null;
  // Drop the extension and the -vN suffix that later versions add to the file name.
  const fileBase = (nasPath.split("/").pop() ?? "").replace(/\.[^.]+$/, "").replace(/-v\d+$/, "");
  return sanitizeSegment(title, "") === fileBase ? null : title;
}
