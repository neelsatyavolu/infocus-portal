import { getSectionDisplayParts } from "@/src/lib/teleprompter-run-script";

export type TeleprompterSection = {
  id: string;
  label: string;
  content: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type TeleprompterDoc = {
  id: string;
  title: string;
  orderIndex: number;
  showDate: string | null;
  createdAt: string;
  updatedAt: string;
  sections: TeleprompterSection[];
};

export type TeleprompterAutofillStatus = {
  status: "ok" | "warning" | "unavailable";
  message?: string;
};

export type TeleprompterPayload = {
  workspaceId: string;
  canEdit: boolean;
  nextShowDateIso: string;
  docs: TeleprompterDoc[];
  autofill: TeleprompterAutofillStatus;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
};

export type SectionDraft = {
  id: string | null;
  label: string;
  content: string;
};

export type ReformatState = {
  scope: "doc" | "section" | null;
  targetId: string | null;
  progress: number;
};

/** The rail lists this many scripts before "Show n more". */
export const RECENT_DOCS_LIMIT = 9;

/**
 * The show calendar's time zone (same value as TELEPROMPTER_TIME_ZONE). Kept local: importing
 * teleprompter-template would pull the announcement libraries into the page bundle.
 */
const SHOW_TIME_ZONE = "America/Los_Angeles";

export async function readData<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    ...init
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Request failed.");
  }

  return payload.data as T;
}

function getDocSortTimestamp(doc: TeleprompterDoc) {
  const timestamp = Date.parse(doc.showDate ?? doc.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortDocsByRecent(docs: TeleprompterDoc[]) {
  return [...docs].sort((left, right) => {
    const timestampDelta = getDocSortTimestamp(right) - getDocSortTimestamp(left);
    if (timestampDelta !== 0) {
      return timestampDelta;
    }

    const createdAtDelta = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }

    return right.orderIndex - left.orderIndex;
  });
}

/** The first nine scripts, plus the selected one when it sits further down (so it is never hidden). */
export function visibleRailDocs(orderedDocs: TeleprompterDoc[], showAll: boolean, activeDocId: string | null) {
  if (showAll || orderedDocs.length <= RECENT_DOCS_LIMIT) {
    return { visible: orderedDocs, hiddenCount: 0 };
  }

  const recent = orderedDocs.slice(0, RECENT_DOCS_LIMIT);
  const active = activeDocId ? orderedDocs.find((doc) => doc.id === activeDocId) : undefined;
  const visible = active && !recent.includes(active) ? [...recent, active] : recent;
  return { visible, hiddenCount: orderedDocs.length - visible.length };
}

/** "2026-10-21" from a show date ISO string, or null. */
export function showDateKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const key = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function utcDateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day));
}

/** "Wed, Oct 21". */
export function formatShowDateLong(showDate: string | null | undefined) {
  const key = showDateKey(showDate);
  const date = key ? utcDateFromKey(key) : null;
  if (!date) {
    return null;
  }

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

/** The rail's date column: weekday caps over MM/DD. */
export function railDateParts(showDate: string | null) {
  const key = showDateKey(showDate);
  const date = key ? utcDateFromKey(key) : null;
  if (!key || !date) {
    return null;
  }

  return {
    weekday: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase(),
    date: `${key.slice(5, 7)}/${key.slice(8, 10)}`
  };
}

/** Today's date key in the show calendar's time zone. */
export function todayDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Server placeholders: [INSERT PACKAGE TOSS], [INSERT PACKAGE TOSS: headline], [INSERT THANK YOU NAMES]. */
const PLACEHOLDER_TEST = /\[INSERT[^\]]*\]/i;
const PLACEHOLDER_SPLIT = /(\[INSERT[^\]]*\])/gi;

export function hasPlaceholder(content: string) {
  return PLACEHOLDER_TEST.test(content);
}

/** Text split into plain runs and [INSERT …] placeholders, for highlighting. Display only. */
export function splitPlaceholders(text: string) {
  return text
    .split(PLACEHOLDER_SPLIT)
    .filter(Boolean)
    .map((part) => ({ text: part, placeholder: PLACEHOLDER_TEST.test(part) }));
}

/** Sections that still hold an [INSERT …] placeholder. */
export function countSectionsToFill(doc: TeleprompterDoc) {
  return doc.sections.filter((section) => hasPlaceholder(section.content)).length;
}

/**
 * The section header's parts: the label as the code ("A1") and the beat name ("Open") when the
 * first line is a beat heading. The beat is badgeLabel with the exact "label - " prefix removed,
 * so labels and headings with hyphens stay whole.
 */
export function splitSectionLabel(section: Pick<TeleprompterSection, "label" | "content">) {
  const display = getSectionDisplayParts(section);
  const prefix = `${section.label} - `;
  const beat = display.badgeLabel.startsWith(prefix) ? display.badgeLabel.slice(prefix.length) : null;
  return { code: section.label, beat, content: display.content };
}

export type SectionStatus = "to-fill" | "empty" | null;

export function sectionStatus(section: TeleprompterSection): SectionStatus {
  if (!getSectionDisplayParts(section).content.trim()) {
    return "empty";
  }
  return hasPlaceholder(section.content) ? "to-fill" : null;
}

/** Width of the section code column, in ch of Geist Mono, so beat names line up. */
export function codeColumnCh(sections: Array<Pick<TeleprompterSection, "label">>) {
  const longest = sections.reduce((max, section) => Math.max(max, section.label.trim().length), 0);
  return Math.min(10, Math.max(2, longest));
}

export type DocStatusContext = {
  todayKey: string;
  /** Null when the page was opened for a chosen show date (?showDate). */
  nextShowKey: string | null;
};

export type DocStatus = {
  kind: "today" | "next-show" | "to-fill" | "no-sections";
  label: string;
  tone: "success" | "warning" | "neutral";
};

/** The one status a script row shows: TODAY > NEXT SHOW > TO FILL · n > NO SECTIONS. */
export function primaryDocStatus(doc: TeleprompterDoc, context: DocStatusContext): DocStatus | null {
  const key = showDateKey(doc.showDate);
  if (key && key === context.todayKey) {
    return { kind: "today", label: "Today", tone: "success" };
  }
  if (key && context.nextShowKey && key === context.nextShowKey) {
    return { kind: "next-show", label: "Next show", tone: "success" };
  }
  const toFill = countSectionsToFill(doc);
  if (toFill > 0) {
    return { kind: "to-fill", label: `To fill · ${toFill}`, tone: "warning" };
  }
  if (doc.sections.length === 0) {
    return { kind: "no-sections", label: "No sections", tone: "neutral" };
  }
  return null;
}

export type ShowLine = { lead: string; date: string };

/**
 * The header's show line. "Show on <date>" with ?showDate. On a show day with a script for today,
 * "Today's show · <date>", because the API's next show starts from tomorrow. Otherwise
 * "Next show <date>". Null when there is no usable date.
 */
export function headerShowLine({
  requestedShowDate,
  nextShowDateIso,
  docs,
  todayKey
}: {
  requestedShowDate: string;
  nextShowDateIso: string;
  docs: TeleprompterDoc[];
  todayKey: string;
}): ShowLine | null {
  if (!requestedShowDate) {
    const todayDoc = docs.find((doc) => showDateKey(doc.showDate) === todayKey);
    const todayDate = todayDoc ? formatShowDateLong(todayDoc.showDate) : null;
    if (todayDate) {
      return { lead: "Today's show ·", date: todayDate };
    }
  }

  const date = formatShowDateLong(nextShowDateIso);
  return date ? { lead: requestedShowDate ? "Show on" : "Next show", date } : null;
}

function parseTime(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

/** The newest change to a script or any of its sections (includes automatic name and toss fills). */
export function latestDocUpdate(doc: TeleprompterDoc) {
  return doc.sections.reduce((latest, section) => Math.max(latest, parseTime(section.updatedAt)), parseTime(doc.updatedAt));
}

export function sectionUpdatedAt(section: TeleprompterSection) {
  return parseTime(section.updatedAt);
}

/** "now", "4m", "2h", "3d", then a short date ("Oct 2"). */
export function formatAge(fromMs: number, nowMs: number) {
  if (!fromMs) {
    return "";
  }
  const minutes = Math.floor(Math.max(0, nowMs - fromMs) / 60_000);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  return new Date(fromMs).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export type WorkspaceLayout = {
  /** split: scripts rail beside the script. narrow: a script switcher card and a Scripts sheet. */
  mode: "split" | "narrow";
  railInline: boolean;
  /** The Rundown column on the right; otherwise a Rundown chip strip under the toolbar. */
  rundownColumn: boolean;
  /** Toolbar's Add section / Reformat all become icon buttons when the script pane is narrow. */
  compactToolbar: boolean;
  /** Phone width: Refresh moves into the switcher card and New script into the Scripts sheet. */
  phone: boolean;
};

const SPLIT_MIN_PX = 896; // 56rem
const RUNDOWN_MIN_PX = 1280; // 80rem
const RAIL_PX = 288; // 18rem
const RUNDOWN_PX = 240; // 15rem
const COMPACT_DETAIL_PX = 640;
const PHONE_MAX_PX = 600;

/**
 * Picks the layout from the workspace's own width (not the viewport), so the main host's
 * sidebar never squeezes the script pane. Before the first measurement it assumes desktop.
 */
export function workspaceLayout(width: number | null, railCollapsed: boolean): WorkspaceLayout {
  const measured = width ?? SPLIT_MIN_PX;
  const split = measured >= SPLIT_MIN_PX;
  const railInline = split && !railCollapsed;
  const rundownColumn = measured >= RUNDOWN_MIN_PX;
  const detailWidth = measured - (railInline ? RAIL_PX : 0) - (rundownColumn ? RUNDOWN_PX : 0);
  return {
    mode: split ? "split" : "narrow",
    railInline,
    rundownColumn,
    compactToolbar: split && detailWidth < COMPACT_DETAIL_PX,
    phone: measured < PHONE_MAX_PX
  };
}
