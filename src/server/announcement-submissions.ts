import { createHash } from "node:crypto";
import {
  announcementSubmitSchema,
  dateKeyToIso,
  isSchoologyOnly,
  runOnLabel,
  type AnnouncementSubmitInput
} from "@/src/lib/announcement-submission";
import { prisma } from "@/src/lib/prisma";
import {
  fetchSubmittedAnnouncementsFromGoogleSheet,
  type SubmittedAnnouncement,
  type SubmittedAnnouncementsResult
} from "@/src/lib/submitted-announcements";

function sortByNewest(left: SubmittedAnnouncement, right: SubmittedAnnouncement) {
  const leftTime = left.timestampIso ? Date.parse(left.timestampIso) : 0;
  const rightTime = right.timestampIso ? Date.parse(right.timestampIso) : 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return right.rowNumber - left.rowNumber;
}

export function toSubmittedAnnouncement(row: {
  id: string;
  isPermanent?: boolean;
  email: string;
  name: string;
  submitterKind: string;
  runOn: string;
  announcement: string;
  startDate: string;
  endDate: string;
  mediaLink: string | null;
  moreInfo: string | null;
  createdAt: Date;
}): SubmittedAnnouncement {
  const createdIso = row.createdAt.toISOString();

  return {
    id: row.id,
    isPermanent: row.isPermanent ?? false,
    rowNumber: row.createdAt.getTime(),
    timestamp: createdIso,
    timestampIso: createdIso,
    name: row.name,
    email: row.email,
    category: runOnLabel(row.runOn),
    submitterKind: row.submitterKind,
    runOn: row.runOn,
    announcement: row.announcement,
    startDate: row.startDate,
    startDateIso: dateKeyToIso(row.startDate),
    endDate: row.endDate,
    endDateIso: dateKeyToIso(row.endDate),
    mediaLink: row.mediaLink ?? "",
    moreInfo: row.moreInfo ?? "",
    source: "native"
  };
}

export async function createAnnouncementSubmission(input: AnnouncementSubmitInput) {
  const row = await prisma.announcementSubmission.create({
    data: {
      email: input.email,
      name: input.name,
      submitterKind: input.submitterKind,
      runOn: input.runOn,
      announcement: input.announcement,
      startDate: input.startDate,
      endDate: input.endDate,
      policyAgreed: true,
      mediaLink: input.mediaLink ?? null,
      moreInfo: input.moreInfo ?? null
    }
  });

  return toSubmittedAnnouncement(row);
}

export async function listNativeSubmittedAnnouncements() {
  const rows = await prisma.announcementSubmission.findMany({
    orderBy: { createdAt: "desc" }
  });

  return rows.map(toSubmittedAnnouncement);
}

export async function fetchSubmittedAnnouncements(options?: {
  includeSchoologyOnly?: boolean;
}): Promise<SubmittedAnnouncementsResult> {
  const includeSchoologyOnly = options?.includeSchoologyOnly ?? true;
  const native = await listNativeSubmittedAnnouncements();

  let sheetAnnouncements: SubmittedAnnouncement[] = [];
  let sheetMeta: SubmittedAnnouncementsResult["meta"] | null = null;

  try {
    const sheet = await fetchSubmittedAnnouncementsFromGoogleSheet();
    sheetAnnouncements = sheet.announcements.map((entry) => ({
      ...entry,
      // Sheet row numbers move when other rows are removed or reordered.
      id: `sheet-${createHash("sha256").update(JSON.stringify([
        sheet.meta.spreadsheetId, entry.timestamp, entry.email, entry.name,
        entry.announcement, entry.startDate, entry.endDate
      ])).digest("hex")}`
    }));
    sheetMeta = sheet.meta;
  } catch {
    // Native submissions still load if the sheet is missing or unreachable.
  }

  const deletions = await prisma.submittedAnnouncementDeletion.findMany({ select: { id: true } });
  const deletedIds = new Set(deletions.map((entry) => entry.id));
  const announcements = [...native, ...sheetAnnouncements]
    .filter((entry) => !deletedIds.has(entry.id))
    .filter((entry) => includeSchoologyOnly || !isSchoologyOnly(entry))
    .sort(sortByNewest);

  const source = native.length > 0 && sheetAnnouncements.length > 0 ? "mixed" : native.length > 0 ? "native" : "google-sheets";

  return {
    announcements,
    meta: {
      source,
      spreadsheetId: sheetMeta?.spreadsheetId ?? null,
      range: sheetMeta?.range ?? null,
      totalRows: native.length + (sheetMeta?.totalRows ?? 0),
      includedRows: announcements.length,
      skippedRows: sheetMeta?.skippedRows ?? 0,
      skippedByCategory: sheetMeta?.skippedByCategory ?? 0,
      retrievedAt: new Date().toISOString()
    }
  };
}

export function parseAnnouncementSubmitPayload(payload: unknown) {
  return announcementSubmitSchema.parse(payload);
}

export async function deleteSubmittedAnnouncement(id: string) {
  const { announcements } = await fetchSubmittedAnnouncements({ includeSchoologyOnly: true });
  if (!announcements.some((entry) => entry.id === id)) {
    throw new Error("NOT_FOUND");
  }
  await prisma.submittedAnnouncementDeletion.upsert({
    where: { id },
    create: { id },
    update: {}
  });
}
