"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  CheckCheck,
  Download,
  FileUp,
  History,
  LoaderCircle,
  Plus,
  RefreshCcw,
  RotateCcw,
  Shield,
  Sparkles,
  Star,
  Trash2,
  Users,
  Wand2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Button as ShadButton } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { CustomDropdown } from "./components/ui/custom-dropdown";
import { Input } from "./components/ui/input";
import { Modal } from "./components/ui/simple-modal";
import { BACKUP_ROLES, ROLES } from "./lib/constants";
import {
  emptyShow,
  generateAssignments,
  getAnchorHistory,
  getRecencyByMember,
  getRecentAssigneesByFilmingDate,
  getShowByDate,
  getSuggestedAnchors,
  manualCandidates,
  normalizeHistory,
  repickRole,
  upsertShow,
} from "./lib/assignments";
import { formatDate, formatReadableDate, getCurrentShowDate, isShowDay, nextShowDate, parseDate } from "./lib/date";
import { checkSession, loadCastPool, loadHistory, loadNonAnchors, saveHistory, saveNonAnchors } from "./lib/api";

const PALETTE = ["av-green", "av-red", "av-blue", "av-purple", "av-gray"];

function showSortDesc(a, b) {
  return b.date.localeCompare(a.date);
}

function draftShow(show, dateStr) {
  const source = show ?? emptyShow(dateStr);
  return {
    ...source,
    assignments: { ...(source.assignments || {}) },
    anchors: [...(source.anchors || [])],
    confirmed: { ...(source.confirmed || {}) },
  };
}

function normalizeAnchors(anchorA, anchorB) {
  const unique = [];
  if (anchorA) unique.push(anchorA);
  if (anchorB && anchorB !== anchorA) unique.push(anchorB);
  return unique;
}

function initials(name) {
  if (!name) return "??";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function statusBadge(status) {
  if (status === "confirmed") return { label: "● Confirmed", cls: "status-approved" };
  if (status === "pending") return { label: "◐ Pending", cls: "status-warn" };
  return { label: "○ Unassigned", cls: "status-neutral" };
}

function diffInDays(targetStr) {
  if (!targetStr) return null;
  const target = parseDate(targetStr);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / 86_400_000);
}

function showDayMeta(dateStr) {
  const days = diffInDays(dateStr);
  if (days === null) return null;
  if (days === 0) return { kind: "live", label: "Live today" };
  if (days > 0)
    return { kind: "live", label: `Live in ${days} day${days === 1 ? "" : "s"}` };
  return { kind: "past", label: `Aired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago` };
}

function shortMonth(date) {
  return date?.toLocaleDateString("en-US", { month: "short" }) ?? "";
}

function dayOfWeek(date) {
  return date?.toLocaleDateString("en-US", { weekday: "short" }) ?? "";
}

export default function App() {
  const [sessionReady, setSessionReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const [history, setHistory] = useState({ shows: [] });
  const [currentShowDate, setCurrentShowDate] = useState("");
  const [viewDate, setViewDate] = useState("");

  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  const [notice, setNotice] = useState(null);
  const noticeTimeoutRef = useRef(null);

  const [manualRole, setManualRole] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  const [newShowOpen, setNewShowOpen] = useState(false);
  const [newShowDate, setNewShowDate] = useState("");

  const [members, setMembers] = useState([]);
  const [randomExempt, setRandomExempt] = useState([]);
  const [nonAnchors, setNonAnchors] = useState([]);
  const [anchorHistoryOpen, setAnchorHistoryOpen] = useState(false);
  const [savingNonAnchors, setSavingNonAnchors] = useState(false);

  const fileInputRef = useRef(null);

  const activeDate = viewDate || currentShowDate;
  const activeShow = useMemo(() => {
    if (!activeDate) return emptyShow("");
    return getShowByDate(history, activeDate) ?? emptyShow(activeDate);
  }, [activeDate, history]);

  const anchor1 = activeShow.anchors?.[0] ?? "";
  const anchor2 = activeShow.anchors?.[1] ?? "";

  const sortedShows = useMemo(() => [...history.shows].sort(showSortDesc), [history]);

  const exemptSet = useMemo(() => new Set(randomExempt), [randomExempt]);

  const anchorOptions = useMemo(
    () => [{ value: "none", label: "None" }, ...members.map((member) => ({ value: member, label: member }))],
    [members],
  );

  const setFlash = useCallback((variant, title, description) => {
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    setNotice({ variant, title, description });
    noticeTimeoutRef.current = setTimeout(() => {
      setNotice(null);
      noticeTimeoutRef.current = null;
    }, 5000);
  }, []);

  const persistHistory = useCallback(
    async (nextHistory, successMessage) => {
      setSaving(true);
      try {
        const saved = await saveHistory(nextHistory);
        const normalized = normalizeHistory(saved);
        setHistory(normalized);
        if (successMessage) setFlash("success", "Saved", successMessage);
        return normalized;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save changes.";
        setFlash("error", "Save failed", message);
        const lower = message.toLowerCase();
        if (lower.includes("session") || lower.includes("access denied")) setAuthenticated(false);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [setFlash],
  );

  const loadAppData = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [loaded, castPool] = await Promise.all([loadHistory(), loadCastPool()]);
      setMembers(castPool.members);
      setRandomExempt(castPool.randomExempt);
      const computedCurrent = formatDate(getCurrentShowDate());
      let next = normalizeHistory(loaded);
      if (!getShowByDate(next, computedCurrent)) {
        next = upsertShow(next, emptyShow(computedCurrent));
        next = await persistHistory(next);
      } else {
        setHistory(next);
      }
      setCurrentShowDate(computedCurrent);
      setViewDate((previous) => {
        if (previous && getShowByDate(next, previous)) return previous;
        return computedCurrent;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load data.";
      setFlash("error", "Load failed", message);
      const lower = message.toLowerCase();
      if (lower.includes("session") || lower.includes("access denied")) setAuthenticated(false);
    } finally {
      setLoadingHistory(false);
    }
  }, [persistHistory, setFlash]);

  const loadNonAnchorList = useCallback(async () => {
    try {
      const list = await loadNonAnchors();
      setNonAnchors(list);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load non-anchors.";
      const lower = message.toLowerCase();
      if (lower.includes("session") || lower.includes("access denied")) setAuthenticated(false);
    }
  }, []);

  const toggleNonAnchor = useCallback(
    async (name) => {
      const next = nonAnchors.includes(name)
        ? nonAnchors.filter((entry) => entry !== name)
        : [...nonAnchors, name];
      setNonAnchors(next);
      setSavingNonAnchors(true);
      try {
        const saved = await saveNonAnchors(next);
        setNonAnchors(saved);
      } catch (error) {
        setNonAnchors(nonAnchors);
        const message = error instanceof Error ? error.message : "Failed to update non-anchors.";
        setFlash("error", "Save failed", message);
        const lower = message.toLowerCase();
        if (lower.includes("session") || lower.includes("access denied")) setAuthenticated(false);
      } finally {
        setSavingNonAnchors(false);
      }
    },
    [nonAnchors, setFlash],
  );

  const mutateActiveShow = useCallback(
    async (mutator, successMessage) => {
      if (!activeDate) return;
      const sourceHistory = normalizeHistory(history);
      const draft = draftShow(getShowByDate(sourceHistory, activeDate), activeDate);
      mutator(draft);
      const next = upsertShow(sourceHistory, draft);
      await persistHistory(next, successMessage);
    },
    [activeDate, history, persistHistory],
  );

  useEffect(() => {
    let cancelled = false;
    async function hydrateSession() {
      try {
        const result = await checkSession();
        if (!cancelled) setAuthenticated(Boolean(result.authenticated));
      } catch {
        if (!cancelled) setAuthenticated(false);
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    }
    hydrateSession();
    return () => {
      cancelled = true;
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    loadAppData();
    loadNonAnchorList();
  }, [authenticated, loadAppData, loadNonAnchorList]);

  useEffect(() => {
    if (!authenticated) return undefined;
    const timer = setInterval(async () => {
      try {
        const fresh = normalizeHistory(await loadHistory());
        setHistory((previous) => {
          if (JSON.stringify(previous) === JSON.stringify(fresh)) return previous;
          return fresh;
        });
      } catch (error) {
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          if (message.includes("session") || message.includes("access denied")) setAuthenticated(false);
        }
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [authenticated]);

  useEffect(() => {
    if (!viewDate || !history.shows.length) return;
    if (!getShowByDate(history, viewDate)) setViewDate(currentShowDate);
  }, [viewDate, history, currentShowDate]);

  async function handleAnchorChange(slot, value) {
    const first = slot === 0 ? value : anchor1;
    const second = slot === 1 ? value : anchor2;
    const nextAnchors = normalizeAnchors(first, second);
    try {
      await mutateActiveShow((draft) => {
        draft.anchors = nextAnchors;
      }, "Anchor preferences updated.");
      if (activeDate) {
        const response = await fetch("/api/show-roles/anchors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: activeDate, names: nextAnchors, source: "manual" })
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          setFlash("error", "Calendar sync", payload.error?.message ?? "Could not save anchors to the calendar.");
        }
      }
    } catch {
      // persist layer surfaced error
    }
  }

  async function handleGenerateAssignments() {
    if (!activeDate) return;
    try {
      const generated = generateAssignments({
        history,
        dateStr: activeDate,
        anchors: activeShow.anchors || [],
        members,
        exempt: randomExempt,
      });
      await mutateActiveShow((draft) => {
        draft.assignments = generated;
        draft.confirmed = {};
      }, `Generated assignments for ${formatReadableDate(parseDate(activeDate))}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate assignments.";
      setFlash("error", "Generation failed", message);
    }
  }

  async function handleRepick(role) {
    const replacement = repickRole({
      history,
      dateStr: activeDate,
      role,
      anchors: activeShow.anchors || [],
      assignments: activeShow.assignments || {},
      members,
      exempt: randomExempt,
    });
    if (!replacement) {
      setFlash("error", "No candidates", "No eligible replacement is available for that role.");
      return;
    }
    try {
      await mutateActiveShow((draft) => {
        draft.assignments[role] = replacement;
        draft.confirmed[role] = false;
      }, `${role} reassigned to ${replacement}.`);
    } catch {
      // persist layer surfaced error
    }
  }

  async function handleManualSelect(person) {
    if (!manualRole) return;
    const existingRole = Object.keys(activeShow.assignments || {}).find(
      (roleName) => activeShow.assignments[roleName] === person,
    );
    try {
      await mutateActiveShow((draft) => {
        const previousPerson = draft.assignments[manualRole];
        if (existingRole && existingRole !== manualRole) {
          draft.assignments[existingRole] = previousPerson;
          draft.confirmed[existingRole] = false;
        }
        draft.assignments[manualRole] = person;
        draft.confirmed[manualRole] = false;
      }, existingRole ? `${person} swapped into ${manualRole}.` : `${person} assigned to ${manualRole}.`);
      setManualOpen(false);
      setManualRole("");
    } catch {
      // persist layer surfaced error
    }
  }

  async function handleToggleConfirm(role) {
    try {
      await mutateActiveShow((draft) => {
        const current = Boolean(draft.confirmed[role]);
        draft.confirmed[role] = !current;
      }, `Updated confirmation for ${role}.`);
    } catch {
      // persist layer surfaced error
    }
  }

  async function handleConfirmAll() {
    const filledRoles = [...ROLES, ...BACKUP_ROLES].filter(
      (role) => Boolean(activeShow.assignments?.[role]),
    );
    if (!filledRoles.length) {
      setFlash("error", "No assignments", "Generate assignments before confirming all roles.");
      return;
    }
    try {
      await mutateActiveShow((draft) => {
        filledRoles.forEach((role) => {
          draft.confirmed[role] = true;
        });
      }, `Confirmed ${filledRoles.length} role${filledRoles.length === 1 ? "" : "s"}.`);
    } catch {
      // persist layer surfaced error
    }
  }

  async function handleCreateNewShow() {
    const todayStr = formatDate(new Date());
    if (!newShowDate) {
      setFlash("error", "Date required", "Select a date for the new show.");
      return;
    }
    if (newShowDate < todayStr) {
      setFlash("error", "Invalid date", "Choose today or a future date.");
      return;
    }
    if (!isShowDay(newShowDate)) {
      setFlash("error", "Invalid show day", "Shows can only be created for a Wednesday or Friday school day.");
      return;
    }
    if (getShowByDate(history, newShowDate)) {
      setFlash("error", "Already exists", "A show already exists for that date.");
      return;
    }
    try {
      const source = normalizeHistory(history);
      const next = upsertShow(source, emptyShow(newShowDate));
      await persistHistory(next, `Created new show for ${formatReadableDate(parseDate(newShowDate))}.`);
      setCurrentShowDate(newShowDate);
      setViewDate(newShowDate);
      setNewShowOpen(false);
    } catch {
      // persist layer surfaced error
    }
  }

  async function handleClearHistory() {
    try {
      const currentDate = formatDate(getCurrentShowDate());
      let next = { shows: [] };
      next = upsertShow(next, emptyShow(currentDate));
      await persistHistory(next, "History cleared.");
      setCurrentShowDate(currentDate);
      setViewDate(currentDate);
    } catch {
      // persist layer surfaced error
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incomingShows = Array.isArray(parsed?.shows) ? parsed.shows : null;
      if (!incomingShows) {
        setFlash("error", "Invalid file", "JSON must include a shows array.");
        return;
      }
      const byDate = new Map(history.shows.map((show) => [show.date, show]));
      let added = 0;
      incomingShows.forEach((show) => {
        if (!show?.date || byDate.has(show.date)) return;
        byDate.set(show.date, {
          date: show.date,
          assignments: show.assignments || {},
          anchors: Array.isArray(show.anchors) ? show.anchors.filter(Boolean).slice(0, 2) : [],
          confirmed: show.confirmed || {},
        });
        added += 1;
      });
      if (added === 0) {
        setFlash("error", "No new shows", "The file does not contain any new show dates.");
        return;
      }
      const merged = { shows: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)) };
      await persistHistory(merged, `Imported ${added} show${added === 1 ? "" : "s"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      setFlash("error", "Import failed", message);
    }
  }

  async function handleDownloadBackup() {
    const payload = {
      metadata: {
        backupDate: new Date().toISOString(),
        currentShowDate,
        totalShows: history.shows.length,
        version: "2.0",
      },
      shows: history.shows,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const dateStamp = formatDate(new Date());
    const link = document.createElement("a");
    link.href = href;
    link.download = `show_roles_backup_${dateStamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    setFlash("success", "Backup downloaded", "JSON backup exported successfully.");
  }

  const anchorHistoryRows = useMemo(
    () => getAnchorHistory(history, nonAnchors, members, randomExempt),
    [history, nonAnchors, members, randomExempt],
  );

  const suggestedAnchors = useMemo(
    () => getSuggestedAnchors(anchorHistoryRows, 2),
    [anchorHistoryRows],
  );

  const manualCandidatesForRole = useMemo(() => {
    if (!manualRole) return [];
    return manualCandidates(activeShow.anchors || [], activeShow.assignments?.[manualRole] || "", members);
  }, [manualRole, activeShow, members]);

  // Member pool grouping
  const pool = useMemo(() => {
    const assignedNames = new Set([
      ...(activeShow.anchors || []),
      ...Object.values(activeShow.assignments || {}).filter(Boolean),
    ]);
    const cooldownNames = getRecentAssigneesByFilmingDate(history, activeDate, activeDate);
    const recency = getRecencyByMember(history, activeDate, members);
    const priorShowCount = history.shows.filter((show) => show.date < activeDate).length;
    const groups = { assigned: [], available: [], cooldown: [], exempt: [] };
    members.forEach((member) => {
      const entry = { name: member, recency: recency[member] <= priorShowCount ? recency[member] : null };
      if (assignedNames.has(member)) {
        groups.assigned.push(entry);
      } else if (exemptSet.has(member)) {
        groups.exempt.push(entry);
      } else if (cooldownNames.has(member)) {
        groups.cooldown.push(entry);
      } else {
        groups.available.push(entry);
      }
    });
    return groups;
  }, [activeShow, history, activeDate, members, exemptSet]);

  const roleOf = useMemo(() => {
    const map = {};
    Object.entries(activeShow.assignments || {}).forEach(([role, person]) => {
      if (person) map[person] = role;
    });
    if (anchor1) map[anchor1] = "Anchor 1";
    if (anchor2) map[anchor2] = "Anchor 2";
    return map;
  }, [activeShow, anchor1, anchor2]);

  const activeDateObj = activeDate ? parseDate(activeDate) : null;
  const showStatus = showDayMeta(activeDate);
  const filledRoles = ROLES.filter((role) => Boolean(activeShow.assignments?.[role])).length;
  const confirmedCount = ROLES.filter((role) => Boolean(activeShow.confirmed?.[role])).length;
  const confirmPct = ROLES.length ? (confirmedCount / ROLES.length) * 100 : 0;

  if (!sessionReady) {
    return (
      <div className="route-enter flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Checking session
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="route-enter flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Shield className="h-5 w-5" />
              <span className="text-xs uppercase tracking-[0.22em]">Secure Access</span>
            </div>
            <CardTitle>InFocus Show Roles Generator</CardTitle>
            <CardDescription>Sign in to access assignments and scheduling data.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full rounded-xl font-semibold"
              type="button"
              onClick={() => window.location.assign("/sign-in?returnTo=%2Fshow-roles")}
            >
              Sign in with Google
            </Button>
            {notice ? (
              <Alert variant={notice.variant === "error" ? "destructive" : "default"} className="mt-4 border-primary/20">
                {notice.variant === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                <AlertTitle>{notice.title}</AlertTitle>
                <AlertDescription>{notice.description}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="route-enter mx-auto w-full max-w-[1320px] space-y-4">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:px-7 md:py-6">
        <div
          className="pointer-events-none absolute -right-12 -top-32 h-[380px] w-[380px] rounded-full opacity-90"
          style={{ background: "radial-gradient(circle, rgba(43,179,110,0.18) 0%, transparent 60%)" }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              Spring &apos;26 · Show Day
            </div>
            <h1 className="display-md mt-2 text-foreground">Show Roles Generator</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Auto-rotate crew roles per broadcast. Anchors come from the master calendar. Show days are{" "}
              <strong className="text-foreground">Wednesday &amp; Friday</strong>.
            </p>
          </div>
          <div className="relative flex items-center gap-2">
            <ShadButton
              type="button"
              onClick={handleGenerateAssignments}
              disabled={saving || loadingHistory || !activeDate || members.length === 0}
            >
              <Wand2 className="mr-2 h-4 w-4" />
              Generate Roles
            </ShadButton>
          </div>
        </div>
      </section>

      {notice ? (
        <Alert variant={notice.variant === "error" ? "destructive" : "default"}>
          {notice.variant === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.description}</AlertDescription>
        </Alert>
      ) : null}

      {/* Layout: main + member pool sidebar */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Main column */}
        <div className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            {/* Card head */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="font-display text-[22px] italic font-bold uppercase leading-none tracking-tight text-foreground">
                {showStatus?.kind === "past" ? "Past Show" : "Active Show"}
              </h2>
              <div className="flex items-center gap-2 font-mono-broadcast text-[11px] text-muted-foreground">
                <span className="rounded-full border border-border bg-[var(--ink)] px-2.5 py-0.5 text-foreground">
                  Show #{history.shows.filter((show) => show.date <= activeDate).length}
                </span>
                <span>{filledRoles}/{ROLES.length} filled</span>
              </div>
            </div>

            {/* Show strip: date tile + show tabs */}
            <div className="grid grid-cols-1 items-center gap-4 border-b border-border bg-[var(--ink)] px-5 py-4 md:grid-cols-[auto_1fr_auto]">
              <div className="flex items-center gap-3.5">
                <div className="w-[64px] flex-shrink-0 rounded-xl border border-border bg-[var(--ink-2)] py-2 text-center">
                  <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand-green)]">
                    {activeDateObj ? dayOfWeek(activeDateObj) : "—"}
                  </div>
                  <div className="mt-0.5 font-display italic text-[28px] font-extrabold leading-none text-foreground">
                    {activeDateObj ? String(activeDateObj.getDate()).padStart(2, "0") : "—"}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {activeDateObj ? shortMonth(activeDateObj) : ""}
                  </div>
                </div>
                <div>
                  <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Broadcast Date
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[15px] font-semibold text-foreground">
                    {activeDateObj ? formatReadableDate(activeDateObj) : "—"}
                    {showStatus ? (
                      <span
                        className={
                          showStatus.kind === "live"
                            ? "inline-flex items-center gap-1.5 rounded-full border border-[rgb(238,58,42,0.3)] bg-[rgb(238,58,42,0.12)] px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--brand-red)]"
                            : "inline-flex items-center gap-1.5 rounded-full border border-[rgb(242,165,22,0.3)] bg-[rgb(242,165,22,0.12)] px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--brand-amber)]"
                        }
                      >
                        {showStatus.kind === "live" ? <span className="rec-dot" /> : null}
                        {showStatus.label}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div />
              {/* Show tabs */}
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-[var(--ink)] p-1">
                <CustomDropdown
                  ariaLabel="View show, including past shows"
                  value={activeDate}
                  options={sortedShows.map((show) => ({
                    value: show.date,
                    label: formatReadableDate(parseDate(show.date)),
                    hint: show.date === currentShowDate ? "Current" : undefined,
                  }))}
                  onChange={setViewDate}
                  disabled={loadingHistory || saving}
                  className="w-full"
                  buttonClassName="h-8 text-xs"
                  placeholder="View past shows"
                />
                {sortedShows.slice(0, 4).reverse().map((show) => {
                  const dateObj = parseDate(show.date);
                  const isOn = show.date === activeDate;
                  return (
                    <button
                      key={show.date}
                      type="button"
                      onClick={() => setViewDate(show.date)}
                      className={
                        isOn
                          ? "rounded-md border border-border bg-[var(--ink-2)] px-3 py-1.5 text-xs font-semibold text-foreground"
                          : "rounded-md border border-transparent px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      }
                    >
                      {dateObj?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? show.date}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setNewShowDate(formatDate(nextShowDate(parseDate(currentShowDate || formatDate(new Date())))));
                    setNewShowOpen(true);
                  }}
                  className="rounded-md border border-transparent px-2.5 py-1.5 text-xs font-semibold text-[var(--brand-amber)] hover:bg-[rgb(242,165,22,0.10)]"
                >
                  + New
                </button>
              </div>
            </div>

            {/* Anchors row */}
            <div className="grid grid-cols-1 gap-3 border-b border-border px-5 py-4 md:grid-cols-2">
              {[0, 1].map((slot) => {
                const value = slot === 0 ? anchor1 : anchor2;
                const av = PALETTE[(slot + 2) % PALETTE.length];
                return (
                  <div key={slot} className="flex items-center gap-3 rounded-xl border border-border bg-[var(--ink)] p-3.5">
                    <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-border bg-[var(--ink-2)] font-display text-[14px] italic font-extrabold text-[var(--brand-green)]">
                      A{slot + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-5)]">
                        Anchor {slot + 1}
                      </div>
                      <div className="mt-1 flex items-center gap-2.5">
                        {value ? (
                          <div className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold ${av}`}>
                            {initials(value)}
                          </div>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <CustomDropdown
                            ariaLabel={`Anchor ${slot + 1}`}
                            value={value || "none"}
                            options={anchorOptions}
                            onChange={(next) => handleAnchorChange(slot, next === "none" ? "" : next)}
                            buttonClassName="h-8 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
              <button
                type="button"
                onClick={handleConfirmAll}
                disabled={saving || loadingHistory}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[rgb(43,179,110,0.30)] bg-[rgb(43,179,110,0.10)] px-3 text-xs font-semibold text-[var(--brand-green)] transition hover:bg-[rgb(43,179,110,0.18)] disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Confirm All
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewShowDate(formatDate(nextShowDate(parseDate(currentShowDate || formatDate(new Date())))));
                  setNewShowOpen(true);
                }}
                disabled={saving || loadingHistory}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[rgb(242,165,22,0.30)] bg-[rgb(242,165,22,0.12)] px-3 text-xs font-semibold text-[var(--brand-amber)] transition hover:bg-[rgb(242,165,22,0.20)] disabled:opacity-50"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                New Show
              </button>
              <button
                type="button"
                onClick={() => setAnchorHistoryOpen(true)}
                disabled={loadingHistory}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-[var(--ink)] px-3 text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                <History className="h-3.5 w-3.5" />
                Anchor History
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={loadAppData}
                disabled={loadingHistory || saving}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-[var(--ink)] px-3 text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${loadingHistory ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleImportClick}
                disabled={saving || loadingHistory}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-[var(--ink)] px-3 text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                <FileUp className="h-3.5 w-3.5" />
                Import JSON
              </button>
              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={loadingHistory}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-[var(--ink)] px-3 text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Backup
              </button>
              <button
                type="button"
                onClick={() => {
                  const ok = window.confirm(
                    "Clear all saved shows and keep only the current show slot? This cannot be undone.",
                  );
                  if (ok) handleClearHistory();
                }}
                disabled={saving || loadingHistory}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-[var(--ink)] px-3 text-xs font-semibold text-muted-foreground transition hover:text-[var(--brand-red)] disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear History
              </button>
            </div>

            {/* Roles section */}
            <div className="px-5 py-5">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <h3 className="font-display text-[22px] italic font-bold uppercase leading-none tracking-tight text-foreground">
                  Role Assignments
                </h3>
                <div className="flex items-center gap-3 font-mono-broadcast text-[11px] text-muted-foreground">
                  <span>
                    <strong className="text-[var(--brand-green)]">{confirmedCount}</strong> / {ROLES.length} confirmed
                  </span>
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[var(--ink-2)]">
                    <div className="h-full bg-[var(--brand-green)] transition-all" style={{ width: `${confirmPct}%` }} />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[...ROLES, ...BACKUP_ROLES].map((role, index) => {
                  const isBackup = BACKUP_ROLES.includes(role);
                  const assignee = activeShow.assignments?.[role];
                  const confirmed = Boolean(activeShow.confirmed?.[role]);
                  const status = !assignee ? "empty" : confirmed ? "confirmed" : "pending";
                  const badge = statusBadge(status);
                  const av = PALETTE[index % PALETTE.length];
                  const recency = pool.assigned.find((entry) => entry.name === assignee)?.recency;
                  const lastLabel =
                    typeof recency === "number" && recency > 0 && recency < 25
                      ? `${recency} show${recency === 1 ? "" : "s"} ago`
                      : assignee
                        ? "First time"
                        : "";

                  const cardCls = [
                    "relative flex flex-col gap-3 rounded-xl border bg-[var(--ink)] p-4 transition",
                    status === "confirmed"
                      ? "border-[rgb(43,179,110,0.40)] before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:rounded-t-xl before:bg-[var(--brand-green)] before:content-['']"
                      : status === "empty"
                        ? "border-dashed border-[var(--ink-3)]"
                        : "border-border hover:border-[var(--ink-4)]",
                    isBackup ? "border-dashed" : "",
                  ].join(" ");

                  return (
                    <article key={role} className={cardCls}>
                      <div className="flex items-center justify-between">
                        <span className="font-display text-[13px] italic font-extrabold tracking-wide text-[var(--ink-5)]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className={`status-pill ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <h4 className="font-display text-[20px] italic font-bold uppercase leading-none tracking-tight text-foreground">
                        {role}
                      </h4>
                      {assignee ? (
                        <div className="flex items-center gap-2.5 rounded-lg bg-[var(--ink-2)] p-2.5">
                          <div className={`grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold ${av}`}>
                            {initials(assignee)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-foreground">{assignee}</div>
                          </div>
                          <div className="font-mono-broadcast text-[10px] text-[var(--ink-5)]">
                            {lastLabel || "Assigned"}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-[var(--ink-3)] bg-[var(--ink-2)] px-3 py-3 text-center text-xs text-[var(--ink-5)]">
                          No member assigned yet
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        {assignee ? (
                          <>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleRepick(role)}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-[rgb(242,165,22,0.30)] bg-[rgb(242,165,22,0.10)] px-2 py-1.5 text-[11px] font-semibold text-[var(--brand-amber)] transition hover:bg-[rgb(242,165,22,0.20)] disabled:opacity-50"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Re-pick
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => {
                                setManualRole(role);
                                setManualOpen(true);
                              }}
                              className="flex-1 rounded-md border border-border bg-[var(--ink-2)] px-2 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-[var(--ink-4)] hover:text-foreground disabled:opacity-50"
                            >
                              Manual
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleToggleConfirm(role)}
                              className={
                                confirmed
                                  ? "flex-1 rounded-md border border-[rgb(242,165,22,0.25)] bg-[var(--ink-2)] px-2 py-1.5 text-[11px] font-semibold text-[var(--brand-amber)] hover:border-[rgb(242,165,22,0.4)] disabled:opacity-50"
                                  : "flex-1 rounded-md border border-[rgb(43,179,110,0.30)] bg-[rgb(43,179,110,0.10)] px-2 py-1.5 text-[11px] font-semibold text-[var(--brand-green)] hover:bg-[rgb(43,179,110,0.20)] disabled:opacity-50"
                              }
                            >
                              {confirmed ? "Unconfirm" : "✓ Confirm"}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => {
                              setManualRole(role);
                              setManualOpen(true);
                            }}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-[var(--ink-2)] px-2 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-[var(--ink-4)] hover:text-foreground disabled:opacity-50"
                          >
                            <Plus className="h-3 w-3" />
                            Pick member
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Member pool sidebar */}
        <aside className="lg:sticky lg:top-4 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3.5">
            <h3 className="font-display text-[18px] italic font-bold uppercase leading-none tracking-tight text-foreground">
              Member Pool
            </h3>
            <p className="mt-1 font-mono-broadcast text-[11px] text-muted-foreground">
              {members.length} members · {pool.exempt.length} exempt · {pool.cooldown.length} on cooldown
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">Last role before this show · 2-show cooldown</p>
          </div>
          <div className="max-h-[680px] overflow-y-auto">
            {[
              { key: "assigned", label: "On This Show", items: pool.assigned },
              { key: "available", label: "Available", items: pool.available },
              { key: "cooldown", label: "On Cooldown", items: pool.cooldown },
              { key: "exempt", label: "Exempt", items: pool.exempt },
            ].map((section, sIdx) => (
              <div key={section.key} className="px-3 py-2">
                <div className="flex items-center gap-2 px-1 py-1.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-5)]">
                  <Users className="h-3 w-3" />
                  {section.label}
                  <span className="rounded-full border border-border bg-[var(--ink)] px-1.5 py-0 font-mono-broadcast text-[10px] text-muted-foreground">
                    {section.items.length}
                  </span>
                </div>
                {section.items.length === 0 ? (
                  <div className="px-2 pb-1 text-[11px] italic text-muted-foreground">No members</div>
                ) : (
                  section.items.map((entry, idx) => {
                    const av = PALETTE[(sIdx * 7 + idx) % PALETTE.length];
                    const rowCls = [
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground transition",
                      section.key === "assigned"
                        ? "bg-[rgb(43,179,110,0.06)]"
                        : section.key === "exempt"
                          ? "opacity-60"
                          : "hover:bg-[var(--ink)]",
                    ].join(" ");
                    return (
                      <div key={entry.name} className={rowCls}>
                        <div className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${av}`}>
                          {initials(entry.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium" title={entry.name}>{entry.name}</div>
                          {section.key === "assigned" ? (
                            <div className="truncate text-[9px] text-[var(--brand-green)]" title={roleOf[entry.name]}>
                              {roleOf[entry.name] ?? "Crew"}
                            </div>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 whitespace-nowrap font-mono-broadcast text-[10px] ${section.key === "cooldown" ? "text-[var(--brand-amber)]" : "text-muted-foreground"}`}
                          title={entry.recency == null ? "No earlier crew, anchor, or associate show-manager assignment in saved shows" : `Last role: ${entry.recency} show${entry.recency === 1 ? "" : "s"} before this show`}
                        >
                          {entry.recency == null ? "Never" : `${entry.recency} show${entry.recency === 1 ? "" : "s"} ago`}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>

      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />

      <Modal
        open={manualOpen}
        onClose={() => {
          setManualOpen(false);
          setManualRole("");
        }}
        title={`Manual assignment for ${manualRole}`}
        description="Selecting someone already assigned to another role will swap the two assignments."
      >
        <div className="max-h-[360px] space-y-2 overflow-y-auto">
          {manualCandidatesForRole.map((candidate) => {
            const assignedRole = Object.keys(activeShow.assignments || {}).find(
              (roleName) => activeShow.assignments?.[roleName] === candidate,
            );
            return (
              <Button
                key={`manual-${candidate}`}
                type="button"
                variant={assignedRole ? "secondary" : "outline"}
                className="w-full justify-between"
                onClick={() => handleManualSelect(candidate)}
              >
                <span>{candidate}</span>
                {assignedRole ? <span className="text-xs">Currently {assignedRole}</span> : null}
              </Button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={() => setManualOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>

      <Modal
        open={anchorHistoryOpen}
        onClose={() => setAnchorHistoryOpen(false)}
        title="Anchor History"
        description="Sorted by least recently anchored. Top two eligible members are suggested."
      >
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left font-display font-bold">Member</th>
                <th className="px-2 py-2 text-right font-display font-bold">Times</th>
                <th className="px-2 py-2 text-right font-display font-bold">Last Anchored</th>
                <th className="px-2 py-2 text-center font-display font-bold">Non-anchor</th>
              </tr>
            </thead>
            <tbody>
              {anchorHistoryRows.map((row) => {
                const isSuggested = suggestedAnchors.includes(row.name);
                const lastDateObj = row.lastDate ? parseDate(row.lastDate) : null;
                const lastLabel = lastDateObj ? formatReadableDate(lastDateObj) : "Never";
                const rowCls = [
                  "border-t border-border transition",
                  isSuggested
                    ? "bg-[rgb(43,179,110,0.08)]"
                    : row.isNonAnchor
                      ? "opacity-60"
                      : row.isExempt
                        ? "opacity-50"
                        : "hover:bg-[var(--ink)]",
                ].join(" ");
                return (
                  <tr key={row.name} className={rowCls}>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        {isSuggested ? (
                          <Star className="h-3.5 w-3.5 fill-[var(--brand-green)] text-[var(--brand-green)]" />
                        ) : (
                          <span className="inline-block h-3.5 w-3.5" />
                        )}
                        <span className="font-medium text-foreground">{row.name}</span>
                        {isSuggested ? (
                          <span className="rounded-md bg-[rgb(43,179,110,0.12)] px-1.5 py-0.5 font-display text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-green)]">
                            Suggested
                          </span>
                        ) : null}
                        {row.isExempt ? (
                          <span className="rounded-md border border-border px-1.5 py-0.5 font-display text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Exempt
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-mono-broadcast text-[12px] text-foreground">
                      {row.count}
                    </td>
                    <td className="px-2 py-2 text-right font-mono-broadcast text-[11px] text-muted-foreground">
                      {lastLabel}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.isNonAnchor}
                        disabled={savingNonAnchors}
                        onChange={() => toggleNonAnchor(row.name)}
                        aria-label={`Mark ${row.name} as non-anchor`}
                        className="h-4 w-4 cursor-pointer accent-[var(--brand-amber)]"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="font-mono-broadcast text-[11px] text-muted-foreground">
            {nonAnchors.length} marked as non-anchor
          </div>
          <Button variant="ghost" onClick={() => setAnchorHistoryOpen(false)}>
            Close
          </Button>
        </div>
      </Modal>

      <Modal
        open={newShowOpen}
        onClose={() => setNewShowOpen(false)}
        title="Create a new show"
        description="Select a Tuesday or Thursday date."
      >
        <div className="space-y-2">
          <label htmlFor="new-show-date" className="text-sm font-medium leading-none">
            Show date
          </label>
          <Input
            id="new-show-date"
            type="date"
            min={formatDate(new Date())}
            value={newShowDate}
            onChange={(event) => setNewShowDate(event.target.value)}
            className="interactive-surface"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setNewShowOpen(false)}>
            Cancel
          </Button>
          <Button variant="warning" onClick={handleCreateNewShow}>
            <Calendar className="mr-2 h-4 w-4" />
            Create show
          </Button>
        </div>
      </Modal>

      {(saving || loadingHistory) && (
        <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {saving ? "Saving changes" : "Refreshing data"}
        </div>
      )}
    </div>
  );
}
