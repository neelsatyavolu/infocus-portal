import {
  collegeVisitsSpreadsheetId,
  draftCollegeVisitAnnouncement,
  makeCollegeVisitAnnouncement,
  parseCollegeVisitRows,
  shouldSkipCollegeVisitSheet,
  visitsInShowWindow,
  type CollegeVisit
} from "@/src/lib/college-visits";
import { batchGetSheetValues, fetchSheetTitles, type GoogleServiceAccount } from "@/src/lib/google-sheets";
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

/** Null when no service account is set up; a key that is set but malformed is an error, not silence. */
function getServiceAccount(): GoogleServiceAccount | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawPrivateKey) {
    return null;
  }

  const privateKey = normalizePrivateKey(rawPrivateKey);
  if (!isLikelyPemPrivateKey(privateKey)) {
    throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY format for college visits.");
  }

  return { email, privateKey };
}

export async function fetchCollegeVisits(): Promise<CollegeVisit[]> {
  const account = getServiceAccount();
  if (!account) {
    return [];
  }

  const spreadsheetId = collegeVisitsSpreadsheetId();
  const titles = (await fetchSheetTitles(account, spreadsheetId))
    .map((title) => title.trim())
    .filter((title) => title && !shouldSkipCollegeVisitSheet(title));

  if (titles.length === 0) {
    return [];
  }

  const ranges = await batchGetSheetValues(
    account,
    spreadsheetId,
    titles.map((title) => `'${title.replace(/'/g, "''")}'!A:E`)
  );

  return parseCollegeVisitRows(ranges.flat());
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
