import { DEFAULT_REVIEW_FPS, parseFrameAccurateTimecode, timeSecondsFromFrameNumber } from "@/src/lib/timecode";

export type ImportedCsvComment = {
  body: string;
  frameNumber: number;
  timeSeconds: number;
  createdAt: Date;
};

export type ParsedImportedCsvComments = {
  comments: ImportedCsvComment[];
  skippedCount: number;
  totalRows: number;
};

type CsvRow = Record<string, string>;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  const pushField = () => {
    currentRow.push(currentField);
    currentField = "";
  };

  const pushRow = () => {
    if (currentRow.length === 1 && currentRow[0] === "") {
      currentRow = [];
      return;
    }

    rows.push(currentRow);
    currentRow = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          currentField += "\"";
          index += 1;
          continue;
        }

        inQuotes = false;
        continue;
      }

      currentField += char;
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      pushField();
      continue;
    }

    if (char === "\n") {
      pushField();
      pushRow();
      continue;
    }

    if (char === "\r") {
      if (text[index + 1] === "\n") {
        index += 1;
      }
      pushField();
      pushRow();
      continue;
    }

    currentField += char;
  }

  if (inQuotes) {
    throw new Error("BAD_REQUEST");
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    pushField();
    pushRow();
  }

  return rows;
}

function rowsToObjects(rows: string[][]): CsvRow[] {
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim());

  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, (row[index] ?? "").trim()]))
  );
}

function parseCommentedAt(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/i);
  if (!match) {
    return null;
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, meridiemRaw] = match;
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  const hour12 = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  const second = Number.parseInt(secondRaw, 10);
  const meridiem = meridiemRaw.toUpperCase();

  let hour24 = hour12 % 12;
  if (meridiem === "PM") {
    hour24 += 12;
  }

  const date = new Date(year, month - 1, day, hour24, minute, second, 0);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function parseFrameNumberFromRow(row: CsvRow, fps: number) {
  const frameValue = row.Frame;
  if (frameValue) {
    const frameNumber = Number.parseInt(frameValue, 10);
    if (Number.isFinite(frameNumber) && frameNumber >= 0) {
      return frameNumber;
    }
  }

  const timecodeValue = row.Timecode || row["Timecode In"] || row["Timecode Source"] || row["Time In"];
  if (timecodeValue) {
    const parsedTimecode = parseFrameAccurateTimecode(timecodeValue, fps);
    if (parsedTimecode) {
      return parsedTimecode.frameNumber;
    }
  }

  return null;
}

export function parseImportedCommentsCsv(csvText: string, fps = DEFAULT_REVIEW_FPS): ParsedImportedCsvComments {
  const rows = rowsToObjects(parseCsv(csvText));
  const comments: ImportedCsvComment[] = [];
  let skippedCount = 0;

  for (const row of rows) {
    const body = (row.Comment ?? "").trim();
    const replyFlag = (row.Reply ?? "").trim().toLowerCase();

    if (!body || replyFlag === "yes") {
      skippedCount += 1;
      continue;
    }

    const frameNumber = parseFrameNumberFromRow(row, fps);
    const createdAt = parseCommentedAt(row["Commented At"] ?? "");

    if (frameNumber === null || createdAt === null) {
      skippedCount += 1;
      continue;
    }

    comments.push({
      body,
      frameNumber,
      timeSeconds: timeSecondsFromFrameNumber(frameNumber, fps),
      createdAt
    });
  }

  return {
    comments,
    skippedCount,
    totalRows: rows.length
  };
}
