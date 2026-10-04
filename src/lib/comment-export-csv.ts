import type { ReviewCommentDto } from "@/src/lib/types";
import { DEFAULT_REVIEW_FPS, formatFrameAccurateTimecode, frameNumberFromSeconds } from "@/src/lib/timecode";

// Same columns the CSV importer reads (Comment, Timecode, Frame, Commented At, Reply), so an export re-imports cleanly.
const HEADERS = ["#", "Commenter", "Comment", "Timecode", "Frame", "Commented At", "Reply", "Resolved"];

function csvCell(value: string | number) {
  const text = String(value);
  // Keep spreadsheets from running user text as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, "\"\"")}"` : safe;
}

function formatCommentedAt(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  const hour12 = date.getHours() % 12 || 12;
  const meridiem = date.getHours() < 12 ? "AM" : "PM";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hour12}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${meridiem}`;
}

function compareRoots(a: ReviewCommentDto, b: ReviewCommentDto) {
  const aGeneral = a.targetType === "GENERAL";
  const bGeneral = b.targetType === "GENERAL";
  if (aGeneral !== bGeneral) {
    return aGeneral ? 1 : -1;
  }
  if (!aGeneral && a.timeSeconds !== b.timeSeconds) {
    return a.timeSeconds - b.timeSeconds;
  }
  return a.createdAt.localeCompare(b.createdAt);
}

function commentRow(comment: ReviewCommentDto, threadNumber: number, resolvedAt: string | null, fps: number) {
  const timed = comment.targetType !== "GENERAL";
  const frame = comment.frameNumber ?? frameNumberFromSeconds(comment.timeSeconds, fps);
  return [
    threadNumber,
    comment.authorName,
    comment.body,
    timed ? formatFrameAccurateTimecode(comment.timeSeconds, frame, fps) : "",
    timed ? frame : "",
    formatCommentedAt(comment.createdAt),
    comment.parentCommentId ? "Yes" : "No",
    resolvedAt ? "Yes" : "No"
  ].map(csvCell).join(",");
}

/** One row per comment: each thread's root, then its replies oldest first. Replies share the root's # and Resolved. */
export function buildCommentsCsv(comments: ReviewCommentDto[], fps = DEFAULT_REVIEW_FPS) {
  const roots = comments.filter((comment) => comment.parentCommentId === null).sort(compareRoots);
  const rows = roots.flatMap((root, index) => {
    const replies = comments
      .filter((comment) => comment.parentCommentId === root.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return [root, ...replies].map((comment) => commentRow(comment, index + 1, root.resolvedAt, fps));
  });
  return [HEADERS.join(","), ...rows].join("\r\n") + "\r\n";
}
