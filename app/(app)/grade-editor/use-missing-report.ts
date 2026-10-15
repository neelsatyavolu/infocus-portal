"use client";

import { useRef, useState } from "react";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { fetchMissing, MISSING_CACHE_KEY } from "./grade-editor-api";
import type { GradeRow, MissingPayload } from "./grade-editor-types";
import { patchMissingReport } from "./grade-editor-utils";

/**
 * GET /api/grades/admin?view=missing (the same request as before the redesign). It powers the
 * Missing grades count, the cycle tab counts and the Not entered chip, so it is fetched in the
 * background when the page opens, whenever fresh cycle rows load, on Refresh and after Publish
 * all, as well as when the sheet opens. The last report loaded in this tab shows at once on
 * return, and saves and publishes on this page patch it in memory in between.
 */
export function useMissingReport() {
  const [missingData, setMissingData] = useState<MissingPayload | null>(null);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingError, setMissingError] = useState<string | null>(null);
  const sequenceRef = useRef(0);
  const inFlightRef = useRef(false);
  /** Saves and publishes that land while a fetch runs: re-applied to its result, which may predate them. */
  const patchesDuringFetchRef = useRef<Array<{ row: GradeRow; cycleNumber: number }>>([]);

  function hydrateFromCache() {
    const cached = cachedValue<MissingPayload>(MISSING_CACHE_KEY);
    if (cached) setMissingData(cached);
  }

  /**
   * Fetches the report; a newer call wins over an older one still running. `reuseInFlight` skips
   * the call when one is already running (it reads the same data), so triggers that fire together
   * (page open and the first cycle load) send one request.
   */
  async function loadMissing(options?: { reuseInFlight?: boolean }) {
    if (options?.reuseInFlight && inFlightRef.current) return;
    const sequence = ++sequenceRef.current;
    inFlightRef.current = true;
    patchesDuringFetchRef.current = [];
    setMissingLoading(true);
    setMissingError(null);
    try {
      const fetched = await fetchMissing();
      if (sequence !== sequenceRef.current) return;
      const data = patchesDuringFetchRef.current.reduce(
        (report, patch) => patchMissingReport(report, patch.row, patch.cycleNumber),
        fetched
      );
      patchesDuringFetchRef.current = [];
      rememberValue(MISSING_CACHE_KEY, data);
      setMissingData(data);
    } catch (error) {
      if (sequence !== sequenceRef.current) return;
      setMissingError(error instanceof Error ? error.message : "Failed to load missing grades.");
    } finally {
      if (sequence === sequenceRef.current) {
        inFlightRef.current = false;
        setMissingLoading(false);
      }
    }
  }

  function patchMissing(row: GradeRow, cycleNumber: number) {
    if (inFlightRef.current) patchesDuringFetchRef.current = [...patchesDuringFetchRef.current, { row, cycleNumber }];
    setMissingData((current) => {
      if (!current) return current;
      const next = patchMissingReport(current, row, cycleNumber);
      if (next !== current) rememberValue(MISSING_CACHE_KEY, next);
      return next;
    });
  }

  return { missingData, missingLoading, missingError, hydrateFromCache, loadMissing, patchMissing };
}
