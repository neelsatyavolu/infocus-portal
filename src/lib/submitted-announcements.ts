import * as google from "googleapis/build/src/apis/sheets";

const START_ROW = 2;
const DEFAULT_RANGE = "C2:M";
const SKIP_CATEGORY = "schoology update only";

type SubmittedAnnouncementsConfig = {
  email: string;
  privateKey: string;
  spreadsheetId: string;
  range: string;
};

type RowParseResult = {
  announcement: SubmittedAnnouncement | null;
  skippedByCategory: boolean;
};

export type SubmittedAnnouncement = {
  id: string;
  isPermanent?: boolean;
  rowNumber: number;
  timestamp: string;
  timestampIso: string | null;
  name: string;
  email: string;
  category: string;
  submitterKind: string;
  runOn: string;
  announcement: string;
  startDate: string;
  startDateIso: string | null;
  endDate: string;
  endDateIso: string | null;
  mediaLink: string;
  moreInfo: string;
  source: "native" | "google-sheets";
};

export type SubmittedAnnouncementsMeta = {
  source: "native" | "google-sheets" | "mixed";
  spreadsheetId: string | null;
  range: string | null;
  totalRows: number;
  includedRows: number;
  skippedRows: number;
  skippedByCategory: number;
  retrievedAt: string;
};

export type SubmittedAnnouncementsResult = {
  announcements: SubmittedAnnouncement[];
  meta: SubmittedAnnouncementsMeta;
};

export class SubmittedAnnouncementsConfigError extends Error {}

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

function isPrivateKeyDecoderError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("decoder routines::unsupported") ||
    message.includes("pem routines") ||
    message.includes("no start line") ||
    message.includes("asn1")
  );
}

function parseIsoDate(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function toCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function getConfig(): SubmittedAnnouncementsConfig {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SUBMITTED_ANNOUNCEMENTS_SPREADSHEET_ID?.trim();
  const range = process.env.GOOGLE_SHEETS_SUBMITTED_ANNOUNCEMENTS_RANGE?.trim() || DEFAULT_RANGE;

  if (!email || !rawPrivateKey || !spreadsheetId) {
    throw new SubmittedAnnouncementsConfigError("Missing Google Sheets configuration for submitted announcements.");
  }

  const privateKey = normalizePrivateKey(rawPrivateKey);
  if (!isLikelyPemPrivateKey(privateKey)) {
    throw new SubmittedAnnouncementsConfigError(
      "Invalid GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY format for submitted announcements."
    );
  }

  return {
    email,
    privateKey,
    spreadsheetId,
    range
  };
}

function parseRow(rawRow: unknown[], offset: number): RowParseResult {
  const rowNumber = START_ROW + offset;
  const values = Array.from({ length: 11 }, (_, index) => toCell(rawRow[index]));

  const timestamp = values[0];
  const email = values[1];
  const name = values[2];
  const submitterKind = values[3];
  const category = values[4];
  const announcement = values[5];
  const startDate = values[6];
  const endDate = values[7];
  const mediaLink = values[9];
  const moreInfo = values[10];
  const skipByCategory = category.toLowerCase() === SKIP_CATEGORY;

  if (skipByCategory || !announcement) {
    return {
      announcement: null,
      skippedByCategory: skipByCategory
    };
  }

  return {
    skippedByCategory: false,
    announcement: {
      id: `sheet-row-${rowNumber}`,
      rowNumber,
      timestamp,
      timestampIso: parseIsoDate(timestamp),
      name,
      email,
      category,
      submitterKind,
      runOn: category,
      announcement,
      startDate,
      startDateIso: parseIsoDate(startDate),
      endDate,
      endDateIso: parseIsoDate(endDate),
      mediaLink,
      moreInfo,
      source: "google-sheets"
    }
  };
}

export async function fetchSubmittedAnnouncementsFromGoogleSheet(): Promise<SubmittedAnnouncementsResult> {
  try {
    const config = getConfig();

    const auth = new google.auth.JWT({
      email: config.email,
      key: config.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    });

    const sheets = google.sheets({
      version: "v4",
      auth
    });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: config.range
    });

    const rows = response.data.values ?? [];
    const parsedRows = rows.map((row, index) => parseRow(row ?? [], index));
    const announcements = parsedRows
      .map((entry) => entry.announcement)
      .filter((entry): entry is SubmittedAnnouncement => entry !== null)
      .sort((a, b) => b.rowNumber - a.rowNumber);

    const skippedByCategory = parsedRows.filter((entry) => entry.skippedByCategory).length;
    const skippedRows = rows.length - announcements.length;

    return {
      announcements,
      meta: {
        source: "google-sheets",
        spreadsheetId: config.spreadsheetId,
        range: config.range,
        totalRows: rows.length,
        includedRows: announcements.length,
        skippedRows,
        skippedByCategory,
        retrievedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    if (error instanceof SubmittedAnnouncementsConfigError) {
      throw error;
    }

    if (isPrivateKeyDecoderError(error)) {
      throw new SubmittedAnnouncementsConfigError(
        "Invalid GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY format for submitted announcements."
      );
    }

    throw error;
  }
}
