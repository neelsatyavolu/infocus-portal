"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Eraser, FileUp, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CastCountsDialog } from "@/components/master-calendar/cast-counts-dialog";
import { PaDayControls, ShowDayControls } from "@/components/master-calendar/show-day-controls";
import {
  extractCalendarAnchors,
  extractCalendarPaAnnouncers,
  omitAssignedNamesFromCalendarHtml,
  restoreAssignedNamesInCalendarHtml
} from "@/src/lib/calendar-show-content";
import {
  defaultTemplateForKind,
  hasImageHidden,
  isScenicImageDay,
  scenicImageForDate,
  stripImageToken,
  withImageHidden
} from "@/src/lib/master-calendar-cells";
import { resolveScheduleDay, type ScheduleKind } from "@/src/lib/school-schedule";
import { cn } from "@/src/lib/utils";

type CalendarEntry = {
  date: string;
  content: string;
};

type ScheduleDay = {
  date: string;
  kind: ScheduleKind;
  label: string;
};

type QueuedCalendarPackage = {
  id: string;
  groupTopic: string;
  cycleNumber: number;
  custom?: boolean;
  date: string | null;
};

type ShowManagerAssignment = {
  name: string;
  source: "rotation" | "manual";
};

type CalendarResponse = {
  month: string;
  canEdit: boolean;
  canViewCastCounts?: boolean;
  entries: CalendarEntry[];
  schedule?: ScheduleDay[];
  queuedPackages?: QueuedCalendarPackage[];
  members?: string[];
  showManagerPool?: string[];
  showManagers?: Record<string, ShowManagerAssignment>;
};

type PackageOption = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  currentVersionId: string | null;
  approvalStatus: "IN_REVIEW" | "NEEDS_CHANGES" | "APPROVED" | "AIRED" | null;
  airedAt: string | null;
};

type PackagePickerState = {
  dateKey: string;
  weekdayIndex: number;
  anchor: { left: number; top: number };
};

type PillRenameState = {
  dateKey: string;
  weekdayIndex: number;
  packageId: string;
  currentLabel: string;
  anchor: { left: number; top: number };
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

const COLUMN_SURFACES = [
  "bg-[hsl(var(--card))]/50",
  "bg-[hsl(var(--background))]",
  "bg-[hsl(var(--card))]/50",
  "bg-[hsl(var(--background))]",
  "bg-[hsl(var(--card))]/50"
] as const;

const HEADER_SURFACES = [
  "bg-[var(--ink-3)] font-display tracking-[0.18em] text-foreground",
  "bg-[var(--ink-2)] font-display tracking-[0.18em] text-foreground",
  "bg-[var(--ink-3)] font-display tracking-[0.18em] text-foreground",
  "bg-[var(--ink-2)] font-display tracking-[0.18em] text-foreground",
  "bg-[var(--ink-3)] font-display tracking-[0.18em] text-foreground"
] as const;

const BUTTON_SECONDARY =
  "bg-secondary text-foreground hover:bg-accent";

const AUTO_SYNC_IDLE_MS = 60_000;
const PACKAGE_TRIGGER = "[package]";
const CALENDAR_START = { year: 2026, month: 8 } as const;

function startMonthDate() {
  return new Date(CALENDAR_START.year, CALENDAR_START.month, 1);
}

function clampToCalendarStart(value: Date) {
  const start = startMonthDate();
  return value < start ? start : new Date(value.getFullYear(), value.getMonth(), 1);
}

const CALENDAR_TEXT_STYLES =
  "text-center text-sm leading-5 text-foreground [&_p]:mb-1 [&_div]:mb-1 [&_strong]:font-extrabold [&_em]:italic [&_.package-pill]:inline-flex [&_.package-pill]:cursor-pointer [&_.package-pill]:items-center [&_.package-pill]:gap-1 [&_.package-pill]:rounded-full [&_.package-pill]:border [&_.package-pill]:border-[var(--brand-green)]/50 [&_.package-pill]:bg-[var(--brand-green)]/15 [&_.package-pill]:px-2 [&_.package-pill]:py-0.5 [&_.package-pill]:text-xs [&_.package-pill]:font-semibold [&_.package-pill]:text-foreground";
const CALENDAR_EDITABLE_STYLES = `${CALENDAR_TEXT_STYLES} outline-none`;

function toMonthKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthCursorFromKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return clampToCalendarStart(new Date(year, month - 1, 1));
}

function entriesRecord(entries: CalendarEntry[]) {
  return entries.reduce<Record<string, string>>((result, entry) => {
    result[entry.date] = entry.content;
    return result;
  }, {});
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthTitle(value: Date) {
  return value.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

function buildWeekRows(monthCursor: Date) {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const weeks: Array<Array<Date | null>> = [];
  let currentWeek = Array<Date | null>(5).fill(null);

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month, day);
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

function scheduleFromDays(days: ScheduleDay[] | undefined, dateKey: string): ScheduleDay {
  const match = days?.find((day) => day.date === dateKey);
  return match ?? resolveScheduleDay(dateKey);
}


function normalizeEditorHtml(value: string) {
  return value.replace(/​/g, "").trim();
}

function isRichTextEmpty(value: string) {
  const text = value
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
  return text.length === 0;
}

function escapeHtmlAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPillHtml(packageId: string, label: string) {
  const safeLabel = escapeHtmlAttr(label);
  return `<span class="package-pill" data-package-id="${escapeHtmlAttr(packageId)}" data-display-label="${safeLabel}">${safeLabel}</span>`;
}

function extractPackageIds(html: string) {
  const ids = new Set<string>();
  if (!html) return ids;
  const regex = /data-package-id="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

type EditableHtmlBlockProps = {
  html: string;
  className: string;
  onCommit: (html: string) => void | Promise<void>;
  onPackageTrigger?: (anchor: { left: number; top: number }) => void;
  onEditorFocus?: (element: HTMLDivElement) => void;
  onEditorBlur?: () => void;
  onPillClick?: (
    pillElement: HTMLElement,
    anchor: { left: number; top: number }
  ) => void;
};

type ImageContextMenuState = {
  dateKey: string;
  clientX: number;
  clientY: number;
};

function EditableHtmlBlock({
  html,
  className,
  onCommit,
  onPackageTrigger,
  onEditorFocus,
  onEditorBlur,
  onPillClick
}: EditableHtmlBlockProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const latestHtmlRef = useRef(html);
  const isFocusedRef = useRef(false);

  useLayoutEffect(() => {
    latestHtmlRef.current = html;

    if (!isFocusedRef.current && editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
  }, [html]);

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      onFocus={(event) => {
        isFocusedRef.current = true;
        onEditorFocus?.(event.currentTarget);
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        const pill = target?.closest?.(".package-pill") as HTMLElement | null;
        if (pill && onPillClick) {
          event.preventDefault();
          const rect = pill.getBoundingClientRect();
          onPillClick(pill, { left: rect.left, top: rect.bottom + 6 });
        }
      }}
      onInput={(event) => {
        const editor = event.currentTarget;
        latestHtmlRef.current = editor.innerHTML;
        if (!onPackageTrigger) return;

        const text = editor.innerText ?? "";
        if (!text.includes(PACKAGE_TRIGGER)) return;

        const selection = window.getSelection();
        let anchor = { left: 0, top: 0 };
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0).cloneRange();
          range.collapse(true);
          const rect = range.getClientRects()[0];
          if (rect) {
            anchor = { left: rect.left, top: rect.bottom + 6 };
          } else {
            const editorRect = editor.getBoundingClientRect();
            anchor = { left: editorRect.left, top: editorRect.bottom + 6 };
          }
        } else {
          const editorRect = editor.getBoundingClientRect();
          anchor = { left: editorRect.left, top: editorRect.bottom + 6 };
        }
        onPackageTrigger(anchor);
      }}
      onBlur={(event) => {
        isFocusedRef.current = false;
        latestHtmlRef.current = event.currentTarget.innerHTML;
        onEditorBlur?.();
        void onCommit(latestHtmlRef.current);
      }}
      className={className}
    />
  );
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

type PackagePickerProps = {
  anchor: { left: number; top: number };
  onSelect: (option: PackageOption, label: string) => void;
  onCancel: () => void;
};

function PackagePickerPopover({ anchor, onSelect, onCancel }: PackagePickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PackageOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 200);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        onCancel();
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onCancel]);

  useEffect(() => {
    let active = true;
    const trimmed = debouncedQuery.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setError(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);

    fetch(`/api/master-calendar/packages?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: { results: PackageOption[] };
          error?: { message?: string };
        };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "Failed to search packages.");
        }
        if (!active) return;
        setResults(payload.data.results);
        setActiveIndex(0);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to search packages.");
        setResults([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - 332);
  const top = Math.min(Math.max(8, anchor.top), window.innerHeight - 360);

  function commitSelection(option: PackageOption) {
    onSelect(option, option.title);
  }

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-[320px] rounded-lg border border-border bg-card p-2 shadow-xl"
      style={{ left, top }}
    >
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          autoFocus
          type="text"
          placeholder="Search packages..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => Math.min(current + 1, Math.max(0, results.length - 1)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter") {
              const choice = results[activeIndex];
              if (choice) {
                event.preventDefault();
                commitSelection(choice);
              }
            }
          }}
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="mt-2 max-h-72 overflow-y-auto">
        {loading ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">Searching...</p>
        ) : error ? (
          <p className="px-2 py-2 text-xs text-amber-200">{error}</p>
        ) : results.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            {query.trim().length === 0 ? "Type to search packages." : "No matches."}
          </p>
        ) : (
          <ul className="space-y-1">
            {results.map((option, index) => (
              <li key={option.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commitSelection(option)}
                  className={cn(
                    "block w-full rounded-md px-2 py-1.5 text-left text-sm transition",
                    index === activeIndex
                      ? "bg-accent text-foreground"
                      : "text-foreground hover:bg-accent/60"
                  )}
                >
                  <div className="font-medium">{option.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {option.projectName}
                    {option.approvalStatus ? ` · ${option.approvalStatus}` : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type PillRenameProps = {
  anchor: { left: number; top: number };
  initialLabel: string;
  onSave: (label: string) => void;
  onRemove: () => void;
  onCancel: () => void;
};

function PillRenamePopover({ anchor, initialLabel, onSave, onRemove, onCancel }: PillRenameProps) {
  const [value, setValue] = useState(initialLabel);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        onCancel();
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onCancel]);

  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - 292);
  const top = Math.min(Math.max(8, anchor.top), window.innerHeight - 160);

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-[280px] rounded-lg border border-border bg-card p-2 shadow-xl"
      style={{ left, top }}
    >
      <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        Rename pill (file name stays the same)
      </p>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md px-2 py-1 text-xs text-amber-200 transition hover:bg-accent"
        >
          Remove pill
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-foreground transition hover:bg-accent"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MasterCalendarClient({ initialData }: { initialData: CalendarResponse }) {
  const initialEntries = useMemo(() => entriesRecord(initialData.entries), [initialData.entries]);
  const [monthCursor, setMonthCursor] = useState(() => monthCursorFromKey(initialData.month));
  const [entries, setEntries] = useState<Record<string, string>>(initialEntries);
  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>(initialData.schedule ?? []);
  const [canEdit, setCanEdit] = useState(initialData.canEdit);
  const [canViewCastCounts, setCanViewCastCounts] = useState(Boolean(initialData.canViewCastCounts));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [imageContextMenu, setImageContextMenu] = useState<ImageContextMenuState | null>(null);
  const [packagePicker, setPackagePicker] = useState<PackagePickerState | null>(null);
  const [pillRename, setPillRename] = useState<PillRenameState | null>(null);
  const [queuedPackages, setQueuedPackages] = useState<QueuedCalendarPackage[]>(
    initialData.queuedPackages ?? []
  );
  const [castMembers, setCastMembers] = useState<string[]>(initialData.members ?? []);
  const [showManagerPool, setShowManagerPool] = useState<string[]>(initialData.showManagerPool ?? []);
  const [showManagers, setShowManagers] = useState<Record<string, ShowManagerAssignment>>(
    initialData.showManagers ?? {}
  );
  const [castBusyDate, setCastBusyDate] = useState<string | null>(null);
  const [wipingAnchors, setWipingAnchors] = useState(false);
  const [castCountsOpen, setCastCountsOpen] = useState(false);
  const imageContextMenuRef = useRef<HTMLDivElement | null>(null);
  const autoSyncTimeoutRef = useRef<number | null>(null);
  const lastEditAtRef = useRef<number | null>(null);
  const dirtyMonthsRef = useRef<Set<string>>(new Set());
  const syncingRef = useRef(false);
  const canEditRef = useRef(false);
  const activeEditorRef = useRef<HTMLDivElement | null>(null);
  const activeCellMetaRef = useRef<{ dateKey: string; weekdayIndex: number } | null>(null);
  const knownAiredIdsRef = useRef<Record<string, Set<string>>>(
    Object.fromEntries(
      Object.entries(initialEntries).map(([dateKey, html]) => [dateKey, extractPackageIds(html)])
    )
  );
  const monthCacheRef = useRef<Map<string, CalendarResponse>>(
    new Map([[initialData.month, initialData]])
  );
  const loadGenerationRef = useRef(0);

  const monthKey = useMemo(() => toMonthKey(monthCursor), [monthCursor]);
  const weeks = useMemo(() => buildWeekRows(monthCursor), [monthCursor]);

  useEffect(() => {
    syncingRef.current = syncing;
  }, [syncing]);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!imageContextMenuRef.current) {
        return;
      }
      if (!imageContextMenuRef.current.contains(event.target as Node)) {
        setImageContextMenu(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setImageContextMenu(null);
      }
    }

    if (!imageContextMenu) {
      return;
    }

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [imageContextMenu]);

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

    const cached = monthCacheRef.current.get(nextMonthKey);
    if (cached) {
      applyMonthData(cached);
      setMonthCursor(nextCursor);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/master-calendar?month=${nextMonthKey}`, { cache: "no-store" });
      const payload = (await response.json()) as { data?: CalendarResponse; error?: { message?: string } };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to load master calendar.");
      }
      if (loadGenerationRef.current !== generation) {
        return;
      }

      applyMonthData(payload.data);
      setMonthCursor(nextCursor);
    } catch (error) {
      if (loadGenerationRef.current !== generation) {
        return;
      }
      setMessage(error instanceof Error ? error.message : "Failed to load master calendar.");
    } finally {
      if (loadGenerationRef.current === generation) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    setImageContextMenu(null);
    setPackagePicker(null);
    setPillRename(null);
  }, [monthKey]);

  useEffect(() => {
    const cached = monthCacheRef.current.get(monthKey);
    if (!cached) {
      return;
    }
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
  }, [
    monthKey,
    canEdit,
    canViewCastCounts,
    entries,
    scheduleDays,
    queuedPackages,
    castMembers,
    showManagerPool,
    showManagers
  ]);

  useEffect(() => {
    return () => {
      if (autoSyncTimeoutRef.current) {
        clearTimeout(autoSyncTimeoutRef.current);
      }
    };
  }, []);

  function shiftMonth(offset: number) {
    const next = clampToCalendarStart(
      new Date(monthCursor.getFullYear(), monthCursor.getMonth() + offset, 1)
    );
    const nextKey = toMonthKey(next);
    if (nextKey === monthKey) {
      return;
    }
    void loadMonth(nextKey, next);
  }

  function resetToCurrentMonth() {
    const next = clampToCalendarStart(new Date());
    const nextKey = toMonthKey(next);
    if (nextKey === monthKey) {
      return;
    }
    void loadMonth(nextKey, next);
  }

  const atCalendarStart =
    monthCursor.getFullYear() === CALENDAR_START.year && monthCursor.getMonth() === CALENDAR_START.month;

  async function syncToGoogleDoc(targetMonthKey: string, options?: { auto?: boolean }) {
    setSyncing(true);
    if (!options?.auto) {
      setSyncMessage(null);
    }
    try {
      const res = await fetch("/api/master-calendar/sync-doc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ month: targetMonthKey })
      });
      const payload = (await res.json()) as {
        data?: { synced: boolean; entryCount: number };
        error?: { message?: string };
      };
      if (!res.ok || !payload.data) throw new Error(payload.error?.message ?? "Failed to sync.");

      dirtyMonthsRef.current.delete(targetMonthKey);
      if (!options?.auto) {
        setSyncMessage({ text: `Synced to Google Doc (${payload.data.entryCount} entries).`, isError: false });
        setTimeout(() => setSyncMessage(null), 6000);
      }
      return true;
    } catch (error) {
      setSyncMessage({ text: error instanceof Error ? error.message : "Failed to sync.", isError: true });
      return false;
    } finally {
      setSyncing(false);
    }
  }

  async function runAutoSyncCheck() {
    autoSyncTimeoutRef.current = null;

    const lastEditAt = lastEditAtRef.current;
    if (!lastEditAt) {
      return;
    }

    if (Date.now() - lastEditAt < AUTO_SYNC_IDLE_MS) {
      autoSyncTimeoutRef.current = window.setTimeout(() => {
        void runAutoSyncCheck();
      }, AUTO_SYNC_IDLE_MS);
      return;
    }

    if (syncingRef.current || !canEditRef.current) {
      autoSyncTimeoutRef.current = window.setTimeout(() => {
        void runAutoSyncCheck();
      }, AUTO_SYNC_IDLE_MS);
      return;
    }

    const monthsToSync = Array.from(dirtyMonthsRef.current);
    if (monthsToSync.length === 0) {
      return;
    }

    for (const dirtyMonth of monthsToSync) {
      const success = await syncToGoogleDoc(dirtyMonth, { auto: true });
      if (!success) {
        break;
      }
    }

    if (dirtyMonthsRef.current.size > 0) {
      autoSyncTimeoutRef.current = window.setTimeout(() => {
        void runAutoSyncCheck();
      }, AUTO_SYNC_IDLE_MS);
    }
  }

  function scheduleAutoSyncCheck() {
    if (autoSyncTimeoutRef.current) {
      clearTimeout(autoSyncTimeoutRef.current);
    }
    autoSyncTimeoutRef.current = window.setTimeout(() => {
      void runAutoSyncCheck();
    }, AUTO_SYNC_IDLE_MS);
  }

  async function syncAiredStateForPills(dateKey: string, savedHtml: string) {
    const currentIds = extractPackageIds(savedHtml);
    const previousIds = knownAiredIdsRef.current[dateKey] ?? new Set<string>();
    const addedIds: string[] = [];
    const removedIds: string[] = [];
    currentIds.forEach((id) => {
      if (!previousIds.has(id)) addedIds.push(id);
    });
    previousIds.forEach((id) => {
      if (!currentIds.has(id)) removedIds.push(id);
    });

    knownAiredIdsRef.current[dateKey] = currentIds;

    if (addedIds.length === 0 && removedIds.length === 0) {
      return;
    }

    await Promise.all([
      ...addedIds.map(async (mediaItemId) => {
        try {
          const response = await fetch("/api/master-calendar/mark-aired", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mediaItemId, date: dateKey })
          });
          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as {
              error?: { message?: string };
            };
            throw new Error(payload.error?.message ?? "Failed to mark aired.");
          }
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Failed to mark aired.");
        }
      }),
      ...removedIds.map(async (mediaItemId) => {
        try {
          const response = await fetch("/api/master-calendar/unmark-aired", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mediaItemId })
          });
          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as {
              error?: { message?: string };
            };
            throw new Error(payload.error?.message ?? "Failed to revert aired.");
          }
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Failed to revert aired.");
        }
      })
    ]);
  }

  async function persistCell(dateKey: string, rawHtml: string) {
    const existingContent = entries[dateKey] ?? "";
    const schedule = scheduleFromDays(scheduleDays, dateKey);
    const merged = restoreAssignedNamesInCalendarHtml(rawHtml, existingContent, schedule.kind);
    const normalized = normalizeEditorHtml(merged);
    const defaultTemplate = normalizeEditorHtml(defaultTemplateForKind(schedule.kind, schedule.label));
    let nextContent = isRichTextEmpty(normalized) ? "" : normalized;

    if (!existingContent && nextContent === defaultTemplate) {
      nextContent = "";
    }

    if (nextContent === existingContent) {
      return;
    }

    try {
      const response = await fetch("/api/master-calendar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          date: dateKey,
          content: nextContent
        })
      });
      const payload = (await response.json()) as {
        data?: { date: string; content?: string; deleted?: boolean };
        error?: { message?: string };
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to save cell.");
      }

      const savedCell = payload.data;
      const savedContent = savedCell.deleted ? "" : savedCell.content ?? nextContent;
      setEntries((current) => {
        if (savedCell.deleted) {
          if (!(dateKey in current)) {
            return current;
          }
          const next = { ...current };
          delete next[dateKey];
          return next;
        }

        const currentValue = current[dateKey] ?? "";
        if (currentValue === savedContent) {
          return current;
        }
        const next = { ...current };
        next[dateKey] = savedContent;
        return next;
      });

      dirtyMonthsRef.current.add(monthKey);
      lastEditAtRef.current = Date.now();
      scheduleAutoSyncCheck();

      await syncAiredStateForPills(dateKey, savedContent);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save cell.");
    }
  }

  async function handleImageToggle(dateKey: string) {
    const rawStoredContent = entries[dateKey] ?? "";
    const imageHidden = hasImageHidden(rawStoredContent);
    const storedContent = stripImageToken(rawStoredContent);
    const nextContent = imageHidden ? storedContent : withImageHidden(storedContent);

    await persistCell(dateKey, nextContent);
  }

  const handleEditorFocus = useCallback(
    (dateKey: string, weekdayIndex: number) => (element: HTMLDivElement) => {
      activeEditorRef.current = element;
      activeCellMetaRef.current = { dateKey, weekdayIndex };
    },
    []
  );

  const handlePackageTrigger = useCallback(
    (dateKey: string, weekdayIndex: number) => (anchor: { left: number; top: number }) => {
      setPackagePicker({ dateKey, weekdayIndex, anchor });
    },
    []
  );

  const handlePillClick = useCallback(
    (dateKey: string, weekdayIndex: number) =>
      (pillElement: HTMLElement, anchor: { left: number; top: number }) => {
        const packageId = pillElement.getAttribute("data-package-id") ?? "";
        if (!packageId) return;
        const currentLabel = pillElement.getAttribute("data-display-label") ?? pillElement.textContent ?? "";
        setPillRename({ dateKey, weekdayIndex, packageId, currentLabel, anchor });
      },
    []
  );

  function applyPackagePillSelection(option: PackageOption, label: string) {
    const meta = activeCellMetaRef.current;
    const editor = activeEditorRef.current;
    if (!meta || !editor) {
      setPackagePicker(null);
      return;
    }
    const pillHtml = buildPillHtml(option.id, label);
    const currentHtml = editor.innerHTML;
    if (!currentHtml.includes(PACKAGE_TRIGGER)) {
      setPackagePicker(null);
      return;
    }
    editor.innerHTML = currentHtml.replace(PACKAGE_TRIGGER, pillHtml);
    setPackagePicker(null);
    void persistCell(meta.dateKey, editor.innerHTML);
  }

  function applyPillRename(label: string) {
    const state = pillRename;
    if (!state) return;
    const html = entries[state.dateKey] ?? "";
    const pattern = new RegExp(
      `(<span class="package-pill"[^>]*data-package-id="${state.packageId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}"[^>]*data-display-label=")[^"]*("[^>]*>)[^<]*(</span>)`,
      "g"
    );
    const safe = escapeHtmlAttr(label);
    const nextHtml = html.replace(pattern, (_match, p1: string, p2: string, p3: string) => {
      return `${p1}${safe}${p2}${safe}${p3}`;
    });
    setPillRename(null);
    if (nextHtml !== html) {
      void persistCell(state.dateKey, nextHtml);
    }
  }

  async function saveShowAnchors(dateKey: string, names: string[], source: "manual" | "random") {
    setCastBusyDate(dateKey);
    try {
      const response = await fetch("/api/show-roles/anchors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateKey, names, source })
      });
      const payload = (await response.json()) as {
        data?: { content?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to save anchors.");
      }
      if (payload.data?.content) {
        setEntries((current) => ({ ...current, [dateKey]: payload.data?.content ?? "" }));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save anchors.");
    } finally {
      setCastBusyDate(null);
    }
  }

  async function randomizeShowAnchors(dateKey: string) {
    setCastBusyDate(dateKey);
    try {
      const response = await fetch(`/api/show-roles/anchors?date=${encodeURIComponent(dateKey)}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as {
        data?: { suggested?: string[] };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to suggest anchors.");
      }
      const suggested = payload.data?.suggested ?? [];
      if (suggested.length === 0) {
        throw new Error("No eligible anchors left this month.");
      }
      await saveShowAnchors(dateKey, suggested, "random");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to suggest anchors.");
      setCastBusyDate(null);
    }
  }

  async function saveShowManager(dateKey: string, name: string) {
    setCastBusyDate(dateKey);
    try {
      const response = await fetch("/api/show-roles/show-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateKey, name })
      });
      const payload = (await response.json()) as {
        data?: { content?: string; name?: string; source?: "rotation" | "manual"; pool?: string[] };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to save show manager.");
      }
      if (payload.data?.content) {
        setEntries((current) => ({ ...current, [dateKey]: payload.data?.content ?? "" }));
      }
      if (payload.data?.pool) {
        setShowManagerPool(payload.data.pool);
      }
      setShowManagers((current) => ({
        ...current,
        [dateKey]: {
          name: payload.data?.name ?? name,
          source: payload.data?.source ?? (name ? "manual" : "rotation")
        }
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save show manager.");
    } finally {
      setCastBusyDate(null);
    }
  }

  async function savePaAnnouncers(dateKey: string, names: string[]) {
    setCastBusyDate(dateKey);
    try {
      const response = await fetch("/api/show-roles/pa-announcers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateKey, names })
      });
      const payload = (await response.json()) as {
        data?: { content?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to save PA announcers.");
      }
      if (payload.data?.content) {
        setEntries((current) => ({ ...current, [dateKey]: payload.data?.content ?? "" }));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save PA announcers.");
    } finally {
      setCastBusyDate(null);
    }
  }

  async function wipeMonthAnchors() {
    const monthLabel = formatMonthTitle(monthCursor);
    const confirmed = window.confirm(
      `Wipe all volunteer and random anchors for ${monthLabel}? PA announcers stay. You can re-assign after.`
    );
    if (!confirmed) {
      return;
    }

    setWipingAnchors(true);
    setMessage(null);
    setSyncMessage(null);
    try {
      const response = await fetch("/api/show-roles/anchors/wipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthKey })
      });
      const payload = (await response.json()) as {
        data?: { entries?: Array<{ date: string; content: string }> };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to wipe anchors.");
      }
      const cleared = payload.data?.entries ?? [];
      if (cleared.length > 0) {
        setEntries((current) => {
          const next = { ...current };
          for (const entry of cleared) {
            next[entry.date] = entry.content;
          }
          return next;
        });
      }
      setSyncMessage({ text: `Cleared ${monthLabel} anchors.`, isError: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to wipe anchors.");
    } finally {
      setWipingAnchors(false);
    }
  }

  async function randomizePaAnnouncers(dateKey: string) {
    setCastBusyDate(dateKey);
    try {
      const response = await fetch(`/api/show-roles/pa-announcers?date=${encodeURIComponent(dateKey)}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as {
        data?: { suggested?: string[] };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to suggest PA announcers.");
      }
      const suggested = payload.data?.suggested ?? [];
      if (suggested.length === 0) {
        throw new Error("No eligible PA announcers left this month.");
      }
      await savePaAnnouncers(dateKey, suggested);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to suggest PA announcers.");
      setCastBusyDate(null);
    }
  }

  function removePill() {
    const state = pillRename;
    if (!state) return;
    const html = entries[state.dateKey] ?? "";
    const pattern = new RegExp(
      `<span class="package-pill"[^>]*data-package-id="${state.packageId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}"[^>]*></span>|<span class="package-pill"[^>]*data-package-id="${state.packageId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}"[^>]*>[^<]*</span>`,
      "g"
    );
    const nextHtml = html.replace(pattern, "");
    setPillRename(null);
    if (nextHtml !== html) {
      void persistCell(state.dateKey, nextHtml);
    }
  }

  return (
    <div className="route-enter mx-auto w-full max-w-7xl space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="eyebrow flex items-center gap-2">
                <CalendarDays className="h-3 w-3" />
                Production · Run-of-Show
              </div>
              <h1 className="display-md mt-2 text-foreground">Master Calendar</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Monday PA · Tue/Thu royalty-free images · Wed/Fri shows. Holidays stay off.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-border bg-secondary/60 p-1">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  disabled={atCalendarStart || loading}
                  aria-label="Previous month"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[110px] px-2 text-center text-sm font-semibold text-foreground tabular-nums">
                  {formatMonthTitle(monthCursor)}
                </span>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  disabled={loading}
                  aria-label="Next month"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={resetToCurrentMonth}
                disabled={loading}
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
              >
                Today
              </button>
              {canViewCastCounts ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setCastCountsOpen(true)}
                  className={BUTTON_SECONDARY}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Anchors & PA
                </Button>
              ) : null}
              {canEdit ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void wipeMonthAnchors()}
                    disabled={wipingAnchors || syncing}
                  >
                    <Eraser className="mr-2 h-4 w-4" />
                    {wipingAnchors ? "Wiping..." : "Wipe anchors"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void syncToGoogleDoc(monthKey)}
                    disabled={syncing || wipingAnchors}
                    className={BUTTON_SECONDARY}
                  >
                    <FileUp className="mr-2 h-4 w-4" />
                    {syncing ? "Syncing..." : "Sync to Doc"}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {canEdit ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Tip: type <code className="rounded bg-secondary/60 px-1">[package]</code> to insert a package pill; click a pill to rename it.
          </p>
        ) : null}

        {message ? (
          <p className="mt-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">{message}</p>
        ) : null}

        {syncMessage ? (
          <p
            className={cn(
              "mt-3 rounded-lg border px-3 py-2 text-sm",
              syncMessage.isError
                ? "border-amber-300/40 bg-amber-300/10 text-amber-100"
                : "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
            )}
          >
            {syncMessage.text}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-3 md:p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] table-fixed border-collapse overflow-hidden rounded-xl border border-border">
            <thead>
              <tr>
                {WEEKDAYS.map((label, index) => (
                  <th
                    key={label}
                    className={cn(
                      "border border-border px-2 py-2 text-center text-sm font-bold uppercase tracking-[0.08em] md:text-base",
                      HEADER_SURFACES[index]
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, weekIndex) => (
                <tr key={`${monthKey}-week-${weekIndex}`}>
                  {week.map((date, weekdayIndex) => {
                    if (!date) {
                      return <td key={`${monthKey}-blank-${weekIndex}-${weekdayIndex}`} className="border border-border bg-muted/30" />;
                    }

                    const dateKey = toDateKey(date);
                    const schedule = scheduleFromDays(scheduleDays, dateKey);
                    const rawStoredContent = entries[dateKey] ?? "";
                    const isImageDay = isScenicImageDay(schedule.kind);
                    const isHoliday = schedule.kind === "HOLIDAY";
                    const imageHidden = isImageDay && hasImageHidden(rawStoredContent);
                    const storedContent = stripImageToken(rawStoredContent);
                    const templateContent = defaultTemplateForKind(schedule.kind, schedule.label);
                    const displayContent = storedContent || templateContent;
                    const editorHtml = omitAssignedNamesFromCalendarHtml(displayContent, schedule.kind);

                    return (
                      <td
                        key={dateKey}
                        className={cn(
                          "align-top border border-border p-2 text-foreground md:p-3",
                          schedule.kind === "SHOW" || schedule.kind === "PA"
                            ? "flex h-full min-h-[16rem] flex-col"
                            : "",
                          isHoliday ? "bg-muted/40" : COLUMN_SURFACES[weekdayIndex]
                        )}
                        onContextMenu={(event) => {
                          if (!canEdit || !isImageDay) {
                            return;
                          }
                          event.preventDefault();
                          setImageContextMenu({
                            dateKey,
                            clientX: event.clientX,
                            clientY: event.clientY
                          });
                        }}
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          {(() => {
                            const today = new Date();
                            const isToday =
                              today.toDateString() === date.toDateString();
                            return (
                              <span
                                className={cn(
                                  "inline-flex items-center justify-center rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.16em]",
                                  isToday
                                    ? "bg-[var(--brand-green)] text-black"
                                    : "bg-[var(--ink-3)] text-muted-foreground"
                                )}
                              >
                                {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            );
                          })()}
                          {isHoliday && schedule.label ? (
                            <span className="inline-flex max-w-[9rem] items-center rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-100">
                              Holiday
                            </span>
                          ) : null}
                        </div>

                        {schedule.kind === "SHOW" ? (
                          <ShowDayControls
                            dateKey={dateKey}
                            anchors={extractCalendarAnchors(displayContent)}
                            members={castMembers}
                            manager={showManagers[dateKey]?.name ?? ""}
                            managerPool={showManagerPool}
                            managerSource={showManagers[dateKey]?.source ?? "rotation"}
                            packages={queuedPackages.filter((row) => row.date === dateKey)}
                            canEdit={canEdit}
                            busy={wipingAnchors || castBusyDate === dateKey}
                            onChange={(names, source) => void saveShowAnchors(dateKey, names, source)}
                            onRandomize={() => void randomizeShowAnchors(dateKey)}
                            onManagerChange={(name) => void saveShowManager(dateKey, name)}
                            onManagerReset={() => void saveShowManager(dateKey, "")}
                          />
                        ) : null}
                        {schedule.kind === "PA" ? (
                          <PaDayControls
                            dateKey={dateKey}
                            names={extractCalendarPaAnnouncers(displayContent)}
                            members={castMembers}
                            canEdit={canEdit}
                            busy={castBusyDate === dateKey}
                            onChange={(names) => void savePaAnnouncers(dateKey, names)}
                            onRandomize={() => void randomizePaAnnouncers(dateKey)}
                          />
                        ) : null}

                        {isImageDay ? (
                          <div className="space-y-2">
                            {!imageHidden ? (
                              <img
                                src={scenicImageForDate(dateKey)}
                                alt="Royalty-free scenic view"
                                className="h-24 w-full rounded-md border border-white/15 object-cover md:h-28"
                                loading="lazy"
                              />
                            ) : null}
                            {canEdit ? (
                              <EditableHtmlBlock
                                onCommit={(html) =>
                                  persistCell(dateKey, imageHidden ? withImageHidden(html) : html)
                                }
                                onPackageTrigger={handlePackageTrigger(dateKey, weekdayIndex)}
                                onEditorFocus={handleEditorFocus(dateKey, weekdayIndex)}
                                onPillClick={handlePillClick(dateKey, weekdayIndex)}
                                className={cn("min-h-12", CALENDAR_EDITABLE_STYLES)}
                                html={storedContent}
                              />
                            ) : storedContent ? (
                              <div
                                className={CALENDAR_TEXT_STYLES}
                                dangerouslySetInnerHTML={{ __html: storedContent }}
                              />
                            ) : null}
                          </div>
                        ) : schedule.kind === "SHOW" || schedule.kind === "PA" ? null : canEdit && !isRichTextEmpty(editorHtml) ? (
                          <EditableHtmlBlock
                            onCommit={(html) => persistCell(dateKey, html)}
                            onPackageTrigger={handlePackageTrigger(dateKey, weekdayIndex)}
                            onEditorFocus={handleEditorFocus(dateKey, weekdayIndex)}
                            onPillClick={handlePillClick(dateKey, weekdayIndex)}
                            className={cn("min-h-[88px]", CALENDAR_EDITABLE_STYLES)}
                            html={editorHtml}
                          />
                        ) : !canEdit && !isRichTextEmpty(editorHtml) ? (
                          <div
                            className={CALENDAR_TEXT_STYLES}
                            dangerouslySetInnerHTML={{ __html: editorHtml }}
                          />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading next month...</p> : null}
      </section>

      {canEdit && imageContextMenu ? (
        <div
          ref={imageContextMenuRef}
          className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-card p-1 shadow-lg"
          style={{
            left: Math.max(8, imageContextMenu.clientX),
            top: Math.max(8, imageContextMenu.clientY)
          }}
        >
          <button
            type="button"
            onClick={() => {
              void handleImageToggle(imageContextMenu.dateKey);
              setImageContextMenu(null);
            }}
            className="w-full rounded-md px-3 py-1.5 text-left text-sm text-foreground transition hover:bg-accent"
          >
            {hasImageHidden(entries[imageContextMenu.dateKey] ?? "") ? "Restore Image" : "Delete Image"}
          </button>
        </div>
      ) : null}

      {canEdit && packagePicker ? (
        <PackagePickerPopover
          anchor={packagePicker.anchor}
          onCancel={() => setPackagePicker(null)}
          onSelect={(option, label) => applyPackagePillSelection(option, label)}
        />
      ) : null}

      {canEdit && pillRename ? (
        <PillRenamePopover
          anchor={pillRename.anchor}
          initialLabel={pillRename.currentLabel}
          onSave={(label) => applyPillRename(label)}
          onRemove={() => removePill()}
          onCancel={() => setPillRename(null)}
        />
      ) : null}

      {canViewCastCounts ? (
        <CastCountsDialog open={castCountsOpen} onOpenChange={setCastCountsOpen} />
      ) : null}
    </div>
  );
}
