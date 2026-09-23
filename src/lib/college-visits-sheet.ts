import * as google from "googleapis/build/src/apis/sheets";
import {
  collegeVisitsSpreadsheetId,
  draftCollegeVisitAnnouncement,
  makeCollegeVisitAnnouncement,
  parseCollegeVisitRows,
  shouldSkipCollegeVisitSheet,
  visitsInShowWindow,
  type CollegeVisit
} from "@/src/lib/college-visits";
import { TELEPROMPTER_TIME_ZONE, getNextShowDate } from "@/src/lib/teleprompter-template";
import type { SubmittedAnnouncement } from "@/src/lib/submitted-announcements";

function normalizePrivateKey(value: string) {
  const trimmed = value.trim().replace(/\r/g, "");
  const withoutWrappingQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return withoutWrappingQuotes.replace(/\\n/g, "\n");
}

function isLikelyPemPrivateKey(value: string) {
  return value.includes("BEGIN PRIVATE KEY") && value.includes("END PRIVATE KEY");
}

function showDateKey(showDate: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TELEPROMPTER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(showDate);
}

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawPrivateKey) {
    return null;
  }

  const privateKey = normalizePrivateKey(rawPrivateKey);
  if (!isLikelyPemPrivateKey(privateKey)) {
    return null;
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  return google.sheets({
    version: "v4",
    auth
  });
}

export async function fetchCollegeVisits(): Promise<CollegeVisit[]> {
  const sheets = getSheetsClient();
  if (!sheets) {
    return [];
  }

  const spreadsheetId = collegeVisitsSpreadsheetId();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title"
  });
  const titles = (meta.data.sheets ?? [])
    .map((sheet) => sheet.properties?.title?.trim() ?? "")
    .filter((title) => title && !shouldSkipCollegeVisitSheet(title));

  if (titles.length === 0) {
    return [];
  }

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: titles.map((title) => `'${title.replace(/'/g, "''")}'!A:E`)
  });

  return parseCollegeVisitRows((response.data.valueRanges ?? []).flatMap((range) => range.values ?? []));
}

export async function loadCollegeVisitBulletinAnnouncement(
  showDate: Date
): Promise<SubmittedAnnouncement | null> {
  const currentKey = showDateKey(showDate);
  const nextKey = showDateKey(getNextShowDate(showDate, TELEPROMPTER_TIME_ZONE));
  const visits = visitsInShowWindow(await fetchCollegeVisits(), currentKey, nextKey);
  const text = draftCollegeVisitAnnouncement(visits, currentKey);
  if (!text) {
    return null;
  }

  return makeCollegeVisitAnnouncement({
    showDateKey: currentKey,
    text
  });
}
