"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { restoreAssignedNamesInCalendarHtml, type CalendarCrewRole } from "@/src/lib/calendar-show-content";
import {
  defaultTemplateForKind,
  hasImageHidden,
  isScenicImageDay,
  stripImageToken,
  withImageHidden
} from "@/src/lib/master-calendar-cells";
import {
  AUTO_SYNC_IDLE_MS,
  PACKAGE_TRIGGER,
  buildPillHtml,
  buildWeekRows,
  clampToCalendarStart,
  entriesRecord,
  extractPackageIds,
  formatMonthTitle,
  isCalendarStart,
  isRichTextEmpty,
  monthCursorFromKey,
  normalizeEditorHtml,
  removePillFromHtml,
  renamePillInHtml,
  scheduleFromDays,
  toDateKey,
  toMonthKey,
  type CalendarResponse,
  type DayFailure,
  type PackageOption,
  type QueuedCalendarPackage,
  type ScheduleDay,
  type ShowManagerAssignment
} from "@/components/master-calendar/calendar-model";

type ApiPayload<T> = { data?: T; error?: { message?: string } };

async function postJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => ({}))) as ApiPayload<T>;
  return { response, payload };
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** One date's notes/image saves, run one after another (see persistCell). */
type CellSaveQueue = {
  tail: Promise<void>;
  /** Saves queued or running. */
  size: number;
  /** What the last save in this chain stored (null until one does). */
  content: string | null;
};

function withoutKey<T>(record: Record<string, T>, key: string) {
  if (!(key in record)) return record;
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key)) as Record<string, T>;
}

/** Client date for "today", with the server's Pacific date for the first paint (no hydration flip). */
function subscribeToDayChange(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("focus", onChange);
  };
}

export function useTodayKey(serverTodayKey: string | null) {
  return useSyncExternalStore(
    subscribeToDayChange,
    () => toDateKey(new Date()),
    () => serverTodayKey
  );
}

export type SyncState =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "failed" }
  | { kind: "dirty"; months: string[]; includesViewed: boolean }
  | { kind: "synced" };

/**
 * All Master Calendar state and network work: month loading (cache, generation guard, ?month=),
 * cell saves, package-pill aired sync, cast and crew saves, wipe, Sync to Doc and auto-sync.
 * Every request, payload and timing matches the original page.
 */
export function useMasterCalendar(initialData: CalendarResponse) {
  const initialEntries = useMemo(() => entriesRecord(initialData.entries), [initialData.entries]);
  const [monthCursor, setMonthCursor] = useState(() => monthCursorFromKey(initialData.month));
  const [entries, setEntries] = useState<Record<string, string>>(initialEntries);
  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>(initialData.schedule ?? []);
  const [canEdit, setCanEdit] = useState(initialData.canEdit);
  const [canViewCastCounts, setCanViewCastCounts] = useState(Boolean(initialData.canViewCastCounts));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [queuedPackages, setQueuedPackages] = useState<QueuedCalendarPackage[]>(initialData.queuedPackages ?? []);
  const [castMembers, setCastMembers] = useState<string[]>(initialData.members ?? []);
  const [showManagerPool, setShowManagerPool] = useState<string[]>(initialData.showManagerPool ?? []);
  const [showManagers, setShowManagers] = useState<Record<string, ShowManagerAssignment>>(
    initialData.showManagers ?? {}
  );
  const [castBusyDate, setCastBusyDate] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState<string[]>([]);
  const [failedDates, setFailedDates] = useState<Record<string, DayFailure>>({});
  const [wipingAnchors, setWipingAnchors] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  // Mirrors of dirtyMonthsRef for the sync tag; the ref still drives auto-sync timing.
  const [dirtyMonths, setDirtyMonths] = useState<string[]>([]);
  const [syncedMonths, setSyncedMonths] = useState<string[]>([]);

  const autoSyncTimeoutRef = useRef<number | null>(null);
  const lastEditAtRef = useRef<number | null>(null);
  const dirtyMonthsRef = useRef<Set<string>>(new Set());
  const syncingRef = useRef(false);
  const canEditRef = useRef(false);
  const activeEditorRef = useRef<HTMLDivElement | null>(null);
  const activeDateRef = useRef<string | null>(null);
  const knownAiredIdsRef = useRef<Record<string, Set<string>>>(
    Object.fromEntries(Object.entries(initialEntries).map(([dateKey, html]) => [dateKey, extractPackageIds(html)]))
  );
  // Aired syncs run one after another (a pill removed then put back can't land out of order), but
  // never hold up a cell's save.
  const airedSyncRef = useRef<Promise<void>>(Promise.resolve());
  const monthCacheRef = useRef<Map<string, CalendarResponse>>(new Map([[initialData.month, initialData]]));
  const loadGenerationRef = useRef(0);
  const cellQueuesRef = useRef(new Map<string, CellSaveQueue>());

  const monthKey = useMemo(() => toMonthKey(monthCursor), [monthCursor]);
  const weeks = useMemo(() => buildWeekRows(monthCursor), [monthCursor]);
  const monthTitle = formatMonthTitle(monthCursor);
  const atCalendarStart = isCalendarStart(monthCursor);

  useEffect(() => {
    syncingRef.current = syncing;
  }, [syncing]);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  // ------------------------------------------------------------------------------------------
  // Months

  function applyMonthData(data: CalendarResponse) {
    const loadedEntries = entriesRecord(data.entries);
    setCanEdit(data.canEdit);
    setCanViewCastCounts(Boolean(data.canViewCastCounts));
    setScheduleDays(data.schedule ?? []);
    setQueuedPackages(data.queuedPackages ?? []);
    setCastMembers(data.members ?? []);
    setShowManagerPool(data.showManagerPool ?? []);
    setShowManagers(data.showManagers ?? {});
    setEntries(loadedEntries);
    knownAiredIdsRef.current = Object.fromEntries(
      Object.entries(loadedEntries).map(([dateKey, html]) => [dateKey, extractPackageIds(html)])
    );
    monthCacheRef.current.set(data.month, data);
  }

  async function loadMonth(nextMonthKey: string, nextCursor: Date) {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    setMessage(null);

    const cached = monthCacheRef.current.get(nextMonthKey);
    if (cached) {
      applyMonthData(cached);
      setMonthCursor(nextCursor);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/master-calendar?month=${nextMonthKey}`, { cache: "no-store" });
      const payload = (await response.json()) as ApiPayload<CalendarResponse>;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to load master calendar.");
      }
      if (loadGenerationRef.current !== generation) return;
      applyMonthData(payload.data);
      setMonthCursor(nextCursor);
    } catch (error) {
      if (loadGenerationRef.current !== generation) return;
      setMessage(errorText(error, "Failed to load master calendar."));
    } finally {
      if (loadGenerationRef.current === generation) setLoading(false);
    }
  }

  // Keep ?month= in the URL so a reload or shared link opens the same month (page.tsx reads it).
  const urlMonthSyncedRef = useRef(false);
  useEffect(() => {
    const firstRun = !urlMonthSyncedRef.current;
    urlMonthSyncedRef.current = true;
    const url = new URL(window.location.href);
    const urlMonth = url.searchParams.get("month");
    if (urlMonth === monthKey || (firstRun && urlMonth === null)) return;
    url.searchParams.set("month", monthKey);
    window.history.replaceState(window.history.state, "", url);
  }, [monthKey]);

  // Keep the month cache in step with every edit, so stepping back is instant and current.
  useEffect(() => {
    const cached = monthCacheRef.current.get(monthKey);
    if (!cached) return;
    monthCacheRef.current.set(monthKey, {
      ...cached,
      canEdit,
      canViewCastCounts,
      entries: Object.entries(entries).map(([date, content]) => ({ date, content })),
      schedule: scheduleDays,
      queuedPackages,
      members: castMembers,
      showManagerPool,
      showManagers
    });
  }, [monthKey, canEdit, canViewCastCounts, entries, scheduleDays, queuedPackages, castMembers, showManagerPool, showManagers]);

  useEffect(() => {
    return () => {
      if (autoSyncTimeoutRef.current) clearTimeout(autoSyncTimeoutRef.current);
    };
  }, []);

  function shiftMonth(offset: number) {
    const next = clampToCalendarStart(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + offset, 1));
    const nextKey = toMonthKey(next);
    if (nextKey === monthKey) return;
    void loadMonth(nextKey, next);
  }

  /** Loads the current month. Returns false when it is already showing (nothing to load). */
  function goToCurrentMonth() {
    const next = clampToCalendarStart(new Date());
    const nextKey = toMonthKey(next);
    if (nextKey === monthKey) return false;
    void loadMonth(nextKey, next);
    return true;
  }

  // ------------------------------------------------------------------------------------------
  // Sync to Doc

  function markMonthDirty(month: string) {
    dirtyMonthsRef.current.add(month);
    setDirtyMonths(Array.from(dirtyMonthsRef.current));
    setSyncedMonths((current) => current.filter((entry) => entry !== month));
  }

  function markMonthSynced(month: string) {
    dirtyMonthsRef.current.delete(month);
    setDirtyMonths(Array.from(dirtyMonthsRef.current));
    setSyncedMonths((current) => (current.includes(month) ? current : [...current, month]));
  }

  async function syncToGoogleDoc(targetMonthKey: string, options?: { auto?: boolean }) {
    setSyncing(true);
    if (!options?.auto) setSyncError(null);
    try {
      const { response, payload } = await postJson<{ synced: boolean; entryCount: number }>(
        "/api/master-calendar/sync-doc",
        { month: targetMonthKey }
      );
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Failed to sync.");
      markMonthSynced(targetMonthKey);
      setSyncError(null);
      if (!options?.auto) toast.success(`Synced to Google Doc (${payload.data.entryCount} entries).`);
      return true;
    } catch (error) {
      setSyncError(errorText(error, "Failed to sync."));
      return false;
    } finally {
      setSyncing(false);
    }
  }

  async function runAutoSyncCheck() {
    autoSyncTimeoutRef.current = null;
    const lastEditAt = lastEditAtRef.current;
    if (!lastEditAt) return;

    if (Date.now() - lastEditAt < AUTO_SYNC_IDLE_MS || syncingRef.current || !canEditRef.current) {
      autoSyncTimeoutRef.current = window.setTimeout(() => void runAutoSyncCheck(), AUTO_SYNC_IDLE_MS);
      return;
    }

    const monthsToSync = Array.from(dirtyMonthsRef.current);
    if (monthsToSync.length === 0) return;

    for (const dirtyMonth of monthsToSync) {
      const success = await syncToGoogleDoc(dirtyMonth, { auto: true });
      if (!success) break;
    }

    if (dirtyMonthsRef.current.size > 0) {
      autoSyncTimeoutRef.current = window.setTimeout(() => void runAutoSyncCheck(), AUTO_SYNC_IDLE_MS);
    }
  }

  function scheduleAutoSyncCheck() {
    if (autoSyncTimeoutRef.current) clearTimeout(autoSyncTimeoutRef.current);
    autoSyncTimeoutRef.current = window.setTimeout(() => void runAutoSyncCheck(), AUTO_SYNC_IDLE_MS);
  }

  // ------------------------------------------------------------------------------------------
  // Cells

  function markFailed(dateKey: string, message: string, kind: DayFailure["kind"] = "save") {
    setFailedDates((current) => ({ ...current, [dateKey]: { message, kind } }));
  }

  function clearFailed(dateKey: string) {
    setFailedDates((current) => withoutKey(current, dateKey));
  }

  async function syncAiredStateForPills(dateKey: string, savedHtml: string) {
    const currentIds = extractPackageIds(savedHtml);
    const previousIds = knownAiredIdsRef.current[dateKey] ?? new Set<string>();
    const addedIds = Array.from(currentIds).filter((id) => !previousIds.has(id));
    const removedIds = Array.from(previousIds).filter((id) => !currentIds.has(id));
    knownAiredIdsRef.current = { ...knownAiredIdsRef.current, [dateKey]: currentIds };
    if (addedIds.length === 0 && removedIds.length === 0) return;

    await Promise.all([
      ...addedIds.map(async (mediaItemId) => {
        try {
          const { response, payload } = await postJson("/api/master-calendar/mark-aired", { mediaItemId, date: dateKey });
          if (!response.ok) throw new Error(payload.error?.message ?? "Failed to mark aired.");
        } catch (error) {
          setMessage(errorText(error, "Failed to mark aired."));
        }
      }),
      ...removedIds.map(async (mediaItemId) => {
        try {
          const { response, payload } = await postJson("/api/master-calendar/unmark-aired", { mediaItemId });
          if (!response.ok) throw new Error(payload.error?.message ?? "Failed to revert aired.");
        } catch (error) {
          setMessage(errorText(error, "Failed to revert aired."));
        }
      })
    ]);
  }

  /**
   * Saves one cell's notes HTML. Returns the content now stored, or null when nothing was sent
   * (no change) or the save failed.
   */
  async function saveCell(dateKey: string, rawHtml: string, existingContent: string, schedule: ScheduleDay) {
    const merged = restoreAssignedNamesInCalendarHtml(rawHtml, existingContent, schedule.kind);
    const normalized = normalizeEditorHtml(merged);
    const defaultTemplate = normalizeEditorHtml(defaultTemplateForKind(schedule.kind, schedule.label));
    let nextContent = isRichTextEmpty(normalized) ? "" : normalized;
    if (!existingContent && nextContent === defaultTemplate) nextContent = "";
    if (nextContent === existingContent) return null;

    setSavingNotes((current) => [...current, dateKey]);
    try {
      const { response, payload } = await postJson<{ date: string; content?: string; deleted?: boolean }>(
        "/api/master-calendar",
        { date: dateKey, content: nextContent }
      );
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Failed to save cell.");

      const savedCell = payload.data;
      const savedContent = savedCell.deleted ? "" : savedCell.content ?? nextContent;
      setEntries((current) => {
        if (savedCell.deleted) return withoutKey(current, dateKey);
        return (current[dateKey] ?? "") === savedContent ? current : { ...current, [dateKey]: savedContent };
      });
      clearFailed(dateKey);
      markMonthDirty(monthKey);
      lastEditAtRef.current = Date.now();
      scheduleAutoSyncCheck();

      // Each mark/unmark catches its own failure (shown in the message bar), so the chain never rejects.
      airedSyncRef.current = airedSyncRef.current.then(() => syncAiredStateForPills(dateKey, savedContent));
      return savedContent;
    } catch (error) {
      markFailed(dateKey, errorText(error, "Failed to save cell."));
      return null;
    } finally {
      setSavingNotes((current) => {
        const index = current.indexOf(dateKey);
        return index === -1 ? current : [...current.slice(0, index), ...current.slice(index + 1)];
      });
    }
  }

  /**
   * Queues a cell save behind any save already running for that date, and builds its HTML from
   * the content as it is when its turn comes (the last save's result, not this render's copy). So
   * a notes blur followed at once by Delete image (or a pill rename) can't undo the other.
   * `nextHtml` returns null when there is nothing to save.
   */
  function persistCell(dateKey: string, nextHtml: (existingContent: string) => string | null) {
    const schedule = scheduleFromDays(scheduleDays, dateKey);
    const renderedContent = entries[dateKey] ?? "";
    const queues = cellQueuesRef.current;
    const queue: CellSaveQueue = queues.get(dateKey) ?? { tail: Promise.resolve(), size: 0, content: null };
    const run = async () => {
      try {
        const existingContent = queue.content ?? renderedContent;
        const rawHtml = nextHtml(existingContent);
        if (rawHtml === null) return;
        const saved = await saveCell(dateKey, rawHtml, existingContent, schedule);
        if (saved !== null) queue.content = saved;
      } finally {
        queue.size -= 1;
        if (queue.size === 0) queues.delete(dateKey);
      }
    };
    queue.size += 1;
    // Runs even if the save before it threw, so one failure never stalls the date.
    queue.tail = queue.tail.then(run, run);
    queues.set(dateKey, queue);
    return queue.tail;
  }

  /** Saves a notes field, keeping the class day's hidden-image token. */
  function commitNotes(dateKey: string, html: string) {
    const kind = scheduleFromDays(scheduleDays, dateKey).kind;
    return persistCell(dateKey, (existing) =>
      isScenicImageDay(kind) && hasImageHidden(existing) ? withImageHidden(html) : html
    );
  }

  function toggleImage(dateKey: string) {
    return persistCell(dateKey, (existing) => {
      const storedContent = stripImageToken(existing);
      return hasImageHidden(existing) ? storedContent : withImageHidden(storedContent);
    });
  }

  const registerEditor = useCallback((dateKey: string, element: HTMLDivElement) => {
    activeEditorRef.current = element;
    activeDateRef.current = dateKey;
  }, []);

  /** Swaps the first "[package]" in the last-focused notes field for a pill and saves. */
  function insertPackagePill(option: PackageOption) {
    const dateKey = activeDateRef.current;
    const editor = activeEditorRef.current;
    if (!dateKey || !editor) return;
    const currentHtml = editor.innerHTML;
    if (!currentHtml.includes(PACKAGE_TRIGGER)) return;
    editor.innerHTML = currentHtml.replace(PACKAGE_TRIGGER, buildPillHtml(option.id, option.title));
    void commitNotes(dateKey, editor.innerHTML);
  }

  function renamePill(dateKey: string, packageId: string, label: string) {
    void persistCell(dateKey, (html) => {
      const nextHtml = renamePillInHtml(html, packageId, label);
      return nextHtml === html ? null : nextHtml;
    });
  }

  function removePill(dateKey: string, packageId: string) {
    void persistCell(dateKey, (html) => {
      const nextHtml = removePillFromHtml(html, packageId);
      return nextHtml === html ? null : nextHtml;
    });
  }

  // ------------------------------------------------------------------------------------------
  // Cast and crew

  function applySavedContent(dateKey: string, content: string | undefined) {
    if (content) setEntries((current) => ({ ...current, [dateKey]: content }));
  }

  async function saveShowAnchors(dateKey: string, names: string[], source: "manual" | "random") {
    setCastBusyDate(dateKey);
    try {
      const { response, payload } = await postJson<{ content?: string }>("/api/show-roles/anchors", {
        date: dateKey,
        names,
        source
      });
      if (!response.ok) throw new Error(payload.error?.message ?? "Failed to save anchors.");
      applySavedContent(dateKey, payload.data?.content);
      clearFailed(dateKey);
    } catch (error) {
      markFailed(dateKey, errorText(error, "Failed to save anchors."));
    } finally {
      setCastBusyDate(null);
    }
  }

  async function suggestNames(url: string, fallback: string, emptyText: string) {
    const response = await fetch(url, { cache: "no-store" });
    const payload = (await response.json()) as ApiPayload<{ suggested?: string[] }>;
    if (!response.ok) throw new Error(payload.error?.message ?? fallback);
    const suggested = payload.data?.suggested ?? [];
    if (suggested.length === 0) throw new Error(emptyText);
    return suggested;
  }

  async function randomizeShowAnchors(dateKey: string) {
    setCastBusyDate(dateKey);
    try {
      const suggested = await suggestNames(
        `/api/show-roles/anchors?date=${encodeURIComponent(dateKey)}`,
        "Failed to suggest anchors.",
        "No eligible anchors left this month."
      );
      await saveShowAnchors(dateKey, suggested, "random");
    } catch (error) {
      markFailed(dateKey, errorText(error, "Failed to suggest anchors."), "randomize");
      setCastBusyDate(null);
    }
  }

  async function saveShowManager(dateKey: string, name: string) {
    setCastBusyDate(dateKey);
    try {
      const { response, payload } = await postJson<{
        content?: string;
        name?: string;
        source?: "rotation" | "manual";
        pool?: string[];
      }>("/api/show-roles/show-manager", { date: dateKey, name });
      if (!response.ok) throw new Error(payload.error?.message ?? "Failed to save show manager.");
      applySavedContent(dateKey, payload.data?.content);
      if (payload.data?.pool) setShowManagerPool(payload.data.pool);
      setShowManagers((current) => ({
        ...current,
        [dateKey]: {
          name: payload.data?.name ?? name,
          source: payload.data?.source ?? (name ? "manual" : "rotation")
        }
      }));
      clearFailed(dateKey);
    } catch (error) {
      markFailed(dateKey, errorText(error, "Failed to save show manager."));
    } finally {
      setCastBusyDate(null);
    }
  }

  async function savePaAnnouncers(dateKey: string, names: string[]) {
    setCastBusyDate(dateKey);
    try {
      const { response, payload } = await postJson<{ content?: string }>("/api/show-roles/pa-announcers", {
        date: dateKey,
        names
      });
      if (!response.ok) throw new Error(payload.error?.message ?? "Failed to save PA announcers.");
      applySavedContent(dateKey, payload.data?.content);
      clearFailed(dateKey);
    } catch (error) {
      markFailed(dateKey, errorText(error, "Failed to save PA announcers."));
    } finally {
      setCastBusyDate(null);
    }
  }

  async function randomizePaAnnouncers(dateKey: string) {
    setCastBusyDate(dateKey);
    try {
      const suggested = await suggestNames(
        `/api/show-roles/pa-announcers?date=${encodeURIComponent(dateKey)}`,
        "Failed to suggest PA announcers.",
        "No eligible PA announcers left this month."
      );
      await savePaAnnouncers(dateKey, suggested);
    } catch (error) {
      markFailed(dateKey, errorText(error, "Failed to suggest PA announcers."), "randomize");
      setCastBusyDate(null);
    }
  }

  async function saveCrew(dateKey: string, role: CalendarCrewRole, names: string[]) {
    setCastBusyDate(dateKey);
    try {
      const { response, payload } = await postJson<{ content?: string }>("/api/show-roles/crew", {
        date: dateKey,
        role,
        names
      });
      if (!response.ok) throw new Error(payload.error?.message ?? `Failed to save ${role.toLowerCase()}.`);
      setEntries((current) => ({ ...current, [dateKey]: payload.data?.content ?? "" }));
      clearFailed(dateKey);
    } catch (error) {
      markFailed(dateKey, errorText(error, `Failed to save ${role.toLowerCase()}.`));
    } finally {
      setCastBusyDate(null);
    }
  }

  // Throws on failure so the confirm dialog stays open for a retry (the error shows inside it).
  async function wipeMonthAnchors() {
    setWipingAnchors(true);
    setWipeError(null);
    setMessage(null);
    setSyncError(null);
    try {
      const { response, payload } = await postJson<{ entries?: Array<{ date: string; content: string }> }>(
        "/api/show-roles/anchors/wipe",
        { month: monthKey }
      );
      if (!response.ok) throw new Error(payload.error?.message ?? "Failed to wipe anchors.");
      const cleared = payload.data?.entries ?? [];
      if (cleared.length > 0) {
        setEntries((current) => ({
          ...current,
          ...Object.fromEntries(cleared.map((entry) => [entry.date, entry.content]))
        }));
      }
      toast.success(`Cleared ${monthTitle} anchors.`);
    } catch (error) {
      setWipeError(errorText(error, "Failed to wipe anchors."));
      throw error;
    } finally {
      setWipingAnchors(false);
    }
  }

  // ------------------------------------------------------------------------------------------
  // Derived status

  const savingDates = useMemo(
    () => new Set(castBusyDate ? [...savingNotes, castBusyDate] : savingNotes),
    [savingNotes, castBusyDate]
  );

  let syncState: SyncState = { kind: "idle" };
  if (syncing) syncState = { kind: "syncing" };
  else if (syncError) syncState = { kind: "failed" };
  else if (dirtyMonths.length > 0) {
    syncState = { kind: "dirty", months: dirtyMonths, includesViewed: dirtyMonths.includes(monthKey) };
  } else if (syncedMonths.includes(monthKey)) syncState = { kind: "synced" };

  return {
    monthKey,
    monthTitle,
    weeks,
    atCalendarStart,
    loading,
    entries,
    scheduleDays,
    queuedPackages,
    castMembers,
    showManagerPool,
    showManagers,
    canEdit,
    canViewCastCounts,
    castBusyDate,
    wipingAnchors,
    wipeError,
    syncing,
    syncState,
    savingDates,
    failedDates,
    message,
    syncError,
    clearMessage: () => setMessage(null),
    clearSyncError: () => setSyncError(null),
    clearWipeError: () => setWipeError(null),
    clearFailed,
    shiftMonth,
    goToCurrentMonth,
    syncNow: () => void syncToGoogleDoc(monthKey),
    wipeMonthAnchors,
    commitNotes,
    toggleImage,
    registerEditor,
    insertPackagePill,
    renamePill,
    removePill,
    saveShowAnchors,
    randomizeShowAnchors,
    saveShowManager,
    savePaAnnouncers,
    randomizePaAnnouncers,
    saveCrew
  };
}
