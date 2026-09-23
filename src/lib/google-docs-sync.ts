import * as google from "googleapis/build/src/apis/docs";
import type { docs_v1 } from "googleapis/build/src/apis/docs";
import { setCalendarShowManager } from "@/src/lib/calendar-show-content";
import {
  defaultTemplateForKind,
  hasImageHidden,
  HIDE_IMAGE_TOKEN,
  isScenicImageDay,
  scenicImageForDate,
  stripImageToken
} from "@/src/lib/master-calendar-cells";
import { resolveScheduleDay, type ScheduleKind } from "@/src/lib/school-schedule";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

const HEADER_DARK_HEX = "#0e7f74";
const HEADER_LIGHT_HEX = "#e7e7e7";
const DATE_ROW_HEX = "#92be79";
const CONTENT_DARK_HEX = "#b3cdb2";
const CONTENT_LIGHT_HEX = "#ececec";
const WHITE_HEX = "#ffffff";
const BLACK_HEX = "#000000";
const DOC_WARNING_TEXT = "DO NOT EDIT - EDIT CALENDAR ON WEBSITE";
const TABLE_COLUMN_WIDTH_PT = 111.6;
const PAGE_MARGIN_TOP_PT = 36;
const PAGE_MARGIN_BOTTOM_PT = 36;
const PAGE_SIDE_MARGIN_PT = 27;
const CONTENT_ROW_PADDING_PT = 1;
const CALENDAR_IMAGE_TARGET_ASPECT_RATIO = 2.2;
const CALENDAR_IMAGE_CROP_WIDTH_PX = 1600;
const CALENDAR_IMAGE_CROP_HEIGHT_PX = Math.round(CALENDAR_IMAGE_CROP_WIDTH_PX / CALENDAR_IMAGE_TARGET_ASPECT_RATIO);

type GoogleDocsConfig = {
  email: string;
  privateKey: string;
  docId: string;
};

type MonthData = {
  monthKey: string;
  entries: Array<{ date: string; content: string }>;
  scheduleOverrides?: Array<{ date: string; kind: ScheduleKind; label: string }>;
  showManagers?: Record<string, string>;
};

type TabWithId = { tabId: string; tab: docs_v1.Schema$Tab };

type RichTextStyleSpan = {
  start: number;
  end: number;
  bold: boolean;
  italic: boolean;
};

type RichTextContent = {
  text: string;
  styleSpans: RichTextStyleSpan[];
};

type CellPlan = {
  rowIndex: number;
  colIndex: number;
  insertIndex: number;
  text: string;
  styleSpans: RichTextStyleSpan[];
  isHeader: boolean;
  forceBold: boolean;
  textColorHex: string;
  backgroundHex: string;
  paddingPt: number;
  contentAlignment: "TOP" | "MIDDLE";
  imageSourceUri?: string;
  imageUri?: string;
  imageWidthPt?: number;
  imageHeightPt?: number;
};

export class GoogleDocsSyncConfigError extends Error {}
export class GoogleDocsSyncPermissionError extends Error {}

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

function isGooglePermissionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidate = error as Error & {
    status?: unknown;
    response?: { status?: unknown };
  };
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const responseStatus = typeof candidate.response?.status === "number" ? candidate.response.status : null;
  const message = error.message.toLowerCase();

  return (
    status === 403 ||
    responseStatus === 403 ||
    message.includes("the caller does not have permission") ||
    message.includes("permission denied") ||
    message.includes("insufficient permission") ||
    message.includes("forbidden")
  );
}

function getConfig(): GoogleDocsConfig {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const docId = process.env.GOOGLE_DOCS_MASTER_CALENDAR_DOC_ID?.trim();

  if (!email || !rawKey || !docId) {
    throw new GoogleDocsSyncConfigError("Missing Google Docs configuration for master calendar sync.");
  }

  const privateKey = normalizePrivateKey(rawKey);
  if (!isLikelyPemPrivateKey(privateKey)) {
    throw new GoogleDocsSyncConfigError("Invalid GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY format for master calendar sync.");
  }

  return { email, privateKey, docId };
}

function formatMonthLabel(monthKey: string) {
  const [yearStr, monthStr] = monthKey.split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function flattenTabs(tabs: docs_v1.Schema$Tab[] | null | undefined): docs_v1.Schema$Tab[] {
  if (!tabs || tabs.length === 0) {
    return [];
  }

  const flat: docs_v1.Schema$Tab[] = [];
  for (const tab of tabs) {
    flat.push(tab);
    flat.push(...flattenTabs(tab.childTabs));
  }

  return flat;
}

function getTabById(tabs: docs_v1.Schema$Tab[] | null | undefined, tabId: string): TabWithId | null {
  const match = flattenTabs(tabs).find((tab) => tab.tabProperties?.tabId === tabId);
  if (!match || !match.tabProperties?.tabId) {
    return null;
  }

  return { tabId: match.tabProperties.tabId, tab: match };
}

function getTabByTitle(tabs: docs_v1.Schema$Tab[] | null | undefined, title: string): TabWithId | null {
  const match = flattenTabs(tabs).find((tab) => tab.tabProperties?.title === title && tab.tabProperties?.tabId);
  if (!match || !match.tabProperties?.tabId) {
    return null;
  }

  return { tabId: match.tabProperties.tabId, tab: match };
}

async function getDocumentWithTabs(docs: ReturnType<typeof google.docs>, docId: string) {
  const response = await docs.documents.get({
    documentId: docId,
    includeTabsContent: true
  });
  return response.data;
}

async function ensureMonthTabId(docs: ReturnType<typeof google.docs>, docId: string, tabTitle: string): Promise<string> {
  const existingDocument = await getDocumentWithTabs(docs, docId);
  const existingTab = getTabByTitle(existingDocument.tabs, tabTitle);
  if (existingTab) {
    return existingTab.tabId;
  }

  const createResponse = await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [{ addDocumentTab: { tabProperties: { title: tabTitle } } }]
    }
  });

  const createdTabId = createResponse.data.replies?.[0]?.addDocumentTab?.tabProperties?.tabId;
  if (createdTabId) {
    return createdTabId;
  }

  const updatedDocument = await getDocumentWithTabs(docs, docId);
  const createdTab = getTabByTitle(updatedDocument.tabs, tabTitle);
  if (createdTab) {
    return createdTab.tabId;
  }

  throw new Error(`Unable to create or find month tab '${tabTitle}'.`);
}

async function clearTabContent(docs: ReturnType<typeof google.docs>, docId: string, tabId: string): Promise<void> {
  const document = await getDocumentWithTabs(docs, docId);
  const monthTab = getTabById(document.tabs, tabId);
  if (!monthTab) {
    throw new Error(`Month tab '${tabId}' not found.`);
  }

  const content = monthTab.tab.documentTab?.body?.content ?? [];
  const endIndex = content.slice(-1)[0]?.endIndex ?? 2;
  if (endIndex <= 2) {
    return;
  }

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [{ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1, tabId } } }]
    }
  });
}

function buildWeekRows(year: number, monthIndex: number): Array<Array<Date | null>> {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const weeks: Array<Array<Date | null>> = [];
  let currentWeek = Array<Date | null>(5).fill(null);

  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, monthIndex, day);
    const weekday = date.getDay();

    if (weekday === 0 || weekday === 6) continue;

    const weekdayIndex = weekday - 1;
    if (weekdayIndex === 0 && currentWeek.some(Boolean)) {
      weeks.push(currentWeek);
      currentWeek = Array<Date | null>(5).fill(null);
    }

    currentWeek[weekdayIndex] = date;

    if (weekdayIndex === 4) {
      weeks.push(currentWeek);
      currentWeek = Array<Date | null>(5).fill(null);
    }
  }

  if (currentWeek.some(Boolean)) {
    weeks.push(currentWeek);
  }

  return weeks;
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function firstImageSourceFromHtml(value: string): string | null {
  const quotedMatch = /<img[^>]*\ssrc\s*=\s*(['"])(.*?)\1[^>]*>/i.exec(value);
  if (quotedMatch?.[2]) {
    return decodeHtmlEntities(quotedMatch[2]).trim();
  }

  const unquotedMatch = /<img[^>]*\ssrc\s*=\s*([^\s>]+)[^>]*>/i.exec(value);
  if (unquotedMatch?.[1]) {
    return decodeHtmlEntities(unquotedMatch[1]).trim();
  }

  return null;
}

function isHttpUrl(value: string) {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeImageUriForCalendar(sourceUri: string) {
  try {
    const parsed = new URL(sourceUri);
    const isUnsplashHost = parsed.hostname === "images.unsplash.com" || parsed.hostname === "source.unsplash.com";
    if (!isUnsplashHost) {
      return sourceUri;
    }

    parsed.searchParams.set("auto", "format");
    parsed.searchParams.set("fit", "crop");
    parsed.searchParams.set("crop", "center");
    parsed.searchParams.set("w", String(CALENDAR_IMAGE_CROP_WIDTH_PX));
    parsed.searchParams.set("h", String(CALENDAR_IMAGE_CROP_HEIGHT_PX));
    parsed.searchParams.set("q", "80");
    return parsed.toString();
  } catch {
    return sourceUri;
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

type ImageDimensions = { width: number; height: number };
type RefetchedCellImage = { imageUri: string; imageWidthPt: number; imageHeightPt?: number };

function pngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return null;
  }

  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function gifDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x47 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x38 ||
    (bytes[4] !== 0x37 && bytes[4] !== 0x39) ||
    bytes[5] !== 0x61
  ) {
    return null;
  }

  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) {
      offset += 1;
    }
    if (offset + 3 >= bytes.length) {
      return null;
    }

    const marker = bytes[offset + 1];
    offset += 2;

    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return null;
    }

    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      if (segmentLength < 7) {
        return null;
      }
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (width <= 0 || height <= 0) {
        return null;
      }
      return { width, height };
    }

    offset += segmentLength;
  }

  return null;
}

function imageDimensions(bytes: Uint8Array): ImageDimensions | null {
  return pngDimensions(bytes) ?? jpegDimensions(bytes) ?? gifDimensions(bytes);
}

async function refetchImageForCell(sourceUri: string, targetWidthPt: number): Promise<RefetchedCellImage> {
  const normalizedUri = normalizeImageUriForCalendar(sourceUri);
  const fallbackHeightPt = Number((targetWidthPt / CALENDAR_IMAGE_TARGET_ASPECT_RATIO).toFixed(2));
  const fallback: RefetchedCellImage = {
    imageUri: normalizedUri,
    imageWidthPt: targetWidthPt,
    imageHeightPt: fallbackHeightPt
  };

  try {
    const response = await fetch(normalizedUri, {
      cache: "no-store",
      redirect: "follow"
    });
    if (!response.ok) {
      return fallback;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) {
      return fallback;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const dimensions = imageDimensions(bytes);
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      return {
        imageUri: response.url || normalizedUri,
        imageWidthPt: targetWidthPt,
        imageHeightPt: fallbackHeightPt
      };
    }

    return {
      imageUri: response.url || normalizedUri,
      imageWidthPt: targetWidthPt,
      imageHeightPt: Number(((targetWidthPt * dimensions.height) / dimensions.width).toFixed(2))
    };
  } catch {
    return fallback;
  }
}

function htmlToRichText(html: string): RichTextContent {
  const boldOn = "[[[B_ON]]]";
  const boldOff = "[[[B_OFF]]]";
  const italicOn = "[[[I_ON]]]";
  const italicOff = "[[[I_OFF]]]";

  const normalized = decodeHtmlEntities(
    html
      .replaceAll(HIDE_IMAGE_TOKEN, "")
      .replace(/<(strong|b)(\s[^>]*)?>/gi, boldOn)
      .replace(/<\/(strong|b)>/gi, boldOff)
      .replace(/<(em|i)(\s[^>]*)?>/gi, italicOn)
      .replace(/<\/(em|i)>/gi, italicOff)
      .replace(/<\/p>|<\/li>|<br\s*\/?>/gi, "\n")
      .replace(/<p[^>]*>/gi, "")
      .replace(/<li[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\r/g, "")
      .replace(/Show Director:/gi, "SD:")
      .replace(/Show Manager:/gi, "SM:")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );

  let text = "";
  const spans: RichTextStyleSpan[] = [];
  let bold = false;
  let italic = false;
  let runStart = 0;
  let runBold = false;
  let runItalic = false;

  const flushRun = (end: number) => {
    if (end <= runStart) {
      runStart = end;
      return;
    }
    if (runBold || runItalic) {
      spans.push({
        start: runStart,
        end,
        bold: runBold,
        italic: runItalic
      });
    }
    runStart = end;
  };

  for (let index = 0; index < normalized.length; ) {
    if (normalized.startsWith(boldOn, index)) {
      flushRun(text.length);
      bold = true;
      runBold = bold;
      runItalic = italic;
      index += boldOn.length;
      continue;
    }
    if (normalized.startsWith(boldOff, index)) {
      flushRun(text.length);
      bold = false;
      runBold = bold;
      runItalic = italic;
      index += boldOff.length;
      continue;
    }
    if (normalized.startsWith(italicOn, index)) {
      flushRun(text.length);
      italic = true;
      runBold = bold;
      runItalic = italic;
      index += italicOn.length;
      continue;
    }
    if (normalized.startsWith(italicOff, index)) {
      flushRun(text.length);
      italic = false;
      runBold = bold;
      runItalic = italic;
      index += italicOff.length;
      continue;
    }

    text += normalized[index];
    index += 1;
  }

  flushRun(text.length);

  return {
    text,
    styleSpans: spans
  };
}

function parseHexColor(hex: string): docs_v1.Schema$RgbColor {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const value = Number.parseInt(full, 16);
  return {
    red: ((value >> 16) & 255) / 255,
    green: ((value >> 8) & 255) / 255,
    blue: (value & 255) / 255
  };
}

function optionalColor(hex: string): docs_v1.Schema$OptionalColor {
  return { color: { rgbColor: parseHexColor(hex) } };
}

function dimension(magnitude: number): docs_v1.Schema$Dimension {
  return { magnitude, unit: "PT" };
}

function tableBorder(hex: string): docs_v1.Schema$TableCellBorder {
  return {
    color: optionalColor(hex),
    dashStyle: "SOLID",
    width: dimension(1)
  };
}

function contentBackgroundHex(rowIndex: number, colIndex: number) {
  if (rowIndex === 0) {
    return colIndex % 2 === 0 ? HEADER_DARK_HEX : HEADER_LIGHT_HEX;
  }

  if ((rowIndex - 1) % 2 === 0) {
    return DATE_ROW_HEX;
  }

  return colIndex % 2 === 0 ? CONTENT_DARK_HEX : CONTENT_LIGHT_HEX;
}

function paddingForRow(rowIndex: number) {
  if (rowIndex === 0) return 4;
  if ((rowIndex - 1) % 2 === 0) return 2;
  return CONTENT_ROW_PADDING_PT;
}

function collectCellPlans(
  table: docs_v1.Schema$Table,
  weekRows: Array<Array<Date | null>>,
  entriesMap: Map<string, string>,
  overrideMap?: ReadonlyMap<string, { kind: ScheduleKind; label: string }>,
  showManagers?: Record<string, string>
): CellPlan[] {
  const plans: CellPlan[] = [];

  if (!table.tableRows) {
    return plans;
  }

  for (let rowIndex = 0; rowIndex < table.tableRows.length; rowIndex++) {
    const row = table.tableRows[rowIndex];
    if (!row.tableCells) continue;

    for (let colIndex = 0; colIndex < row.tableCells.length; colIndex++) {
      const cell = row.tableCells[colIndex];
      const startIndex = cell.content?.[0]?.paragraph?.elements?.[0]?.startIndex;
      if (startIndex == null) continue;

      if (rowIndex === 0) {
        const darkHeader = colIndex % 2 === 0;
        plans.push({
          rowIndex,
          colIndex,
          insertIndex: startIndex,
          text: WEEKDAYS[colIndex] ?? "",
          styleSpans: [],
          isHeader: true,
          forceBold: true,
          textColorHex: darkHeader ? WHITE_HEX : BLACK_HEX,
          backgroundHex: contentBackgroundHex(rowIndex, colIndex),
          paddingPt: paddingForRow(rowIndex),
          contentAlignment: "MIDDLE"
        });
        continue;
      }

      const weekIndex = Math.floor((rowIndex - 1) / 2);
      const date = weekRows[weekIndex]?.[colIndex] ?? null;
      const isDateRow = (rowIndex - 1) % 2 === 0;

      if (isDateRow) {
        plans.push({
          rowIndex,
          colIndex,
          insertIndex: startIndex,
          text: date ? String(date.getDate()) : "",
          styleSpans: [],
          isHeader: false,
          forceBold: Boolean(date),
          textColorHex: BLACK_HEX,
          backgroundHex: contentBackgroundHex(rowIndex, colIndex),
          paddingPt: paddingForRow(rowIndex),
          contentAlignment: "MIDDLE"
        });
        continue;
      }

      if (!date) {
        plans.push({
          rowIndex,
          colIndex,
          insertIndex: startIndex,
          text: "",
          styleSpans: [],
          isHeader: false,
          forceBold: false,
          textColorHex: BLACK_HEX,
          backgroundHex: contentBackgroundHex(rowIndex, colIndex),
          paddingPt: paddingForRow(rowIndex),
          contentAlignment: "TOP"
        });
        continue;
      }

      const dateKey = toDateKey(date);
      const schedule = resolveScheduleDay(dateKey, overrideMap);
      const rawStoredContent = entriesMap.get(dateKey) ?? "";
      const imageHidden = isScenicImageDay(schedule.kind) && hasImageHidden(rawStoredContent);
      const storedContent = stripImageToken(rawStoredContent);
      const managerName = showManagers?.[dateKey]?.trim() ?? "";
      const baseHtml = storedContent || defaultTemplateForKind(schedule.kind, schedule.label);
      const html =
        schedule.kind === "SHOW" && managerName
          ? setCalendarShowManager(baseHtml, [managerName])
          : baseHtml;
      const richText = htmlToRichText(html);
      const imageFromHtml = firstImageSourceFromHtml(storedContent);
      const imageSourceUri = imageFromHtml && isHttpUrl(imageFromHtml)
        ? imageFromHtml
        : isScenicImageDay(schedule.kind) && !imageHidden
          ? scenicImageForDate(dateKey)
          : undefined;

      plans.push({
        rowIndex,
        colIndex,
        insertIndex: startIndex,
        text: richText.text,
        styleSpans: richText.styleSpans,
        isHeader: false,
        forceBold: false,
        textColorHex: BLACK_HEX,
        backgroundHex: contentBackgroundHex(rowIndex, colIndex),
        paddingPt: paddingForRow(rowIndex),
        contentAlignment: "TOP",
        imageSourceUri
      });
    }
  }

  return plans;
}

function textStyleFields(style: { bold?: boolean; italic?: boolean; foregroundColor?: docs_v1.Schema$OptionalColor }) {
  const fields: string[] = [];
  if (style.bold !== undefined) fields.push("bold");
  if (style.italic !== undefined) fields.push("italic");
  if (style.foregroundColor !== undefined) fields.push("foregroundColor");
  return fields.join(",");
}

async function populateCellImages(cellPlans: CellPlan[]): Promise<CellPlan[]> {
  const withImages = await Promise.all(
    cellPlans.map(async (cell) => {
      if (!cell.imageSourceUri) {
        return cell;
      }

      const targetWidthPt = Math.max(24, TABLE_COLUMN_WIDTH_PT - cell.paddingPt * 2);
      const image = await refetchImageForCell(cell.imageSourceUri, targetWidthPt);
      return {
        ...cell,
        imageUri: image.imageUri,
        imageWidthPt: image.imageWidthPt,
        imageHeightPt: image.imageHeightPt
      };
    })
  );

  return withImages;
}

async function appendAndFillMonth(
  docs: ReturnType<typeof google.docs>,
  docId: string,
  tabId: string,
  monthData: MonthData
): Promise<void> {
  const { monthKey, entries, scheduleOverrides } = monthData;
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const weekRows = buildWeekRows(year, monthIndex);
  const entriesMap = new Map(entries.map((entry) => [entry.date, entry.content]));
  const overrideMap = new Map(
    (scheduleOverrides ?? []).map((row) => [row.date, { kind: row.kind, label: row.label }])
  );

  const docBefore = await getDocumentWithTabs(docs, docId);
  const monthTab = getTabById(docBefore.tabs, tabId);
  if (!monthTab) {
    throw new Error(`Month tab '${tabId}' not found.`);
  }

  const contentBefore = monthTab.tab.documentTab?.body?.content ?? [];
  const appendAt = (contentBefore[contentBefore.length - 1]?.endIndex ?? 2) - 1;
  const rowCount = 1 + weekRows.length * 2;
  const titleText = `INFOCUS MASTER CALENDAR - ${formatMonthLabel(monthKey)}\n`;
  const warningText = `${DOC_WARNING_TEXT}\n`;
  const prefaceText = `${titleText}${warningText}`;
  const tableInsertAt = appendAt + prefaceText.length;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        { insertText: { location: { index: appendAt, tabId }, text: prefaceText } },
        { insertTable: { location: { index: tableInsertAt, tabId }, rows: rowCount, columns: 5 } }
      ]
    }
  });

  const docAfter = await getDocumentWithTabs(docs, docId);
  const monthTabAfter = getTabById(docAfter.tabs, tabId);
  if (!monthTabAfter) {
    throw new Error(`Month tab '${tabId}' not found.`);
  }

  const contentAfter = monthTabAfter.tab.documentTab?.body?.content ?? [];
  const tableElements = contentAfter.filter((element) => element.table != null);
  const tableElement = tableElements[tableElements.length - 1];
  const table = tableElement?.table;
  const tableStartIndex = tableElement?.startIndex;
  if (!table || tableStartIndex == null) {
    return;
  }

  const cellPlans = await populateCellImages(
    collectCellPlans(table, weekRows, entriesMap, overrideMap, monthData.showManagers)
  );
  const insertionOrder = [...cellPlans].sort((a, b) => b.insertIndex - a.insertIndex);
  const border = tableBorder(BLACK_HEX);
  const requests: docs_v1.Schema$Request[] = [];

  requests.push({
    updateDocumentStyle: {
      tabId,
      documentStyle: {
        marginTop: dimension(PAGE_MARGIN_TOP_PT),
        marginBottom: dimension(PAGE_MARGIN_BOTTOM_PT),
        marginLeft: dimension(PAGE_SIDE_MARGIN_PT),
        marginRight: dimension(PAGE_SIDE_MARGIN_PT)
      },
      fields: "marginTop,marginBottom,marginLeft,marginRight"
    }
  });

  requests.push({
    updateTableColumnProperties: {
      tableStartLocation: { index: tableStartIndex, tabId },
      tableColumnProperties: {
        widthType: "FIXED_WIDTH",
        width: dimension(TABLE_COLUMN_WIDTH_PT)
      },
      fields: "widthType,width"
    }
  });

  requests.push({
    updateParagraphStyle: {
      range: { startIndex: Math.max(1, tableStartIndex - 1), endIndex: tableStartIndex, tabId },
      paragraphStyle: { alignment: "CENTER" },
      fields: "alignment"
    }
  });

  requests.push({
    updateTextStyle: {
      range: { startIndex: appendAt, endIndex: appendAt + titleText.length - 1, tabId },
      textStyle: {
        bold: true,
        weightedFontFamily: { fontFamily: "Arial", weight: 700 },
        fontSize: dimension(18)
      },
      fields: "bold,weightedFontFamily,fontSize"
    }
  });

  requests.push({
    updateTextStyle: {
      range: {
        startIndex: appendAt + titleText.length,
        endIndex: appendAt + titleText.length + DOC_WARNING_TEXT.length,
        tabId
      },
      textStyle: { bold: true },
      fields: "bold"
    }
  });

  requests.push({
    updateParagraphStyle: {
      range: { startIndex: appendAt, endIndex: appendAt + prefaceText.length + 1, tabId },
      paragraphStyle: { alignment: "CENTER" },
      fields: "alignment"
    }
  });

  for (const cell of cellPlans) {
    requests.push({
      updateTableCellStyle: {
        tableRange: {
          tableCellLocation: {
            tableStartLocation: { index: tableStartIndex, tabId },
            rowIndex: cell.rowIndex,
            columnIndex: cell.colIndex
          },
          rowSpan: 1,
          columnSpan: 1
        },
        tableCellStyle: {
          backgroundColor: optionalColor(cell.backgroundHex),
          contentAlignment: cell.contentAlignment,
          paddingTop: dimension(cell.paddingPt),
          paddingBottom: dimension(cell.paddingPt),
          paddingLeft: dimension(cell.paddingPt),
          paddingRight: dimension(cell.paddingPt),
          borderTop: border,
          borderBottom: border,
          borderLeft: border,
          borderRight: border
        },
        fields:
          "backgroundColor,contentAlignment,paddingTop,paddingBottom,paddingLeft,paddingRight,borderTop,borderBottom,borderLeft,borderRight"
      }
    });
  }

  for (const cell of insertionOrder) {
    let textStartIndex: number | null = null;
    let insertedText = "";
    let textContentOffset = 0;

    if (cell.imageUri && cell.imageWidthPt) {
      const objectSize: docs_v1.Schema$Size = {
        width: dimension(cell.imageWidthPt)
      };
      if (cell.imageHeightPt && cell.imageHeightPt > 0) {
        objectSize.height = dimension(cell.imageHeightPt);
      }

      requests.push({
        insertInlineImage: {
          location: { index: cell.insertIndex, tabId },
          uri: cell.imageUri,
          objectSize
        }
      });
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: cell.insertIndex, endIndex: cell.insertIndex + 1, tabId },
          paragraphStyle: { alignment: "CENTER" },
          fields: "alignment"
        }
      });

      if (cell.text.length > 0) {
        insertedText = `\n${cell.text}`;
        textStartIndex = cell.insertIndex + 1;
        textContentOffset = 1;
        requests.push({
          insertText: { location: { index: textStartIndex, tabId }, text: insertedText }
        });
      }
    } else if (cell.text.length > 0) {
      insertedText = cell.text;
      textStartIndex = cell.insertIndex;
      requests.push({
        insertText: { location: { index: textStartIndex, tabId }, text: insertedText }
      });
    }

    if (textStartIndex == null || insertedText.length === 0) {
      continue;
    }

    requests.push({
      updateParagraphStyle: {
        range: { startIndex: textStartIndex, endIndex: textStartIndex + insertedText.length, tabId },
        paragraphStyle: { alignment: "CENTER" },
        fields: "alignment"
      }
    });

    const textContentStart = textStartIndex + textContentOffset;
    const textContentEnd = textContentStart + cell.text.length;
    if (textContentEnd > textContentStart && (cell.forceBold || cell.textColorHex !== BLACK_HEX)) {
      const style: { bold?: boolean; foregroundColor?: docs_v1.Schema$OptionalColor } = {};
      if (cell.forceBold) {
        style.bold = true;
      }
      if (cell.textColorHex !== BLACK_HEX) {
        style.foregroundColor = optionalColor(cell.textColorHex);
      }

      requests.push({
        updateTextStyle: {
          range: { startIndex: textContentStart, endIndex: textContentEnd, tabId },
          textStyle: style,
          fields: textStyleFields(style)
        }
      });
    }

    if (cell.isHeader) {
      continue;
    }

    for (const span of cell.styleSpans) {
      if (span.end <= span.start) {
        continue;
      }

      const style: { bold?: boolean; italic?: boolean } = {};
      if (span.bold) {
        style.bold = true;
      }
      if (span.italic) {
        style.italic = true;
      }
      const fields = textStyleFields(style);
      if (!fields) {
        continue;
      }

      requests.push({
        updateTextStyle: {
          range: {
            startIndex: textContentStart + span.start,
            endIndex: textContentStart + span.end,
            tabId
          },
          textStyle: style,
          fields
        }
      });
    }
  }

  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests }
    });
  }
}

export async function syncCalendarToGoogleDoc(months: MonthData[]): Promise<void> {
  try {
    const config = getConfig();

    const auth = new google.auth.JWT({
      email: config.email,
      key: config.privateKey,
      scopes: ["https://www.googleapis.com/auth/documents"]
    });

    const docs = google.docs({ version: "v1", auth });

    for (const month of months) {
      const tabTitle = formatMonthLabel(month.monthKey);
      const tabId = await ensureMonthTabId(docs, config.docId, tabTitle);
      await clearTabContent(docs, config.docId, tabId);
      await appendAndFillMonth(docs, config.docId, tabId, month);
    }
  } catch (error) {
    if (error instanceof GoogleDocsSyncConfigError) {
      throw error;
    }

    if (isPrivateKeyDecoderError(error)) {
      throw new GoogleDocsSyncConfigError("Invalid GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY format for master calendar sync.");
    }

    if (isGooglePermissionError(error)) {
      const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
      const emailHint = serviceAccountEmail ? ` (${serviceAccountEmail})` : "";
      throw new GoogleDocsSyncPermissionError(
        `Google Docs permission denied. Share the target doc with the service account${emailHint} as Editor.`
      );
    }

    throw error;
  }
}
