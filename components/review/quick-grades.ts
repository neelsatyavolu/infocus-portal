import type { MediaReviewDto } from "@/src/lib/types";

/**
 * Quick grades on a Final Cut review: the data rules and the save/publish loops. The UI lives in
 * quick-grades-panel.tsx and the state in use-quick-grades.ts.
 */

export const MAX_FREE_EXTENSION_DAYS = 14;
export const MAX_FEEDBACK_LENGTH = 2000;

export type QuickGradeApiRow = {
  userId: string;
  name: string | null;
  email: string | null;
  effortPoints: number | null;
  teamworkPoints: number | null;
  feedback: string;
  turnedInDate: string | null;
  freeExtensionDays: number;
  extensionDetails: {
    calculatedDays: number;
    freeDays: number;
    chargedDays: number;
    exempt: boolean;
  };
  published: boolean;
  publishedAt: string | null;
  totalPoints: number | null;
  percentage: number | null;
  extensionsRemaining: number;
};

export type QuickGradeRow = QuickGradeApiRow & {
  disabled: boolean;
  disabledReason: string | null;
};

type QuickGradesApiPayload = {
  activeCycleNumber: number;
  rows: QuickGradeApiRow[];
};

type RowUpdate = Partial<QuickGradeApiRow>;

export function parseCycleFromProjectName(projectName: string) {
  const match = projectName.match(/package\s+cycle\s+(\d+)/i);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
    return null;
  }
  return parsed;
}

export function canShowQuickGradesForFolder(folderName: string | null) {
  if (folderName === null) {
    return true;
  }
  return folderName.trim().toLowerCase() === "final cut";
}

/** Rounded and clamped; blank or not a number is null. */
export function normalizeQuickGradePoints(input: string, maxValue: number) {
  if (!input.trim()) {
    return null;
  }
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.min(maxValue, Math.round(parsed)));
}

/** Clamped 0–14; not a number is 0. */
export function normalizeFreeExtensionDays(input: string) {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(MAX_FREE_EXTENSION_DAYS, Math.round(parsed))) : 0;
}

export function quickGradePersonLabel(row: Pick<QuickGradeRow, "name" | "email">) {
  return row.name?.trim() || row.email || "Unnamed user";
}

export function quickGradeRowsEqual(current: QuickGradeRow, baseline?: QuickGradeRow) {
  if (!baseline) {
    return false;
  }
  return (
    (current.effortPoints ?? null) === (baseline.effortPoints ?? null) &&
    (current.teamworkPoints ?? null) === (baseline.teamworkPoints ?? null) &&
    current.feedback === baseline.feedback &&
    (current.turnedInDate ?? null) === (baseline.turnedInDate ?? null) &&
    current.freeExtensionDays === baseline.freeExtensionDays
  );
}

/** The date every gradable row shares, or "" when they differ. */
export function commonQuickGradeTurnedInDate(rows: QuickGradeRow[]) {
  const gradableRows = rows.filter((row) => !row.disabled);
  if (gradableRows.length === 0) {
    return "";
  }
  const firstValue = gradableRows[0].turnedInDate ?? "";
  return gradableRows.every((row) => (row.turnedInDate ?? "") === firstValue) ? firstValue : "";
}

export function formatQuickGradeRevisionDeadline(isoDate: string) {
  const publishedAt = new Date(isoDate);
  if (Number.isNaN(publishedAt.getTime())) {
    return null;
  }
  const deadline = new Date(publishedAt);
  deadline.setDate(deadline.getDate() + 14);
  return deadline.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Latest revision by": 14 days after the earliest publish among gradable rows. */
export function quickGradeRevisionDeadlineLabel(rows: QuickGradeRow[]) {
  let earliestPublishedAt: string | null = null;
  for (const row of rows) {
    if (row.disabled || !row.published || !row.publishedAt) {
      continue;
    }
    if (earliestPublishedAt === null || row.publishedAt < earliestPublishedAt) {
      earliestPublishedAt = row.publishedAt;
    }
  }
  return earliestPublishedAt ? formatQuickGradeRevisionDeadline(earliestPublishedAt) : null;
}

/** "danger" when over, "warning" at 2 or fewer days left, "success" otherwise. */
export function extensionDaysTone(remaining: number) {
  if (remaining < 0) return "danger" as const;
  if (remaining <= 2) return "warning" as const;
  return "success" as const;
}

/** The assigned people, each matched to their grade row; people the API doesn't grade are disabled. */
export function buildQuickGradeRows(
  assignedPeople: MediaReviewDto["assignedPeople"],
  apiRows: QuickGradeApiRow[]
): QuickGradeRow[] {
  const apiRowByUser = new Map(apiRows.map((row) => [row.userId, row]));
  return assignedPeople.map((person) => {
    const apiRow = apiRowByUser.get(person.userId);
    if (apiRow) {
      return {
        ...apiRow,
        name: apiRow.name ?? person.name,
        email: apiRow.email ?? person.email,
        disabled: false,
        disabledReason: null
      };
    }
    return {
      userId: person.userId,
      name: person.name,
      email: person.email,
      effortPoints: null,
      teamworkPoints: null,
      feedback: "",
      turnedInDate: null,
      freeExtensionDays: 0,
      extensionDetails: { calculatedDays: 0, freeDays: 0, chargedDays: 0, exempt: false },
      published: false,
      publishedAt: null,
      totalPoints: null,
      percentage: null,
      extensionsRemaining: 14,
      disabled: true,
      disabledReason: "Admin users are not gradable here."
    };
  });
}

export async function fetchQuickGradeRows(cycleNumber: number) {
  const response = await fetch(`/api/grades/admin?cycle=${cycleNumber}`, { cache: "no-store" });
  const payload = (await response.json()) as { data?: QuickGradesApiPayload; error?: { message?: string } };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load grades.");
  }
  return payload.data.rows;
}

async function postGradeAction(body: Record<string, unknown>, failureMessage: string): Promise<RowUpdate> {
  const response = await fetch("/api/grades/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as { data?: RowUpdate; error?: { message?: string } };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? failureMessage);
  }
  return payload.data;
}

function mergeRow(rows: QuickGradeRow[], userId: string, update: RowUpdate) {
  return rows.map((row) => (row.userId === userId ? { ...row, ...update } : row));
}

export type QuickGradeSaveResult = {
  rows: QuickGradeRow[];
  savedRows: QuickGradeRow[];
  savedCount: number;
  turnedInOnlyCount: number;
  skippedIncompleteCount: number;
};

/**
 * Saves every changed, complete row; for incomplete rows, saves only a changed turned-in date or
 * free-extension count. `sharedTurnedInDate` (when not null) applies to every row. Throws on the
 * first failure with the API's message or "Failed to save {name}.".
 */
export async function saveQuickGradeRows(input: {
  rows: QuickGradeRow[];
  savedRows: QuickGradeRow[];
  cycleNumber: number;
  /** null: keep each row's own date. A string ("" clears): applies to everyone. */
  sharedTurnedInDate: string | null;
}): Promise<QuickGradeSaveResult> {
  const savedByUser = new Map(input.savedRows.map((row) => [row.userId, row]));
  let rows = input.rows;
  let savedRows = input.savedRows;
  let savedCount = 0;
  let turnedInOnlyCount = 0;
  let skippedIncompleteCount = 0;

  for (const row of input.rows) {
    if (row.disabled) {
      continue;
    }
    const effectiveTurnedInDate = input.sharedTurnedInDate !== null ? input.sharedTurnedInDate || null : row.turnedInDate;
    const turnedInDateChanged = (row.turnedInDate ?? null) !== (effectiveTurnedInDate ?? null);
    const baseline = savedByUser.get(row.userId);
    const freeExtensionDaysChanged = row.freeExtensionDays !== (baseline?.freeExtensionDays ?? 0);

    if (row.effortPoints === null || row.teamworkPoints === null) {
      if (!turnedInDateChanged && !freeExtensionDaysChanged) {
        skippedIncompleteCount += 1;
        continue;
      }
      const update = await postGradeAction(
        {
          action: "setTurnedInDate",
          cycleNumber: input.cycleNumber,
          userId: row.userId,
          turnedInDate: effectiveTurnedInDate,
          freeExtensionDays: row.freeExtensionDays
        },
        `Failed to save ${quickGradePersonLabel(row)}.`
      );
      rows = mergeRow(rows, row.userId, update);
      savedRows = mergeRow(savedRows, row.userId, update);
      turnedInOnlyCount += 1;
      continue;
    }

    if (quickGradeRowsEqual({ ...row, turnedInDate: effectiveTurnedInDate }, baseline)) {
      continue;
    }
    const update = await postGradeAction(
      {
        action: "save",
        cycleNumber: input.cycleNumber,
        userId: row.userId,
        effortPoints: row.effortPoints,
        teamworkPoints: row.teamworkPoints,
        feedback: row.feedback,
        turnedInDate: effectiveTurnedInDate,
        freeExtensionDays: row.freeExtensionDays
      },
      `Failed to save ${quickGradePersonLabel(row)}.`
    );
    rows = mergeRow(rows, row.userId, update);
    savedRows = mergeRow(savedRows, row.userId, update);
    savedCount += 1;
  }

  return { rows, savedRows, savedCount, turnedInOnlyCount, skippedIncompleteCount };
}

/** The message after a save, or null when nothing should be said. */
export function quickGradeSaveMessage(result: Omit<QuickGradeSaveResult, "rows" | "savedRows">) {
  const { savedCount, turnedInOnlyCount, skippedIncompleteCount } = result;
  if (savedCount === 0 && turnedInOnlyCount === 0 && skippedIncompleteCount > 0) {
    return "Enter both grades for each person before saving.";
  }
  if (savedCount === 0 && turnedInOnlyCount === 0) {
    return "No grade changes to save.";
  }
  const parts: string[] = [];
  if (savedCount > 0) {
    parts.push(`Saved ${savedCount} grade${savedCount === 1 ? "" : "s"}`);
  }
  if (turnedInOnlyCount > 0) {
    parts.push(`updated turned-in date for ${turnedInOnlyCount} row${turnedInOnlyCount === 1 ? "" : "s"}`);
  }
  const summary = parts.length > 0 ? parts.join("; ") : "No changes saved";
  return skippedIncompleteCount > 0
    ? `${summary} (${skippedIncompleteCount} incomplete row${skippedIncompleteCount === 1 ? "" : "s"} skipped).`
    : `${summary}.`;
}

export type QuickGradePublishResult = {
  rows: QuickGradeRow[];
  publishedCount: number;
  alreadyPublishedCount: number;
  skippedIncompleteCount: number;
};

/** Publishes every complete, unpublished row. Throws "Failed to publish {name}." on a failure. */
export async function publishQuickGradeRows(input: { rows: QuickGradeRow[]; cycleNumber: number }): Promise<QuickGradePublishResult> {
  let rows = input.rows;
  let publishedCount = 0;
  let alreadyPublishedCount = 0;
  let skippedIncompleteCount = 0;

  for (const row of input.rows) {
    if (row.disabled) {
      continue;
    }
    if (row.effortPoints === null || row.teamworkPoints === null) {
      skippedIncompleteCount += 1;
      continue;
    }
    if (row.published) {
      alreadyPublishedCount += 1;
      continue;
    }
    const update = await postGradeAction(
      { action: "setPublish", cycleNumber: input.cycleNumber, userId: row.userId, published: true },
      `Failed to publish ${quickGradePersonLabel(row)}.`
    );
    rows = mergeRow(rows, row.userId, update);
    publishedCount += 1;
  }

  return { rows, publishedCount, alreadyPublishedCount, skippedIncompleteCount };
}

export function quickGradePublishMessage(result: Omit<QuickGradePublishResult, "rows">) {
  const parts: string[] = [];
  if (result.publishedCount > 0) {
    parts.push(`Published ${result.publishedCount} grade${result.publishedCount === 1 ? "" : "s"}`);
  }
  if (result.alreadyPublishedCount > 0) {
    parts.push(`${result.alreadyPublishedCount} already published`);
  }
  if (result.skippedIncompleteCount > 0) {
    parts.push(`${result.skippedIncompleteCount} incomplete skipped`);
  }
  return parts.length > 0 ? `${parts.join("; ")}.` : "No grades to publish.";
}
