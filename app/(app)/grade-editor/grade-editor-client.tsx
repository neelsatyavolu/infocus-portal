"use client";

import type { GradeScoreState } from "@prisma/client";
import { parseGradeScore, gradeScoreInput, numericGradeScore } from "@/src/lib/grade-score";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock,
  Download,
  RefreshCcw,
  Save,
  Search,
  UserMinus,
  UserRound,
  Users,
  X
} from "lucide-react";

const Clock3 = Clock;
const Users2 = Users;
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  buildCycleGradesCsv,
  buildTotalGradesCsv,
  defaultTotalsAdjustments,
  type TotalsAdjustments
} from "@/src/lib/grade-editor-csv";
import { CHECK_IN_STAGES, type CheckInScores, type CheckInStage } from "@/src/lib/package-stages";
import { cn } from "@/src/lib/utils";
import { REQUIRED_LIVESTREAM_HOURS } from "@/src/lib/livestream";
import { StudentGradebookPanel } from "./student-gradebook-panel";
import { useExcludedPeople } from "./use-excluded-people";

type CycleTab = {
  cycleNumber: number;
  focus: string;
  finalCutDate: string | null;
};

type CycleAverage = {
  cycleNumber: number;
  averageTotal: number | null;
  averagePercentage: number | null;
  publishedCount: number;
};

const CHECK_IN_LABELS = { pitching: "Pitching", proofOfContact: "PoC", aRollBRoll: "A-roll/B-roll", initialCut: "Initial Cut" } as const;

type GradeRow = {
  finalCutState: GradeScoreState | null;
  checkInScores: CheckInScores;
  checkInOverrides: CheckInScores;
  userId: string;
  name: string | null;
  email: string | null;
  effortPoints: number | null;
  teamworkPoints: number | null;
  previousEffortPoints: number | null;
  previousTeamworkPoints: number | null;
  totalPoints: number | null;
  percentage: number | null;
  revised: boolean;
  revisedAt: string | null;
  feedback: string;
  turnedInDate: string | null;
  freeExtensionDays: number;
  extensionDetails: {
    calculatedDays: number;
    freeDays: number;
    chargedDays: number;
    exempt: boolean;
  };
  published: boolean;
  publishedAt: string | null;
  publicationHistory: Array<{
    eventType: "PUBLISHED" | "REVISED";
    occurredAt: string | null;
  }>;
  extensionsRemaining: number;
};

type AdminGradesPayload = {
  activeCycleNumber: number;
  cycles: CycleTab[];
  cycleAverages: CycleAverage[];
  activeCycleAverage: CycleAverage | null;
  rows: GradeRow[];
};

type TotalsCycleEntry = {
  finalCutState: GradeScoreState | null;
  cycleNumber: number;
  totalPoints: number | null;
};

type TotalsRow = {
  participationEarned: number;
  participationPossible: number;
  userId: string;
  name: string | null;
  email: string | null;
  notes: string;
  cycleTotals: TotalsCycleEntry[];
  checkInPoints: number | null;
  checkInPossible: number | null;
  livestreamPoints: number | null;
  livestreamHours: number;
  portfolioPoints: number | null;
};

type TotalsPayload = {
  cycles: CycleTab[];
  checkInPossible: number;
  totalsRows: TotalsRow[];
};

type MissingStatus = "not_entered" | "unpublished";

type MissingEntry = {
  cycleNumber: number;
  status: MissingStatus;
};

type MissingPerson = {
  userId: string;
  name: string | null;
  email: string | null;
  missing: MissingEntry[];
};

type MissingPayload = {
  cycles: { cycleNumber: number; focus: string }[];
  consideredCycleNumbers: number[];
  people: { userId: string; name: string | null; email: string | null }[];
  missingReport: MissingPerson[];
};

const TOTAL_VIEW = "total" as const;
const STUDENT_VIEW = "student" as const;
const MAX_PACKAGE_PER_CYCLE = 50;
const MAX_CHECK_INS_PER_CYCLE = 20;
const MAX_LIVESTREAM = 40;
const MAX_FINAL = 100;

function parseOverride(value: string | undefined, maxValue: number): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(maxValue, Math.round(parsed)));
}

function adjustmentsFromTotalsRow(row: TotalsRow): TotalsAdjustments {
  return {
    ...defaultTotalsAdjustments(),
    checkIns: row.checkInPoints ?? null,
    livestream: row.livestreamPoints ?? null,
    final: row.portfolioPoints ?? null,
    notes: row.notes
  };
}

function clampNonNegative(input: string) {
  if (!input.trim()) return 0;
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function letterGrade(percentage: number) {
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B";
  if (percentage >= 70) return "C";
  if (percentage >= 60) return "D";
  return "F";
}

async function fetchTotals() {
  const response = await fetch(`/api/grades/admin?view=totals`, { cache: "no-store" });
  const payload = (await response.json()) as { data?: TotalsPayload; error?: { message?: string } };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load totals.");
  }
  return payload.data;
}

type GradeMutationPayload = Pick<
  GradeRow,
  | "finalCutState"
  | "effortPoints"
  | "teamworkPoints"
  | "previousEffortPoints"
  | "previousTeamworkPoints"
  | "totalPoints"
  | "percentage"
  | "revised"
  | "revisedAt"
  | "feedback"
  | "turnedInDate"
  | "freeExtensionDays"
  | "extensionDetails"
  | "published"
  | "publishedAt"
  | "extensionsRemaining"
>;

async function fetchGrades(cycleNumber: number) {
  const response = await fetch(`/api/grades/admin?cycle=${cycleNumber}`, { cache: "no-store" });
  const payload = (await response.json()) as { data?: AdminGradesPayload; error?: { message?: string } };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load grades.");
  }

  return payload.data;
}

async function fetchMissing() {
  const response = await fetch(`/api/grades/admin?view=missing`, { cache: "no-store" });
  const payload = (await response.json()) as { data?: MissingPayload; error?: { message?: string } };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load missing grades.");
  }
  return payload.data;
}

function scoreTotal(row: Pick<GradeRow, "effortPoints" | "teamworkPoints">) {
  return row.effortPoints ?? 0;
}

function scorePercent(row: Pick<GradeRow, "effortPoints" | "teamworkPoints">) {
  return Number(((scoreTotal(row) / MAX_PACKAGE_PER_CYCLE) * 100).toFixed(1));
}

function rowLabel(row: GradeRow) {
  return row.name?.trim() || "Unnamed user";
}

function isRowFilledIn(row: Pick<GradeRow, "effortPoints" | "teamworkPoints">) {
  return row.effortPoints !== null;
}

function rowHasUnsavedChanges(row: GradeRow, baseline?: GradeRow) {
  if (!baseline) return true;

  return (
    row.finalCutState !== baseline.finalCutState ||
    (row.effortPoints ?? null) !== (baseline.effortPoints ?? null) ||
    (row.teamworkPoints ?? null) !== (baseline.teamworkPoints ?? null) ||
    row.feedback !== baseline.feedback ||
    (row.turnedInDate ?? null) !== (baseline.turnedInDate ?? null)
  );
}

function getDaySuffix(day: number) {
  if (day >= 11 && day <= 13) return "th";
  const lastDigit = day % 10;
  if (lastDigit === 1) return "st";
  if (lastDigit === 2) return "nd";
  if (lastDigit === 3) return "rd";
  return "th";
}

function formatLongDate(value: string | null) {
  if (!value) {
    return "Not set yet";
  }

  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return value;
  }

  const [year, month, day] = parts;
  const monthName = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC"
  });
  return `${monthName} ${day}${getDaySuffix(day)}, ${year}`;
}

function extensionExceptionSummary(row: Pick<GradeRow, "extensionDetails">) {
  if (row.extensionDetails.freeDays <= 0) {
    return null;
  }

  return `${row.extensionDetails.calculatedDays} late day${row.extensionDetails.calculatedDays === 1 ? "" : "s"}, ${row.extensionDetails.freeDays} free, ${row.extensionDetails.chargedDays} charged`;
}

function formatHistoryTimestamp(value: string | null) {
  if (!value) {
    return "Unknown time";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function historyEventLabel(eventType: "PUBLISHED" | "REVISED") {
  return eventType === "PUBLISHED" ? "Published" : "Revised";
}

function applyMutationToRow(row: GradeRow, payload: GradeMutationPayload) {
  return {
    ...row,
    ...payload
  };
}

export default function GradeEditorClient() {
  const [cycles, setCycles] = useState<CycleTab[]>([]);
  const [activeCycleNumber, setActiveCycleNumber] = useState(1);
  const [rows, setRows] = useState<GradeRow[]>([]);
  const [savedRows, setSavedRows] = useState<GradeRow[]>([]);
  const [cycleAverages, setCycleAverages] = useState<CycleAverage[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [publishingUserId, setPublishingUserId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [publishingAll, setPublishingAll] = useState(false);
  const [feedbackModalUserId, setFeedbackModalUserId] = useState<string | null>(null);
  const [extensionNoteUserId, setExtensionNoteUserId] = useState<string | null>(null);
  const [publicationHistoryUserId, setPublicationHistoryUserId] = useState<string | null>(null);
  const [extensionDepletedWarning, setExtensionDepletedWarning] = useState<{ userName: string; remaining: number } | null>(null);
  const autosaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingAutosaveUserIdsRef = useRef<Set<string>>(new Set());
  const autosaveRunningRef = useRef(false);
  const rowsRef = useRef<GradeRow[]>([]);
  const savedRowMapRef = useRef<Map<string, GradeRow>>(new Map());
  const activeCycleNumberRef = useRef(1);
  const autosaveBlockedRef = useRef({ savingAll: false, publishingAll: false, publishingUserId: null as string | null });
  const loadCycleRef = useRef<(cycleNumber: number, options?: { silent?: boolean }) => Promise<void>>(async () => {});
  const flushAutosavesRef = useRef<() => Promise<void>>(async () => {});
  const loadCycleSequenceRef = useRef(0);
  const [sortBy, setSortBy] = useState<"firstName" | "lastName">("firstName");
  const [viewMode, setViewMode] = useState<"cycle" | typeof TOTAL_VIEW | typeof STUDENT_VIEW>(TOTAL_VIEW);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentRefreshToken, setStudentRefreshToken] = useState(0);
  const [totalsRows, setTotalsRows] = useState<TotalsRow[]>([]);
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  const checkInSaveRef = useRef(false);
  const staleCheckInTotalsRef = useRef(new Set<string>());
  const [checkInPossible, setCheckInPossible] = useState(0);
  const [totalsLoading, setTotalsLoading] = useState(false);
  const [totalsAdjustments, setTotalsAdjustments] = useState<Map<string, TotalsAdjustments>>(new Map());
  const [totalsNotesUserId, setTotalsNotesUserId] = useState<string | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingData, setMissingData] = useState<MissingPayload | null>(null);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingError, setMissingError] = useState<string | null>(null);
  const [showExcludePanel, setShowExcludePanel] = useState(false);
  const { excludedIds, toggleExcluded, isExcluded } = useExcludedPeople();

  const visibleMissing = useMemo(
    () =>
      missingData
        ? missingData.missingReport.filter((person) => !excludedIds.includes(person.userId))
        : [],
    [missingData, excludedIds]
  );

  async function loadTotals(options?: { silent?: boolean }) {
    try {
      if (!options?.silent) setTotalsLoading(true);
      setMessage(null);
      const data = await fetchTotals();
      setCycles(data.cycles);
      setCheckInPossible(data.checkInPossible ?? 0);
      setTotalsRows(data.totalsRows);
      const staleCheckIns = new Set(staleCheckInTotalsRef.current);
      staleCheckInTotalsRef.current.clear();
      setTotalsAdjustments((current) => {
        const next = new Map(current);
        for (const row of data.totalsRows) {
          const existing = next.get(row.userId);
          next.set(
            row.userId,
            existing ? {
              ...existing,
              notes: row.notes,
              ...(staleCheckIns.has(row.userId) ? { checkIns: row.checkInPoints } : {})
            } : adjustmentsFromTotalsRow(row)
          );
        }
        return next;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load totals.");
    } finally {
      if (!options?.silent) setTotalsLoading(false);
    }
  }

  async function openMissing() {
    setMissingOpen(true);
    setShowExcludePanel(false);
    setMissingLoading(true);
    setMissingError(null);
    try {
      const data = await fetchMissing();
      setMissingData(data);
    } catch (error) {
      setMissingError(error instanceof Error ? error.message : "Failed to load missing grades.");
    } finally {
      setMissingLoading(false);
    }
  }

  function getAdjustments(userId: string): TotalsAdjustments {
    return totalsAdjustments.get(userId) ?? defaultTotalsAdjustments();
  }

  function updateAdjustment(userId: string, patch: Partial<TotalsAdjustments>) {
    setTotalsAdjustments((current) => {
      const next = new Map(current);
      const existing = next.get(userId) ?? defaultTotalsAdjustments();
      next.set(userId, { ...existing, ...patch });
      return next;
    });
  }

  const notesSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function scheduleNotesSave(userId: string, notes: string) {
    const existing = notesSaveTimersRef.current.get(userId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      notesSaveTimersRef.current.delete(userId);
      try {
        const response = await fetch(`/api/grades/admin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "setTotalNotes", userId, notes })
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(payload.error?.message ?? "Failed to save notes.");
        }
        setTotalsRows((rows) =>
          rows.map((row) => (row.userId === userId ? { ...row, notes } : row))
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Failed to save notes.");
      }
    }, 600);
    notesSaveTimersRef.current.set(userId, timer);
  }

  function updateNotes(userId: string, notes: string) {
    updateAdjustment(userId, { notes });
    scheduleNotesSave(userId, notes);
  }

  async function loadCycle(cycleNumber: number, options?: { silent?: boolean }) {
    const sequence = ++loadCycleSequenceRef.current;
    try {
      clearAllAutosaves();
      if (!options?.silent) {
        setLoading(true);
      }
      setMessage(null);
      const data = await fetchGrades(cycleNumber);
      if (loadCycleSequenceRef.current !== sequence) return;
      setCycles(data.cycles);
      setActiveCycleNumber(data.activeCycleNumber);
      setRows(data.rows);
      setSavedRows(data.rows);
      setCycleAverages(data.cycleAverages);
    } catch (error) {
      if (loadCycleSequenceRef.current !== sequence) return;
      setMessage(error instanceof Error ? error.message : "Failed to load grades.");
    } finally {
      if (loadCycleSequenceRef.current === sequence && !options?.silent) {
        setLoading(false);
      }
    }
  }

  function goToCycle(cycleNumber: number) {
    const inCycleViewWithRows = viewMode === "cycle" && rows.length > 0;

    if (inCycleViewWithRows && cycleNumber === activeCycleNumber) {
      return;
    }

    if (inCycleViewWithRows && cycleNumber !== activeCycleNumber && hasUnsavedChanges) {
      const proceed = window.confirm("You have unsaved changes. Switch cycle and discard them?");
      if (!proceed) return;
    }

    setViewMode("cycle");
    void loadCycle(cycleNumber, inCycleViewWithRows ? { silent: true } : undefined);
  }

  function goToStudentView(userId?: string) {
    const inCycleViewWithRows = viewMode === "cycle" && rows.length > 0;
    if (inCycleViewWithRows && hasUnsavedChanges) {
      const proceed = window.confirm("You have unsaved changes. Switch view and discard them?");
      if (!proceed) return;
    }

    setViewMode(STUDENT_VIEW);
    if (userId) setSelectedStudentId(userId);
    if (totalsRows.length === 0) {
      void loadTotals({ silent: true });
    }
  }

  loadCycleRef.current = loadCycle;
  flushAutosavesRef.current = flushAutosaves;

  useEffect(() => {
    void loadTotals();
  }, []);

  const activeCycle = useMemo(
    () => cycles.find((cycle) => cycle.cycleNumber === activeCycleNumber) ?? null,
    [cycles, activeCycleNumber]
  );

  const activeCycleAverage = useMemo(
    () => cycleAverages.find((entry) => entry.cycleNumber === activeCycleNumber) ?? null,
    [cycleAverages, activeCycleNumber]
  );
  const activeCycleHasFinalCut = Boolean(activeCycle?.finalCutDate);
  const feedbackModalRow = useMemo(
    () => rows.find((row) => row.userId === feedbackModalUserId) ?? null,
    [rows, feedbackModalUserId]
  );
  const extensionNoteRow = useMemo(
    () => rows.find((row) => row.userId === extensionNoteUserId) ?? null,
    [rows, extensionNoteUserId]
  );
  const publicationHistoryRow = useMemo(
    () => rows.find((row) => row.userId === publicationHistoryUserId) ?? null,
    [rows, publicationHistoryUserId]
  );
  const totalsNotesRow = useMemo(
    () => totalsRows.find((row) => row.userId === totalsNotesUserId) ?? null,
    [totalsRows, totalsNotesUserId]
  );

  const savedRowMap = useMemo(() => {
    return new Map(savedRows.map((row) => [row.userId, row]));
  }, [savedRows]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    savedRowMapRef.current = savedRowMap;
  }, [savedRowMap]);

  useEffect(() => {
    activeCycleNumberRef.current = activeCycleNumber;
  }, [activeCycleNumber]);

  useEffect(() => {
    autosaveBlockedRef.current = { savingAll, publishingAll, publishingUserId };
  }, [savingAll, publishingAll, publishingUserId]);

  const hasUnsavedChanges = useMemo(
    () =>
      rows.some((row) => rowHasUnsavedChanges(row, savedRowMap.get(row.userId))),
    [rows, savedRowMap]
  );

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aName = a.name?.trim() ?? "";
      const bName = b.name?.trim() ?? "";
      const aPart = sortBy === "lastName" ? (aName.split(" ").pop() ?? aName) : (aName.split(" ")[0] ?? aName);
      const bPart = sortBy === "lastName" ? (bName.split(" ").pop() ?? bName) : (bName.split(" ")[0] ?? bName);
      return aPart.localeCompare(bPart);
    });
  }, [rows, sortBy]);

  const sortedTotalsRows = useMemo(() => {
    return [...totalsRows].sort((a, b) => {
      const aName = a.name?.trim() ?? "";
      const bName = b.name?.trim() ?? "";
      const aPart = sortBy === "lastName" ? (aName.split(" ").pop() ?? aName) : (aName.split(" ")[0] ?? aName);
      const bPart = sortBy === "lastName" ? (bName.split(" ").pop() ?? bName) : (bName.split(" ")[0] ?? bName);
      return aPart.localeCompare(bPart);
    });
  }, [totalsRows, sortBy]);

  const selectedStudent = useMemo(
    () => totalsRows.find((row) => row.userId === selectedStudentId) ?? null,
    [totalsRows, selectedStudentId]
  );

  const busy = savingAll || publishingAll || savingUserId !== null || publishingUserId !== null;
  const csvDownloadDisabled = viewMode === TOTAL_VIEW ? totalsLoading : loading;

  function autosaveBlocked() {
    return (
      autosaveBlockedRef.current.savingAll ||
      autosaveBlockedRef.current.publishingAll ||
      autosaveBlockedRef.current.publishingUserId !== null
    );
  }

  function clearAllAutosaves() {
    for (const timer of autosaveTimersRef.current.values()) {
      clearTimeout(timer);
    }
    autosaveTimersRef.current.clear();
    pendingAutosaveUserIdsRef.current.clear();
  }

  function clearRowAutosaveTimer(userId: string) {
    const existing = autosaveTimersRef.current.get(userId);
    if (!existing) return;
    clearTimeout(existing);
    autosaveTimersRef.current.delete(userId);
  }

  async function flushAutosaves() {
    if (autosaveRunningRef.current) return;
    if (autosaveBlocked()) return;

    autosaveRunningRef.current = true;

    try {
      while (pendingAutosaveUserIdsRef.current.size > 0) {
        if (autosaveBlocked()) {
          return;
        }

        const nextUserId = pendingAutosaveUserIdsRef.current.values().next().value as string | undefined;
        if (!nextUserId) {
          return;
        }

        pendingAutosaveUserIdsRef.current.delete(nextUserId);

        const latestRow = rowsRef.current.find((entry) => entry.userId === nextUserId);
        const latestBaseline = savedRowMapRef.current.get(nextUserId);
        if (!latestRow || !rowHasUnsavedChanges(latestRow, latestBaseline)) {
          continue;
        }

        await saveRow(nextUserId);
      }
    } finally {
      autosaveRunningRef.current = false;

      if (
        pendingAutosaveUserIdsRef.current.size > 0 &&
        !autosaveBlocked()
      ) {
        void flushAutosaves();
      }
    }
  }

  function scheduleRowAutosave(userId: string) {
    clearRowAutosaveTimer(userId);

    const timer = setTimeout(() => {
      autosaveTimersRef.current.delete(userId);
      pendingAutosaveUserIdsRef.current.add(userId);
      void flushAutosaves();
    }, 700);

    autosaveTimersRef.current.set(userId, timer);
  }

  function updateRow(userId: string, patch: Partial<GradeRow>) {
    setRows((current) =>
      current.map((row) =>
        row.userId === userId
          ? {
              ...row,
              ...patch
            }
          : row
      )
    );
  }

  function updateRowAndAutosave(userId: string, patch: Partial<GradeRow>) {
    updateRow(userId, patch);
    scheduleRowAutosave(userId);
  }

  async function saveCheckIn(userId: string, stage: CheckInStage, value: string) {
    if (checkInSaveRef.current) return;
    const cycleNumber = activeCycleNumberRef.current;
    checkInSaveRef.current = true;
    setSavingCheckIn(true);
    try {
      const response = await fetch("/api/grades/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setCheckIn", userId, cycleNumber, stage, points: value === "auto" ? null : value === "UNGRADED" || value === "EXEMPT" ? value : Number(value) })
      });
      const payload = await response.json() as {
        data?: Pick<GradeRow, "checkInScores" | "checkInOverrides">;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Failed to save check-in.");
      if (activeCycleNumberRef.current === cycleNumber) {
        const patch = payload.data;
        setRows((current) => current.map((row) => row.userId === userId ? { ...row, ...patch } : row));
        setSavedRows((current) => current.map((row) => row.userId === userId ? { ...row, ...patch } : row));
      }
      staleCheckInTotalsRef.current.add(userId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save check-in.");
    } finally {
      checkInSaveRef.current = false;
      setSavingCheckIn(false);
    }
  }

  async function saveRow(userId: string) {
    const row = rowsRef.current.find((entry) => entry.userId === userId);
    if (!row) return false;

    try {
      setSavingUserId(userId);

      const response = await fetch("/api/grades/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          cycleNumber: activeCycleNumberRef.current,
          userId,
          effortPoints: row.effortPoints,
          finalCutState: row.finalCutState,
          teamworkPoints: row.teamworkPoints ?? 0,
          feedback: row.feedback,
          turnedInDate: row.turnedInDate
        })
      });

      const payload = (await response.json()) as {
        data?: GradeMutationPayload;
        error?: { message?: string };
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to save grade.");
      }

      clearRowAutosaveTimer(userId);
      pendingAutosaveUserIdsRef.current.delete(userId);

      const previousSaved = savedRowMapRef.current.get(userId);
      const turnedInDateChanged = (previousSaved?.turnedInDate ?? null) !== (payload.data!.turnedInDate ?? null);
      if (turnedInDateChanged && payload.data!.extensionsRemaining < 0) {
        const rowEntry = rowsRef.current.find((r) => r.userId === userId);
        setExtensionDepletedWarning({
          userName: rowEntry?.name?.trim() || "Unnamed user",
          remaining: payload.data!.extensionsRemaining
        });
      }

      setRows((current) =>
        current.map((entry) => (entry.userId === userId ? applyMutationToRow(entry, payload.data!) : entry))
      );
      setSavedRows((current) =>
        current.map((entry) => (entry.userId === userId ? applyMutationToRow(entry, payload.data!) : entry))
      );
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save grade.");
      return false;
    } finally {
      setSavingUserId(null);
    }
  }

  async function togglePublish(userId: string) {
    const row = rowsRef.current.find((entry) => entry.userId === userId);
    if (!row) return false;

    try {
      setPublishingUserId(userId);

      const response = await fetch("/api/grades/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setPublish",
          cycleNumber: activeCycleNumberRef.current,
          userId,
          published: !row.published
        })
      });

      const payload = (await response.json()) as {
        data?: GradeMutationPayload;
        error?: { message?: string };
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to update publish state.");
      }

      setRows((current) =>
        current.map((entry) => (entry.userId === userId ? applyMutationToRow(entry, payload.data!) : entry))
      );
      setSavedRows((current) =>
        current.map((entry) => (entry.userId === userId ? applyMutationToRow(entry, payload.data!) : entry))
      );
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update publish state.");
      return false;
    } finally {
      setPublishingUserId(null);
    }
  }

  async function saveAllRows() {
    clearAllAutosaves();

    const dirtyRows = rows.filter((row) => rowHasUnsavedChanges(row, savedRowMap.get(row.userId)));

    if (dirtyRows.length === 0) {
      return;
    }

    try {
      setSavingAll(true);
      for (const row of dirtyRows) {
        const success = await saveRow(row.userId);
        if (!success) {
          return;
        }
      }
    } finally {
      setSavingAll(false);
    }
  }

  async function publishAllFilledRows() {
    const filledRows = rows.filter(isRowFilledIn);

    if (filledRows.length === 0) {
      return;
    }

    const dirtyFilledRows = filledRows.filter((row) => rowHasUnsavedChanges(row, savedRowMap.get(row.userId)));
    const unpublishedFilledRows = filledRows.filter((row) => !row.published);

    if (dirtyFilledRows.length === 0 && unpublishedFilledRows.length === 0) {
      return;
    }

    try {
      setPublishingAll(true);

      for (const row of dirtyFilledRows) {
        const success = await saveRow(row.userId);
        if (!success) {
          return;
        }
      }

      for (const row of unpublishedFilledRows) {
        const success = await togglePublish(row.userId);
        if (!success) {
          return;
        }
      }
    } finally {
      setPublishingAll(false);
    }
  }

  function downloadCsv() {
    const csv =
      viewMode === TOTAL_VIEW
        ? buildTotalGradesCsv({
            cycles,
            checkInPossible,
            rows: sortedTotalsRows.map((row) => ({
              name: row.name,
              email: row.email,
              participationEarned: row.participationEarned,
              participationPossible: row.participationPossible,
              cycleTotals: row.cycleTotals,
              checkInPossible: row.checkInPossible,
              adjustments: getAdjustments(row.userId)
            }))
          })
        : buildCycleGradesCsv({
            cycleNumber: activeCycleNumber,
            rows: sortedRows
          });
    const fileName =
      viewMode === TOTAL_VIEW
        ? "total-grades.csv"
        : `package-cycle-${activeCycleNumber}-grades.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!savingAll && !publishingAll && publishingUserId === null && pendingAutosaveUserIdsRef.current.size > 0) {
      void flushAutosavesRef.current();
    }
  }, [savingAll, publishingAll, publishingUserId]);

  useEffect(() => {
    return () => {
      clearAllAutosaves();
    };
  }, []);

  return (
    <div className="route-enter mx-auto w-full max-w-[1760px] space-y-5 pb-24">
      {/* ============= Hero (new design) ============= */}
      <section
        className="brand-hero-panel relative overflow-hidden rounded-2xl border border-border p-6 md:p-7"
      >
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgb(43,179,110,0.4)] bg-background px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--brand-green)]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-green)]" />
              Grade Editor · Producer view
            </div>
            <h1
              className="mt-3 text-[32px] font-semibold leading-none tracking-tight text-foreground md:text-[44px]"
              style={{ letterSpacing: "-0.02em" }}
            >
              {viewMode === TOTAL_VIEW
                ? "Total Grade"
                : viewMode === STUDENT_VIEW
                  ? "Student Gradebook"
                  : `Package Cycle ${activeCycle?.cycleNumber ?? "—"}`}
            </h1>
            <p className="mt-1 text-sm text-[var(--ink-text)]">
              {viewMode === TOTAL_VIEW
                ? "Aggregate package scores, check-ins, livestream, completed-week participation, and final credits."
                : viewMode === STUDENT_VIEW
                  ? "Open one reporter's grades in the same Schoology-style table students see."
                  : "Score each reporter's final cut out of 50. Late 20%/30% applies automatically. A second revision after a grade below 75% is capped at 37/50."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--ink-text)]">
              {viewMode === TOTAL_VIEW ? (
                <div className="inline-flex items-center gap-1.5">
                  <Users2 className="h-3 w-3" />
                  <span>
                    <strong className="font-semibold text-foreground">{totalsRows.length}</strong> reporters · max{" "}
                    <strong className="font-semibold text-foreground">
                      {cycles.length * MAX_PACKAGE_PER_CYCLE +
                        cycles.length * MAX_CHECK_INS_PER_CYCLE +
                        MAX_LIVESTREAM +
                        MAX_FINAL}
                    </strong>{" "}
                    pts (50×cycles + 20×cycles + 40 livestream + 100 portfolio)
                  </span>
                </div>
              ) : viewMode === STUDENT_VIEW ? (
                <div className="inline-flex items-center gap-1.5">
                  <UserRound className="h-3 w-3" />
                  <span>
                    {selectedStudent
                      ? selectedStudent.name?.trim() || selectedStudent.email || "Unnamed user"
                      : "Pick a reporter from the list"}
                  </span>
                </div>
              ) : (
                <>
                  <div className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3 w-3" />
                    <span>
                      Final Cut: <strong className="font-semibold text-foreground">{formatLongDate(activeCycle?.finalCutDate ?? null)}</strong>
                    </span>
                  </div>
                  <span className="h-3 w-px bg-[var(--ink-4)]" />
                  <div className="inline-flex items-center gap-1.5">
                    <Clock3 className="h-3 w-3" />
                    <span>Auto-saving</span>
                  </div>
                  <span className="h-3 w-px bg-[var(--ink-4)]" />
                  <div className="inline-flex items-center gap-1.5">
                    <Users2 className="h-3 w-3" />
                    <span>
                      <strong className="font-semibold text-foreground">{rows.length}</strong> reporters
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          {viewMode === "cycle" ? (
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap border",
              hasUnsavedChanges
                ? "border-[rgb(242,165,22,0.4)] bg-[rgb(242,165,22,0.15)] text-[var(--brand-amber)]"
                : "border-[rgb(43,179,110,0.35)] bg-[rgb(43,179,110,0.12)] text-[var(--brand-green)]"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                hasUnsavedChanges ? "bg-[var(--brand-amber)]" : "bg-[var(--brand-green)]"
              )}
              style={
                hasUnsavedChanges
                  ? { animation: "rec-pulse 1.4s infinite" }
                  : undefined
              }
            />
            <span>
              {hasUnsavedChanges
                ? `${rows.filter((r) => rowHasUnsavedChanges(r, savedRowMap.get(r.userId))).length} unsaved changes`
                : "All changes saved"}
            </span>
          </div>
          ) : null}
        </div>

        {/* Cycle tabs row */}
        {cycles.length > 0 ? (
          <div className="relative mt-5 inline-flex items-center gap-1 rounded-lg border border-foreground/[0.08] bg-background p-1">
            {cycles.map((cycle) => {
              const isActive = viewMode === "cycle" && activeCycleNumber === cycle.cycleNumber;
              return (
                <button
                  key={cycle.cycleNumber}
                  type="button"
                  onClick={() => goToCycle(cycle.cycleNumber)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.11em] transition",
                    isActive
                      ? "bg-[var(--brand-fill)] text-[var(--on-brand)]"
                      : "text-[var(--ink-text)] hover:bg-foreground/5 hover:text-foreground"
                  )}
                >
                  Cycle{" "}
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono-broadcast text-[10px] font-medium tabular-nums",
                      isActive
                        ? "bg-black/25 text-[var(--on-brand)]"
                        : "bg-foreground/10 text-[var(--ink-text)]"
                    )}
                  >
                    {String(cycle.cycleNumber).padStart(2, "0")}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setViewMode(TOTAL_VIEW);
                void loadTotals({ silent: true });
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.11em] transition",
                viewMode === TOTAL_VIEW
                  ? "bg-[var(--brand-fill)] text-[var(--on-brand)]"
                  : "text-[var(--ink-text)] hover:bg-foreground/5 hover:text-foreground"
              )}
            >
              Total Grade
            </button>
            <button
              type="button"
              onClick={() => goToStudentView()}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.11em] transition",
                viewMode === STUDENT_VIEW
                  ? "bg-[var(--brand-fill)] text-[var(--on-brand)]"
                  : "text-[var(--ink-text)] hover:bg-foreground/5 hover:text-foreground"
              )}
            >
              <UserRound className="h-3.5 w-3.5" />
              Student
            </button>
            <button
              type="button"
              onClick={() => {
                void openMissing();
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.11em] transition",
                "text-[var(--ink-text)] hover:bg-foreground/5 hover:text-foreground"
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Missing Grades
            </button>
          </div>
        ) : null}

        {/* 4-up stats with mini bars */}
        {viewMode === TOTAL_VIEW || viewMode === STUDENT_VIEW ? null : (
        <div className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-foreground/[0.08] bg-background p-4">
            <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-text)]">
              <span>Cycle Average</span>
            </div>
            <div className="mt-1.5 inline-flex items-baseline gap-1.5 text-[28px] font-semibold leading-none tracking-tight text-foreground">
              {activeCycleAverage?.averageTotal !== null && activeCycleAverage?.averageTotal !== undefined
                ? activeCycleAverage.averageTotal.toFixed(1)
                : "—"}
              <span className="text-sm font-medium text-muted-foreground">/ {MAX_PACKAGE_PER_CYCLE}</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--ink-2)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, ((activeCycleAverage?.averageTotal ?? 0) / MAX_PACKAGE_PER_CYCLE) * 100)}%`,
                  background: "var(--brand-green)"
                }}
              />
            </div>
          </div>
          <div className="rounded-xl border border-foreground/[0.08] bg-background p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-text)]">
              Cycle Percentage
            </div>
            <div className="mt-1.5 inline-flex items-baseline gap-1.5 text-[28px] font-semibold leading-none tracking-tight text-foreground">
              {activeCycleAverage?.averagePercentage !== null && activeCycleAverage?.averagePercentage !== undefined
                ? activeCycleAverage.averagePercentage.toFixed(1)
                : "—"}
              <span className="text-sm font-medium text-muted-foreground">%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--ink-2)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, activeCycleAverage?.averagePercentage ?? 0)}%`,
                  background: "var(--brand-green)"
                }}
              />
            </div>
          </div>
          <div className="rounded-xl border border-foreground/[0.08] bg-background p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-text)]">
              Published
            </div>
            <div className="mt-1.5 inline-flex items-baseline gap-1.5 text-[28px] font-semibold leading-none tracking-tight text-foreground">
              {activeCycleAverage?.publishedCount ?? 0}
              <span className="text-sm font-medium text-muted-foreground">/ {rows.length}</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--ink-2)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: rows.length > 0
                    ? `${Math.min(100, ((activeCycleAverage?.publishedCount ?? 0) / rows.length) * 100)}%`
                    : "0%",
                  background: "var(--brand-green)"
                }}
              />
            </div>
          </div>
          <div className="rounded-xl border border-foreground/[0.08] bg-background p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-text)]">
              Late Submissions
            </div>
            <div className="mt-1.5 inline-flex items-baseline gap-1.5 text-[28px] font-semibold leading-none tracking-tight text-[var(--brand-amber)]">
              {rows.filter((r) => r.extensionsRemaining < 0).length}
              <span className="text-sm font-medium text-muted-foreground">flagged</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--ink-2)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: rows.length > 0
                    ? `${Math.min(100, (rows.filter((r) => r.extensionsRemaining < 0).length / rows.length) * 100)}%`
                    : "0%",
                  background: "var(--brand-amber)"
                }}
              />
            </div>
          </div>
        </div>
        )}

        {message ? (
          <p className="relative mt-4 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}
      </section>

      {/* Toolbar */}
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === STUDENT_VIEW ? null : (
          <div className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-[var(--ink)] px-3">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search reporters…"
              className="w-[180px] bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          )}
          <button
            type="button"
            onClick={() => setSortBy((prev) => (prev === "firstName" ? "lastName" : "firstName"))}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-[var(--ink)] px-3 text-xs font-semibold text-foreground transition hover:border-[var(--ink-4)]"
          >
            Sort: {sortBy === "firstName" ? "First name" : "Last name"}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-9"
            onClick={() => {
              if (viewMode === TOTAL_VIEW) {
                void loadTotals({ silent: true });
                return;
              }
              if (viewMode === STUDENT_VIEW) {
                void loadTotals({ silent: true });
                setStudentRefreshToken((value) => value + 1);
                return;
              }
              void loadCycle(activeCycleNumber, { silent: true });
            }}
            disabled={busy}
          >
            <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          {viewMode === STUDENT_VIEW ? null : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-9"
            onClick={downloadCsv}
            disabled={csvDownloadDisabled}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download CSV
          </Button>
          )}
          {viewMode === "cycle" ? (
            <>
              <Button
                type="button"
                size="sm"
                className="h-9 bg-[var(--brand-fill)] font-bold text-[var(--on-brand)] hover:bg-[var(--brand-fill-hover)]"
                onClick={() => void saveAllRows()}
                disabled={loading || busy}
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save All
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 bg-[var(--brand-amber)] font-bold text-[var(--ink)] hover:bg-[var(--brand-amber)]/85"
                onClick={() => void publishAllFilledRows()}
                disabled={loading || busy}
              >
                Publish All
              </Button>
            </>
          ) : null}
        </div>
      </section>

      {viewMode === STUDENT_VIEW ? (
        <StudentGradebookPanel
          people={sortedTotalsRows.map((row) => ({
            userId: row.userId,
            name: row.name,
            email: row.email
          }))}
          selectedUserId={selectedStudentId}
          onSelectUserId={setSelectedStudentId}
          sortBy={sortBy}
          refreshToken={studentRefreshToken}
        />
      ) : (
      <>
      <p className="text-xs text-muted-foreground">Scores: — ungraded · \ exempt. Both are excluded from totals. Total tab adjustments are temporary; cycle scores save automatically.</p>
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {viewMode === TOTAL_VIEW ? (
          totalsLoading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading totals...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] border-collapse text-sm text-foreground">
                <thead>
                  <tr>
                    {[
                      { label: "Reporter", sub: null },
                      ...cycles.map((cycle) => ({
                        label: `Cycle ${String(cycle.cycleNumber).padStart(2, "0")}`,
                        sub: `/ ${MAX_PACKAGE_PER_CYCLE}`
                      })),
                      {
                        label: "Check-Ins",
                        sub: `/ ${checkInPossible > 0 ? checkInPossible : cycles.length * MAX_CHECK_INS_PER_CYCLE}`
                      },
                      { label: "Livestream", sub: `/ ${MAX_LIVESTREAM}` },
                      { label: "Participation", sub: "ended weeks" },
                      { label: "Final", sub: `/ ${MAX_FINAL}` },
                      { label: "Extra", sub: "X / Y" },
                      { label: "Total Grade", sub: null },
                      { label: "Notes", sub: null }
                    ].map((col, i) => (
                      <th
                        key={`${col.label}-${i}`}
                        className="bg-[hsl(var(--background))] px-3 py-3 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
                      >
                        {col.label}
                        {col.sub ? <span className="ml-1 text-[var(--ink-4)]">{col.sub}</span> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedTotalsRows.map((row, rowIdx) => {
                    const adjustments = getAdjustments(row.userId);
                    const palette = ["av-green", "av-red", "av-blue", "av-purple", "av-gray"] as const;
                    const av = palette[rowIdx % palette.length];
                    const initials = (row.name?.trim() || "Unnamed user")
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0]?.toUpperCase() ?? "")
                      .join("") || "??";
                    const checkInMax =
                      row.checkInPossible && row.checkInPossible > 0
                        ? row.checkInPossible
                        : checkInPossible > 0
                          ? checkInPossible
                          : cycles.length * MAX_CHECK_INS_PER_CYCLE;
                    let packageSum = 0;
                    let packageMax = 0;
                    for (const entry of row.cycleTotals) {
                      if (entry.totalPoints !== null) {
                        packageSum += entry.totalPoints;
                        packageMax += MAX_PACKAGE_PER_CYCLE;
                      } else {
                        const parsed = parseOverride(
                          adjustments.cycleOverrides[entry.cycleNumber],
                          MAX_PACKAGE_PER_CYCLE
                        );
                        if (parsed !== null) {
                          packageSum += parsed;
                          packageMax += MAX_PACKAGE_PER_CYCLE;
                        }
                      }
                    }
                    const totalGrade =
                      packageSum +
                      (numericGradeScore(adjustments.checkIns) ?? 0) +
                      (numericGradeScore(adjustments.livestream) ?? 0) +
                      row.participationEarned +
                      (numericGradeScore(adjustments.final) ?? 0) +
                      (numericGradeScore(adjustments.extraPoints) ?? 0);
                    const totalMax =
                      packageMax +
                      (typeof adjustments.checkIns !== "number" ? 0 : checkInMax) +
                      (typeof adjustments.livestream !== "number" ? 0 : MAX_LIVESTREAM) +
                      row.participationPossible +
                      (typeof adjustments.final !== "number" ? 0 : MAX_FINAL) +
                      (typeof adjustments.extraPoints === "number" ? adjustments.extraMax : 0);
                    const totalPct = totalMax > 0 ? (totalGrade / totalMax) * 100 : null;
                    const pctTone =
                      (totalPct ?? 0) >= 80 ? "text-[var(--brand-green)]" : "text-[var(--brand-amber)]";

                    return (
                      <tr
                        key={row.userId}
                        className="border-b border-[hsl(var(--border))]/60 transition hover:bg-[hsl(var(--background))]"
                      >
                        <td className="w-[210px] px-3 py-2.5 align-middle">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                "grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--ink-3)] text-[11px] font-bold",
                                av
                              )}
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => goToStudentView(row.userId)}
                                className="text-left text-sm font-semibold text-foreground hover:text-[var(--brand-green)] hover:underline"
                              >
                                {row.name?.trim() || "Unnamed user"}
                              </button>
                              <div className="font-mono-broadcast tabular-nums text-[10px] text-muted-foreground">
                                {row.email?.split("@")[0] ?? "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        {row.cycleTotals.map((entry) => {
                          const override = adjustments.cycleOverrides[entry.cycleNumber];
                          const isEditable = entry.totalPoints === null;
                          return (
                            <td
                              key={entry.cycleNumber}
                              className="w-[110px] px-3 py-2.5 align-middle"
                            >
                              {isEditable ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    aria-label={`${row.name ?? "Student"} Cycle ${entry.cycleNumber} score`}
                                    title="Enter points, - for ungraded, or \ for exempt"
                                    value={override ?? gradeScoreInput(entry.finalCutState ?? null)}
                                    onChange={(event) => {
                                      const raw = event.target.value;
                                      const nextOverrides = { ...adjustments.cycleOverrides };
                                      if (raw === "") {
                                        delete nextOverrides[entry.cycleNumber];
                                      } else if (raw === "-" || raw === "—" || raw === "\\") {
                                        nextOverrides[entry.cycleNumber] = raw;
                                      } else if (/^\d*$/.test(raw)) {
                                        const numeric = Math.min(
                                          MAX_PACKAGE_PER_CYCLE,
                                          Number(raw)
                                        );
                                        nextOverrides[entry.cycleNumber] = String(numeric);
                                      } else {
                                        return;
                                      }
                                      updateAdjustment(row.userId, { cycleOverrides: nextOverrides });
                                    }}
                                    placeholder="—"
                                    className="h-7 w-12 rounded-md border border-dashed border-[var(--ink-4)] bg-[var(--ink)] px-2 font-mono-broadcast tabular-nums text-xs font-semibold text-foreground outline-none focus:border-[var(--brand-green)]"
                                  />
                                  <span className="font-mono-broadcast tabular-nums text-[11px] text-muted-foreground">
                                    /{MAX_PACKAGE_PER_CYCLE}
                                  </span>
                                </div>
                              ) : (
                                <div className="font-mono-broadcast tabular-nums text-sm font-semibold text-foreground">
                                  {entry.totalPoints}
                                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                                    /{MAX_PACKAGE_PER_CYCLE}
                                  </span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="w-[120px] px-3 py-2.5 align-middle">
                          <div className="flex items-center gap-2">
                            <input
                              value={gradeScoreInput(adjustments.checkIns)}
                              aria-label={`${row.name ?? "Student"} checkIns score`}
                              title="Enter points, - for ungraded, or \ for exempt"
                              onChange={(event) => {
                                const score = parseGradeScore(event.target.value, checkInMax);
                                if (score !== undefined) updateAdjustment(row.userId, { checkIns: score });
                              }}
                              placeholder="—"
                              className="h-7 w-12 rounded-md border border-border bg-[var(--ink)] px-2 font-mono-broadcast tabular-nums text-xs font-semibold text-foreground outline-none focus:border-[var(--brand-green)]"
                            />
                            <span className="font-mono-broadcast tabular-nums text-[11px] text-muted-foreground">
                              /{checkInMax}
                            </span>
                          </div>
                        </td>
                        <td className="w-[120px] px-3 py-2.5 align-middle">
                          <div className="flex items-center gap-2">
                            <input
                              value={gradeScoreInput(adjustments.livestream)}
                              aria-label={`${row.name ?? "Student"} livestream score`}
                              title="Enter points, - for ungraded, or \ for exempt"
                              onChange={(event) => {
                                const score = parseGradeScore(event.target.value, MAX_LIVESTREAM);
                                if (score !== undefined) updateAdjustment(row.userId, { livestream: score });
                              }}
                              placeholder="—"
                              className="h-7 w-14 rounded-md border border-border bg-[var(--ink)] px-2 font-mono-broadcast tabular-nums text-xs font-semibold text-foreground outline-none focus:border-[var(--brand-green)]"
                            />
                            <span className="font-mono-broadcast tabular-nums text-[11px] text-muted-foreground">
                              /{MAX_LIVESTREAM}
                            </span>
                          </div>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {row.livestreamHours}/{REQUIRED_LIVESTREAM_HOURS} hours completed
                          </p>
                        </td>
                        <td className="w-[140px] px-3 py-2.5 align-middle">
                          <span
                            className="whitespace-nowrap font-mono-broadcast tabular-nums text-xs text-foreground"
                            title="Graded participation from weeks ending before this Monday, Pacific time. Ungraded days are excluded."
                          >
                            {row.participationEarned}/{row.participationPossible}
                          </span>
                        </td>
                        <td className="w-[120px] px-3 py-2.5 align-middle">
                          <div className="flex items-center gap-2">
                            <input
                              value={gradeScoreInput(adjustments.final)}
                              aria-label={`${row.name ?? "Student"} final score`}
                              title="Enter points, - for ungraded, or \ for exempt"
                              onChange={(event) => {
                                const score = parseGradeScore(event.target.value, MAX_FINAL);
                                if (score !== undefined) updateAdjustment(row.userId, { final: score });
                              }}
                              placeholder="—"
                              className="h-7 w-14 rounded-md border border-border bg-[var(--ink)] px-2 font-mono-broadcast tabular-nums text-xs font-semibold text-foreground outline-none focus:border-[var(--brand-green)]"
                            />
                            <span className="font-mono-broadcast tabular-nums text-[11px] text-muted-foreground">
                              /{MAX_FINAL}
                            </span>
                          </div>
                        </td>
                        <td className="w-[140px] px-3 py-2.5 align-middle">
                          <div className="flex items-center gap-1.5">
                            <input
                              value={gradeScoreInput(adjustments.extraPoints)}
                              aria-label={`${row.name ?? "Student"} extraPoints score`}
                              title="Enter points, - for ungraded, or \ for exempt"
                              onChange={(event) => {
                                const score = parseGradeScore(event.target.value, Number.MAX_SAFE_INTEGER);
                                if (score !== undefined) updateAdjustment(row.userId, { extraPoints: score });
                              }}
                              className="h-7 w-12 rounded-md border border-border bg-[var(--ink)] px-2 font-mono-broadcast tabular-nums text-xs font-semibold text-foreground outline-none focus:border-[var(--brand-green)]"
                              placeholder="0"
                            />
                            <span className="font-mono-broadcast tabular-nums text-[11px] text-muted-foreground">/</span>
                            <input
                              value={adjustments.extraMax}
                              onChange={(event) =>
                                updateAdjustment(row.userId, {
                                  extraMax: clampNonNegative(event.target.value)
                                })
                              }
                              className="h-7 w-12 rounded-md border border-border bg-[var(--ink)] px-2 font-mono-broadcast tabular-nums text-xs font-semibold text-foreground outline-none focus:border-[var(--brand-green)]"
                              placeholder="0"
                            />
                          </div>
                        </td>
                        <td className="w-[200px] px-3 py-2.5 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="min-w-0">
                              <div className="text-lg font-semibold leading-none tracking-tight text-foreground">
                                {totalGrade}
                                <span className="ml-1 text-xs font-normal text-muted-foreground">
                                  /{totalMax}
                                </span>
                              </div>
                              <div className={cn("font-mono-broadcast tabular-nums text-[11px] font-semibold", pctTone)}>
                                {totalPct === null ? "—" : `${totalPct.toFixed(1)}%`}
                              </div>
                            </div>
                            <div
                              className={cn(
                                "text-3xl font-semibold leading-none tracking-tight",
                                pctTone
                              )}
                            >
                              {totalPct === null ? "—" : letterGrade(totalPct)}
                            </div>
                          </div>
                        </td>
                        <td className="w-[100px] px-3 py-2.5 align-middle">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTotalsNotesUserId(row.userId)}
                            className="h-7 px-3 text-xs"
                          >
                            {row.notes.trim() ? "View" : "Add"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {totalsRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={cycles.length + 8}
                        className="px-4 py-6 text-center text-sm text-muted-foreground"
                      >
                        No gradable users found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )
        ) : loading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading grade editor...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] border-collapse text-sm text-foreground">
              <thead>
                <tr>
                  {[
                    { label: "Reporter", sub: null },
                    ...CHECK_IN_STAGES.map((stage) => ({ label: CHECK_IN_LABELS[stage], sub: "/ 5" })),
                    { label: "Final cut", sub: `/ ${MAX_PACKAGE_PER_CYCLE}` },
                    { label: "Official", sub: "after late" },
                    { label: "Feedback", sub: null },
                    { label: "Turned In", sub: null },
                    { label: "Status", sub: null },
                    { label: "", sub: null }
                  ].map((col, i) => (
                    <th
                      key={`${col.label}-${i}`}
                      className="bg-[hsl(var(--background))] px-3 py-3 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
                    >
                      {col.label}
                      {col.sub ? <span className="ml-1 text-[var(--ink-4)]">{col.sub}</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, rowIdx) => {
                  const total = scoreTotal(row);
                  const percentage = scorePercent(row);
                  const baseline = savedRowMap.get(row.userId);
                  const dirty = rowHasUnsavedChanges(row, baseline);
                  const canPublishRow = isRowFilledIn(row);
                  const palette = ["av-green", "av-red", "av-blue", "av-purple", "av-gray"] as const;
                  const av = palette[rowIdx % palette.length];
                  const initials = rowLabel(row)
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() ?? "")
                    .join("") || "??";
                  const effort = row.effortPoints ?? 0;
                  const effortPct = (effort / MAX_PACKAGE_PER_CYCLE) * 100;
                  const pctTone =
                    percentage >= 80 ? "text-[var(--brand-green)]" : "text-[var(--brand-amber)]";

                  return (
                    <tr
                      key={row.userId}
                      className={cn(
                        "border-b border-[hsl(var(--border))]/60 transition hover:bg-[hsl(var(--background))]",
                        dirty && "bg-[rgb(242,165,22,0.04)]"
                      )}
                    >
                      <td className="w-[210px] px-3 py-2.5 align-middle">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              "grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--ink-3)] text-[11px] font-bold",
                              av
                            )}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => goToStudentView(row.userId)}
                                className="text-left text-sm font-semibold text-foreground hover:text-[var(--brand-green)] hover:underline"
                              >
                                {rowLabel(row)}
                              </button>
                            </div>
                            <div className="font-mono-broadcast tabular-nums text-[10px] text-muted-foreground">
                              {row.email?.split("@")[0] ?? "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      {CHECK_IN_STAGES.map((stage) => (
                        <td key={stage} className="px-3 py-2.5 align-middle">
                          {row.checkInScores[stage] === null ? (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          ) : (
                            <select
                              aria-label={`${rowLabel(row)} ${CHECK_IN_LABELS[stage]} score`}
                              value={row.checkInOverrides[stage] ?? "auto"}
                              disabled={savingCheckIn}
                              onChange={(event) => void saveCheckIn(row.userId, stage, event.target.value)}
                              className="h-8 rounded-md border border-border bg-[var(--ink)] px-2 font-mono-broadcast tabular-nums text-xs text-foreground disabled:opacity-50"
                            >
                              <option value="UNGRADED">— Ungraded</option>
                              <option value="EXEMPT">Exempt</option>
                              <option value="auto">{row.checkInOverrides[stage] === null ? `Auto (${row.checkInScores[stage]}/5)` : "Automatic"}</option>
                              {[0, 1, 2, 3, 4, 5].map((points) => <option key={points} value={points}>{points}/5</option>)}
                            </select>
                          )}
                        </td>
                      ))}
                      <td className="w-[160px] px-3 py-2.5 align-middle">
                        <div className="flex items-center gap-2">
                          <input
                            aria-label={`${rowLabel(row)} Final Cut score`}
                            title="Enter points, - for ungraded, or \ for exempt"
                            value={gradeScoreInput(row.finalCutState ?? row.effortPoints)}
                            onChange={(event) => {
                              const score = parseGradeScore(event.target.value, MAX_PACKAGE_PER_CYCLE);
                              if (score === undefined) return;
                              updateRowAndAutosave(row.userId, {
                                effortPoints: numericGradeScore(score),
                                finalCutState: typeof score === "string" ? score : null,
                                teamworkPoints: 0
                              });
                            }}
                            placeholder="—"
                            className="h-7 w-12 rounded-md border border-border bg-[var(--ink)] px-2 font-mono-broadcast tabular-nums text-xs font-semibold text-foreground outline-none focus:border-[var(--brand-green)]"
                          />
                          <span className="font-mono-broadcast tabular-nums text-[11px] text-muted-foreground">
                            /{MAX_PACKAGE_PER_CYCLE}
                          </span>
                          <div className="h-1 w-12 overflow-hidden rounded-full bg-[var(--ink)]">
                            <div
                              className="h-full rounded-full bg-[var(--brand-green)]"
                              style={{ width: `${Math.min(100, effortPct)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="w-[110px] px-3 py-2.5 align-middle">
                        <div className="text-lg font-semibold leading-none tracking-tight text-foreground">
                          {row.finalCutState === "EXEMPT" ? "Exempt" : row.effortPoints === null ? "—" : total}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            /{MAX_PACKAGE_PER_CYCLE}
                          </span>
                        </div>
                        <div className={cn("font-mono-broadcast tabular-nums text-[11px] font-semibold", pctTone)}>
                          {row.effortPoints === null ? "—" : `${percentage.toFixed(1)}%`}
                        </div>
                      </td>
                      <td className="w-[90px] px-3 py-2.5 align-middle">
                        <button
                          type="button"
                          onClick={() => setFeedbackModalUserId(row.userId)}
                          className={cn(
                            "inline-flex items-center justify-center rounded-md border px-2.5 py-1.5 text-xs font-semibold transition",
                            row.feedback.trim()
                              ? "border-[rgb(43,179,110,0.35)] bg-[rgb(43,179,110,0.10)] text-[var(--brand-green)] hover:bg-[rgb(43,179,110,0.18)]"
                              : "border-border bg-[var(--ink)] text-muted-foreground hover:border-[var(--brand-green)] hover:text-foreground"
                          )}
                        >
                          {row.feedback.trim() ? "View" : "Add"}
                        </button>
                      </td>
                      <td className="w-[140px] px-3 py-2.5 align-middle">
                        <input
                          type="date"
                          value={row.turnedInDate ?? ""}
                          onFocus={(event) => {
                            if (!activeCycleHasFinalCut) {
                              window.alert(
                                "Please set the Final Cut date for this cycle in Package Cycles before entering Turned In."
                              );
                              event.currentTarget.blur();
                            }
                          }}
                          onChange={(event) => {
                            if (!activeCycleHasFinalCut) {
                              window.alert(
                                "Please set the Final Cut date for this cycle in Package Cycles before entering Turned In."
                              );
                              return;
                            }
                            updateRowAndAutosave(row.userId, {
                              turnedInDate: event.target.value || null
                            });
                          }}
                          className={cn(
                            "h-8 w-full rounded-md border px-2 font-mono-broadcast tabular-nums text-xs text-foreground outline-none [color-scheme:dark] light:[color-scheme:light]",
                            activeCycleHasFinalCut
                              ? "border-border bg-[var(--ink)] focus:border-[var(--brand-green)]"
                              : "border-[rgb(242,165,22,0.4)] bg-[rgb(242,165,22,0.08)] text-[var(--brand-amber)]"
                          )}
                        />
                      </td>
                      <td className="w-[110px] px-3 py-2.5 align-middle">
                        <span
                          className={cn(
                            "status-pill",
                            row.revised
                              ? "status-warn"
                              : row.published
                                ? "status-approved"
                                : "status-neutral"
                          )}
                        >
                          {row.revised ? "Revised" : row.published ? "Published" : "Unpublished"}
                        </span>
                      </td>
                      <td className="w-[150px] px-3 py-2.5 align-middle">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void togglePublish(row.userId)}
                            disabled={
                              savingAll ||
                              publishingAll ||
                              savingUserId === row.userId ||
                              publishingUserId === row.userId ||
                              (!row.published && !canPublishRow)
                            }
                            className={cn(
                              "rounded-md px-3 py-1.5 text-[11px] font-bold transition",
                              row.published
                                ? "border border-[rgb(242,165,22,0.30)] bg-[rgb(242,165,22,0.10)] text-[var(--brand-amber)] hover:bg-[rgb(242,165,22,0.20)]"
                                : "bg-[var(--brand-fill)] text-[var(--on-brand)] hover:bg-[var(--brand-fill-hover)]",
                              (!row.published && !canPublishRow) && "opacity-40",
                              dirty && !row.published && "ring-2 ring-[rgb(43,179,110,0.30)]"
                            )}
                          >
                            {publishingUserId === row.userId
                              ? "..."
                              : row.published
                                ? "Unpublish"
                                : "Publish"}
                          </button>
                          {row.publicationHistory.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setPublicationHistoryUserId(row.userId)}
                              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-[var(--ink-2)] hover:text-foreground"
                              title="View publish history"
                              aria-label="View publish history"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No gradable users found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>
      )}

      <Dialog open={Boolean(feedbackModalRow)} onOpenChange={(isOpen) => { if (!isOpen) setFeedbackModalUserId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Feedback</DialogTitle>
            {feedbackModalRow ? (
              <DialogDescription>{`${rowLabel(feedbackModalRow)} • Cycle ${activeCycleNumber}`}</DialogDescription>
            ) : null}
          </DialogHeader>
          {feedbackModalRow ? (
            <textarea
              value={feedbackModalRow.feedback}
              onChange={(event) => updateRowAndAutosave(feedbackModalRow.userId, { feedback: event.target.value })}
              rows={8}
              placeholder="Feedback for this user in this cycle..."
              className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
              autoFocus
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(publicationHistoryRow)} onOpenChange={(isOpen) => { if (!isOpen) setPublicationHistoryUserId(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Publish History</DialogTitle>
            {publicationHistoryRow ? (
              <DialogDescription>{`${rowLabel(publicationHistoryRow)} • Cycle ${activeCycleNumber}`}</DialogDescription>
            ) : null}
          </DialogHeader>
          {publicationHistoryRow ? (
            publicationHistoryRow.publicationHistory.length > 0 ? (
              <div className="space-y-2">
                {publicationHistoryRow.publicationHistory.map((event, index) => (
                  <div
                    key={`${event.eventType}-${event.occurredAt ?? index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm"
                  >
                    <span
                      className={cn(
                        "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                        event.eventType === "PUBLISHED"
                          ? "border-[var(--brand-green)]/35 bg-[var(--brand-green)]/10 text-[var(--brand-green)]"
                          : "border-amber-300/40 bg-amber-300/10 text-amber-100"
                      )}
                    >
                      {historyEventLabel(event.eventType)}
                    </span>
                    <span className="text-right text-foreground">{formatHistoryTimestamp(event.occurredAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No publish history recorded yet.</p>
            )
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(extensionNoteRow)} onOpenChange={(isOpen) => { if (!isOpen) setExtensionNoteUserId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Extension Exception</DialogTitle>
            {extensionNoteRow ? (
              <DialogDescription>{`${rowLabel(extensionNoteRow)} • Cycle ${activeCycleNumber}`}</DialogDescription>
            ) : null}
          </DialogHeader>
          {extensionNoteRow ? (
            <div className="space-y-3 text-sm text-foreground">
              <div className="rounded-lg border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-amber-100">
                {extensionExceptionSummary(extensionNoteRow) ?? "No free extension-day exception is applied."}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border bg-muted px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-[0.11em] text-muted-foreground">Final Cut</p>
                  <p className="mt-1 font-semibold text-foreground">{formatLongDate(activeCycle?.finalCutDate ?? null)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-[0.11em] text-muted-foreground">Turned In</p>
                  <p className="mt-1 font-semibold text-foreground">{formatLongDate(extensionNoteRow.turnedInDate)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-[0.11em] text-muted-foreground">Late Days</p>
                  <p className="mt-1 font-semibold text-foreground">{extensionNoteRow.extensionDetails.calculatedDays}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-[0.11em] text-muted-foreground">Free Days</p>
                  <p className="mt-1 font-semibold text-amber-100">{extensionNoteRow.extensionDetails.freeDays}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-[0.11em] text-muted-foreground">Charged Days</p>
                  <p className="mt-1 font-semibold text-[var(--brand-green)]">{extensionNoteRow.extensionDetails.chargedDays}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-[0.11em] text-muted-foreground">Exempt</p>
                  <p className="mt-1 font-semibold text-foreground">{extensionNoteRow.extensionDetails.exempt ? "Yes" : "No"}</p>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(totalsNotesRow)} onOpenChange={(isOpen) => { if (!isOpen) setTotalsNotesUserId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Total Grade Notes</DialogTitle>
            {totalsNotesRow ? (
              <DialogDescription>{totalsNotesRow.name?.trim() || "Unnamed user"}</DialogDescription>
            ) : null}
          </DialogHeader>
          {totalsNotesRow ? (
            <textarea
              value={getAdjustments(totalsNotesRow.userId).notes}
              onChange={(event) => updateNotes(totalsNotesRow.userId, event.target.value)}
              rows={8}
              placeholder="Notes for this reporter's total grade..."
              className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
              autoFocus
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(extensionDepletedWarning)} onOpenChange={(isOpen) => { if (!isOpen) setExtensionDepletedWarning(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>No Extensions Remaining</DialogTitle>
          </DialogHeader>
          {extensionDepletedWarning ? (
            <div className="space-y-3 text-sm text-foreground">
              <div className="rounded-lg border border-danger/40 bg-danger-tint px-3 py-2 text-danger">
                <p className="font-semibold">{extensionDepletedWarning.userName}</p>
                <p className="mt-1">
                  This student has exhausted their extension days ({extensionDepletedWarning.remaining} remaining).
                  The updated turn-in date caused their available extensions to be fully used.
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={missingOpen}
        onOpenChange={(isOpen) => {
          setMissingOpen(isOpen);
          if (!isOpen) setShowExcludePanel(false);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{showExcludePanel ? "Exclude People" : "Missing Grades"}</DialogTitle>
            <DialogDescription>
              {showExcludePanel
                ? "Excluded people are hidden from the missing list. Toggle to exclude or restore. Saved in this browser."
                : "People who have no grade entered, or a grade that is not yet published, for a started cycle."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowExcludePanel((value) => !value)}
            >
              {showExcludePanel ? (
                <>
                  <X className="mr-1.5 h-3.5 w-3.5" /> Back to missing
                </>
              ) : (
                <>
                  <UserMinus className="mr-1.5 h-3.5 w-3.5" /> Exclude People
                </>
              )}
            </Button>
            {excludedIds.length > 0 ? (
              <span className="text-xs text-[var(--ink-text)]">{excludedIds.length} excluded</span>
            ) : null}
          </div>

          <div className="mt-3 max-h-[60vh] overflow-y-auto pr-1">
            {missingLoading ? (
              <p className="py-8 text-center text-sm text-[var(--ink-text)]">Loading…</p>
            ) : missingError ? (
              <p className="py-8 text-center text-sm text-danger">{missingError}</p>
            ) : !missingData ? null : showExcludePanel ? (
              missingData.people.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--ink-text)]">No people to show.</p>
              ) : (
                <ul className="space-y-1">
                  {missingData.people.map((person) => (
                    <li key={person.userId}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-foreground/5">
                        <input
                          type="checkbox"
                          checked={isExcluded(person.userId)}
                          onChange={() => toggleExcluded(person.userId)}
                          className="h-4 w-4 accent-[var(--brand-green)]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-foreground">
                            {person.name?.trim() || "Unnamed user"}
                          </span>
                          {person.email ? (
                            <span className="block truncate text-xs text-[var(--ink-text)]">{person.email}</span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )
            ) : visibleMissing.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--ink-text)]">
                <ClipboardList className="mx-auto mb-2 h-5 w-5 opacity-70" />
                No missing grades. All caught up.
              </p>
            ) : (
              <ul className="space-y-2">
                {visibleMissing.map((person) => (
                  <li
                    key={person.userId}
                    className="flex items-start justify-between gap-3 rounded-md border border-foreground/[0.08] bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {person.name?.trim() || "Unnamed user"}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {person.missing.map((entry) => (
                          <span
                            key={entry.cycleNumber}
                            className={cn(
                              "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
                              entry.status === "not_entered"
                                ? "bg-danger-tint text-danger"
                                : "bg-[rgb(242,165,22,0.15)] text-[var(--brand-amber)]"
                            )}
                          >
                            Cycle {entry.cycleNumber} · {entry.status === "not_entered" ? "Not entered" : "Unpublished"}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => toggleExcluded(person.userId)}
                    >
                      <UserMinus className="mr-1.5 h-3.5 w-3.5" /> Exclude
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <section className="sticky bottom-4 z-20 mx-auto flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-xl border border-foreground/[0.08] bg-card p-1">
          {cycles.map((cycle) => {
            const isActive = viewMode === "cycle" && cycle.cycleNumber === activeCycleNumber;
            return (
              <button
                key={cycle.cycleNumber}
                type="button"
                onClick={() => goToCycle(cycle.cycleNumber)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.11em] transition",
                  isActive
                    ? "bg-[var(--brand-fill)] text-[var(--on-brand)]"
                    : "text-[var(--ink-text)] hover:bg-foreground/5 hover:text-foreground"
                )}
              >
                Cycle
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono-broadcast tabular-nums text-[10px] font-medium",
                    isActive ? "bg-black/25 text-[var(--on-brand)]" : "bg-foreground/10 text-[var(--ink-text)]"
                  )}
                >
                  {String(cycle.cycleNumber).padStart(2, "0")}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setViewMode(TOTAL_VIEW);
              void loadTotals({ silent: true });
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.11em] transition",
              viewMode === TOTAL_VIEW
                ? "bg-[var(--brand-fill)] text-[var(--on-brand)]"
                : "text-[var(--ink-text)] hover:bg-foreground/5 hover:text-foreground"
            )}
          >
            Total Grade
          </button>
          <button
            type="button"
            onClick={() => goToStudentView()}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.11em] transition",
              viewMode === STUDENT_VIEW
                ? "bg-[var(--brand-fill)] text-[var(--on-brand)]"
                : "text-[var(--ink-text)] hover:bg-foreground/5 hover:text-foreground"
            )}
          >
            <UserRound className="h-3.5 w-3.5" />
            Student
          </button>
        </div>
      </section>
    </div>
  );
}
