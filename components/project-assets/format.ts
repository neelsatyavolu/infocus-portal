import { isApprovalTransitionAllowed } from "@/src/lib/approval";
import { folderDisplayName, isDirectChildFolder } from "@/src/lib/project-folders";
import { PORTAL_DOMAINS } from "@/src/lib/hosts";
import type {
  ActiveUpload,
  ApprovalStatusValue,
  AssignedMember,
  FilterValue,
  FolderItem,
  MediaStatusValue,
  MediaTileItem,
  MediaTileVersion,
  ScopeMode,
  ThumbStatus
} from "@/components/project-assets/types";

/** Pure helpers for the project assets screen (no DOM, so they run in unit tests). */

export const APPROVAL_STATUSES: ApprovalStatusValue[] = ["IN_REVIEW", "NEEDS_CHANGES", "APPROVED", "AIRED"];

export function titleFromFileName(fileName: string) {
  const cleaned = fileName.replace(/\.[^/.]+$/, "").trim();
  return cleaned.length > 0 ? cleaned : "Untitled upload";
}

export function isImageFile(file: { type: string }) {
  return file.type.startsWith("image/");
}

export function shouldBypassNextImageOptimization(src: string) {
  if (src.startsWith("/api/")) {
    return true;
  }

  try {
    const url = new URL(src);
    // Bunny CDN + Drive signed poster URLs (auth in query; optimizer would strip/expire)
    return (
      url.hostname.endsWith(".b-cdn.net") ||
      url.hostname === "drive.infocuspaly.com" ||
      PORTAL_DOMAINS.some((domain) => url.hostname.endsWith(`.${domain}`))
    );
  } catch {
    return false;
  }
}

export function formatDuration(totalSeconds: number | null) {
  if (!totalSeconds || totalSeconds <= 0) {
    return "--:--";
  }

  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatApprovalLabel(status: ApprovalStatusValue) {
  if (status === "IN_REVIEW") return "In review";
  if (status === "NEEDS_CHANGES") return "Needs changes";
  if (status === "AIRED") return "Aired";
  return "Approved";
}

/**
 * The air date in the zone's locale. Always read in UTC: the air date is a calendar day stored
 * at UTC midnight (see toAiredDateInputValue), so only the locale follows the viewer.
 */
export function formatAiredDateLabel(iso: string | null, zone: DateZone = {}): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(zone.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

/** "Aired · Oct 3, 2026" when the date is known, else the plain label. */
export function approvalTagLabel(version: Pick<MediaTileVersion, "approvalStatus" | "airedAt">, zone: DateZone = {}) {
  const label = formatApprovalLabel(version.approvalStatus);
  const aired = version.approvalStatus === "AIRED" ? formatAiredDateLabel(version.airedAt, zone) : "";
  return aired ? `${label} · ${aired}` : label;
}

export function toAiredDateInputValue(iso: string | null, now: Date = new Date()): string {
  const source = iso ? new Date(iso) : now;
  if (Number.isNaN(source.getTime())) {
    return "";
  }
  const year = source.getUTCFullYear();
  const month = String(source.getUTCMonth() + 1).padStart(2, "0");
  const day = String(source.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Locale and time zone for dates and name lists. The server render and hydration use a fixed
 * one (`SERVER_DATE_ZONE`; Workers runs en-US in UTC) so the text matches; after hydration the
 * viewer's own (`{}`).
 */
export type DateZone = { locale?: string; timeZone?: string };
export const SERVER_DATE_ZONE: DateZone = { locale: "en-US", timeZone: "UTC" };

export function formatTileDateLabel(createdAtIso: string, zone: DateZone = {}) {
  const date = new Date(createdAtIso);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleDateString(zone.locale, {
        month: "short",
        day: "2-digit",
        year: "numeric",
        timeZone: zone.timeZone
      });
}

export function formatDeletedAt(dateIso: string | null, zone: DateZone = {}) {
  if (!dateIso) {
    return "Unknown time";
  }

  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString(zone.locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: zone.timeZone
  });
}

/** "Deleted Oct 03, 2026 by Abby" */
export function deletedLabel(item: Pick<MediaTileItem, "deletedAt" | "deletedByName">, zone: DateZone = {}) {
  return `Deleted ${formatDeletedAt(item.deletedAt, zone)} by ${item.deletedByName ?? "Someone"}`;
}

export function formatEtaCompact(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "ETA --";
  }

  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `ETA ${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function uploadStatusLabel(status: ThumbStatus) {
  if (status === "PREPARING") return "Preparing";
  if (status === "UPLOADING") return "Uploading";
  if (status === "PROCESSING") return "Processing";
  if (status === "FAILED") return "Failed";
  return "Ready";
}

export function getReadableStatus(status: MediaStatusValue) {
  if (status === "UPLOADING") return "Uploading";
  if (status === "PROCESSING") return "Processing";
  if (status === "FAILED") return "Failed";
  return "Ready";
}

export function getMemberDisplayName(member: Pick<AssignedMember, "name" | "email">) {
  return member.name?.trim() || member.email?.trim() || "Team member";
}

function getMemberFirstName(member: Pick<AssignedMember, "name" | "email">) {
  const trimmedName = member.name?.trim();
  if (trimmedName) {
    return trimmedName.split(/\s+/).filter(Boolean)[0] ?? trimmedName;
  }
  return member.email?.split("@")[0]?.trim() || "Member";
}

/** "No assignees", "Abby Lee", or first names: "Abby, Otto and Sage". */
export function formatMemberNameSummary(members: Pick<AssignedMember, "name" | "email">[], zone: DateZone = {}) {
  if (members.length === 0) {
    return "No assignees";
  }
  if (members.length === 1) {
    return getMemberDisplayName(members[0]);
  }
  const formatter = new Intl.ListFormat(zone.locale, { style: "long", type: "conjunction" });
  return formatter.format(members.map((member) => getMemberFirstName(member)));
}

/**
 * Whether the Status menu can move a version from `from` to `to`, with the reason when it can't.
 * Mirrors the server's rule (src/lib/approval.ts): approve before marking aired.
 */
export function approvalOptionState(
  from: ApprovalStatusValue,
  to: ApprovalStatusValue
): { disabled: boolean; hint?: string } {
  if (isApprovalTransitionAllowed(from, to)) {
    return { disabled: false };
  }
  if (to === "AIRED") {
    return { disabled: true, hint: "Approve first" };
  }
  return { disabled: true, hint: `Not from ${formatApprovalLabel(from)}` };
}

/** The version a card shows: the one picked in the Version menu, else the current one (else the newest). */
export function getActiveVersion(item: MediaTileItem, overrides: Record<string, string>) {
  const selectedVersionId = overrides[item.id] ?? item.currentVersionId ?? item.versions[0]?.id;
  return item.versions.find((candidate) => candidate.id === selectedVersionId) ?? item.versions[0];
}

/** Keeps selected ids that still exist after a refresh (same array when nothing changed). */
export function keepExistingSelection(selectedIds: string[], items: Pick<MediaTileItem, "id">[]) {
  if (selectedIds.length === 0) {
    return selectedIds;
  }
  const ids = new Set(items.map((item) => item.id));
  const next = selectedIds.filter((id) => ids.has(id));
  return next.length === selectedIds.length ? selectedIds : next;
}

/** Keeps Version-menu picks whose version still exists (same object when nothing changed). */
export function reconcileVersionOverrides(overrides: Record<string, string>, items: MediaTileItem[]) {
  const entries = Object.entries(overrides);
  if (entries.length === 0) {
    return overrides;
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  const kept = entries.filter(([mediaId, versionId]) =>
    byId.get(mediaId)?.versions.some((version) => version.id === versionId)
  );
  return kept.length === entries.length ? overrides : Object.fromEntries(kept);
}

export function selectAllState(assetIds: string[], selectedIds: string[]): "none" | "some" | "all" {
  if (assetIds.length === 0 || selectedIds.length === 0) {
    return "none";
  }
  const selected = new Set(selectedIds);
  const chosen = assetIds.filter((id) => selected.has(id)).length;
  if (chosen === 0) return "none";
  return chosen === assetIds.length ? "all" : "some";
}

/** The folder every selected item shares ("root" for top level), or null when they differ. */
export function commonFolderValue(items: Pick<MediaTileItem, "id" | "folderId">[], selectedIds: string[]) {
  const selected = new Set(selectedIds);
  const chosen = items.filter((item) => selected.has(item.id));
  if (chosen.length === 0) {
    return null;
  }
  const first = chosen[0].folderId ?? "root";
  return chosen.every((item) => (item.folderId ?? "root") === first) ? first : null;
}

const FILTER_COUNT_NOUN: Record<Exclude<FilterValue, "all">, string> = {
  ready: "ready",
  "in-progress": "in progress",
  failed: "failed"
};

/**
 * The word after the toolbar's asset count: "asset(s)", or the status filter ("2 failed") in
 * the active scope. Recently deleted ignores the filter, so it always says assets.
 */
export function viewCountNoun(count: number, filter: FilterValue, scope: ScopeMode) {
  if (scope === "active" && filter !== "all") {
    return FILTER_COUNT_NOUN[filter];
  }
  return count === 1 ? "asset" : "assets";
}

/** 1-based range of the items shown on this page: "41–80". */
export function pageRange(page: number, pageSize: number, shownCount: number) {
  const start = shownCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = shownCount === 0 ? 0 : start + shownCount - 1;
  return { start, end };
}

/**
 * What a thumbnail shows: the upload ring for a local upload, "Processing" or "Failed" from the
 * server, or nothing (the picture). A server UPLOADING without a local upload reads as processing.
 */
export function thumbState(
  version: Pick<MediaTileVersion, "status">,
  upload: Pick<ActiveUpload, "status" | "progress"> | null
): { status: ThumbStatus | null; progress: number } {
  const derived: MediaStatusValue = !upload && version.status === "UPLOADING" ? "PROCESSING" : version.status;
  if (upload) {
    return { status: upload.status, progress: upload.progress };
  }
  if (derived === "PROCESSING" || derived === "FAILED") {
    return { status: derived, progress: derived === "PROCESSING" ? 100 : 0 };
  }
  return { status: null, progress: 0 };
}

const STAGE_KEYS = [
  { key: "ab", match: "arollbroll", label: "A-roll / B-roll", short: "A/B" },
  { key: "initial", match: "initialcut", label: "Initial cut", short: "Initial" },
  { key: "final", match: "finalcut", label: "Final cut", short: "Final" }
] as const;

function normalizeStageName(name: string) {
  return folderDisplayName(name).toLowerCase().replace(/[^a-z]/g, "");
}

export type FolderStage = { key: string; label: string; short: string; count: number };

/**
 * For a Cycle group folder (Group/A-roll B-roll, Group/Initial Cut, Group/Final Cut), the item
 * count in each stage folder, from data the page already has. Null for any other folder.
 */
export function folderStages(folder: Pick<FolderItem, "name">, folders: FolderItem[]): FolderStage[] | null {
  const children = folders.filter((candidate) => isDirectChildFolder(folder.name, candidate.name));
  const stages = STAGE_KEYS.map((stage): FolderStage | null => {
    const match = children.find((child) => normalizeStageName(child.name) === stage.match);
    return match ? { key: stage.key, label: stage.label, short: stage.short, count: match.itemCount } : null;
  }).filter((stage): stage is FolderStage => stage !== null);
  return stages.length > 0 ? stages : null;
}

/** A folder's one status tag: "Empty" when nothing is in it (subfolders included), otherwise none. */
export function folderTag(folder: Pick<FolderItem, "itemCount">): { tone: "neutral"; label: string } | null {
  return folder.itemCount === 0 ? { tone: "neutral", label: "Empty" } : null;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export type ProjectQueryUpdates = {
  new?: "upload" | "folder" | null;
  folderId?: string;
  scope?: "active" | "deleted";
  filter?: "all" | "ready" | "in-progress" | "failed";
  sort?: "recent" | "name" | "status";
  page?: number | null;
  /** Keep `page` when no page is given (default: go back to page 1). */
  preservePage?: boolean;
};

/** The page URL with these query changes; every other param (view, collection, share…) is kept. */
export function buildProjectQueryHref(pathname: string, search: string, updates: ProjectQueryUpdates) {
  const next = new URLSearchParams(search);

  if (updates.new === null) {
    next.delete("new");
  } else if (updates.new) {
    next.set("new", updates.new);
  }

  if (updates.scope) {
    next.set("scope", updates.scope);
  }

  if (updates.folderId) {
    next.set("folderId", updates.folderId);
  }

  if (updates.filter) {
    next.set("filter", updates.filter);
  }

  if (updates.sort) {
    next.set("sort", updates.sort);
  }

  if (updates.page === null) {
    next.delete("page");
  } else if (typeof updates.page === "number") {
    if (updates.page <= 1) {
      next.delete("page");
    } else {
      next.set("page", String(updates.page));
    }
  } else if (!updates.preservePage) {
    next.delete("page");
  }

  return `${pathname}?${next.toString()}`;
}

/** How many of these assets are uploading here or still processing on the server. */
export function pendingItemCount(items: MediaTileItem[], uploadingMediaIds: Iterable<string | null>) {
  const uploading = new Set(uploadingMediaIds);
  return items.filter(
    (item) =>
      uploading.has(item.id) ||
      item.versions.some((version) => version.status === "UPLOADING" || version.status === "PROCESSING")
  ).length;
}
