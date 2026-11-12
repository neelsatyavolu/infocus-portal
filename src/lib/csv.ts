/**
 * CSV building shared by the Grade Editor download and the record exports. A value is quoted only
 * when it holds a quote, comma or line break; quotes inside are doubled. null/undefined → empty.
 */
export type CsvValue = string | number | boolean | null | undefined;

export function csvValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";

  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;

  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export function csvLine(values: Array<string | number | null | undefined>) {
  return values.map(csvValue).join(",");
}

/**
 * Text people typed (names, notes, reasons) can start with a character a spreadsheet reads as a
 * formula. Exports prefix those with an apostrophe so they open as plain text.
 */
export function csvText(value: string | null | undefined) {
  if (value === null || value === undefined) return value;
  return /^[=+@\t\r]/.test(value) ? `'${value}` : value;
}

function exportCell(value: CsvValue) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return csvText(value);
  return value;
}

/** Header row plus data rows, CRLF-free ("\n") like the Grade Editor download. */
export function buildCsv(header: string[], rows: CsvValue[][]) {
  return [csvLine(header), ...rows.map((row) => csvLine(row.map(exportCell)))].join("\n");
}

/** "members-2026-11-11.csv" (date in Pacific time). */
export function csvFilename(stem: string, now: Date = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
  return `${stem}-${date}.csv`;
}

/** A download response; never cached (these are private records). */
export function csvResponse(filename: string, body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
