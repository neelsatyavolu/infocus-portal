const MONTH_PARAM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
/** First month the Master Calendar shows; matches CALENDAR_START in the client. */
export const MASTER_CALENDAR_START_MONTH = "2026-09";

/**
 * Reads `?month=YYYY-MM` for the Master Calendar. Anything malformed falls back to `fallback`
 * (the current month); months before the calendar starts clamp to the first month.
 */
export function parseMasterCalendarMonthParam(value: string | string[] | undefined, fallback: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !MONTH_PARAM_PATTERN.test(raw)) {
    return fallback;
  }
  return raw < MASTER_CALENDAR_START_MONTH ? MASTER_CALENDAR_START_MONTH : raw;
}
