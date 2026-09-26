"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Check, ChevronLeft, ChevronRight, Inbox, Loader2, MessageSquare, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { PARTICIPATION_POINTS_PER_WEEK, sumParticipationMax } from "@/src/lib/grading";
import { type NameSortKey, sortNamedPeople } from "@/src/lib/name-sort";
import { cn } from "@/src/lib/utils";

const NOTE_MAX = 600;

type Student = {
  id: string;
  name: string | null;
  email: string | null;
};

type Entry = {
  userId: string;
  date: string;
  points: number;
  notes: string;
};

type DayLimit = {
  date: string;
  maxPoints: number;
};

type PendingItem = {
  requestId: string;
  userId: string;
  date: string;
  points: number;
  notes: string;
  requestedBy: { id: string; name: string | null; email: string | null };
};

type QueueItem = {
  userId: string;
  studentName: string | null;
  studentEmail: string | null;
  date: string;
  points: number;
  notes: string;
  currentPoints: number | null;
  currentNotes: string;
};

type QueueRequest = {
  id: string;
  createdAt: string;
  requestedBy: { id: string; name: string | null; email: string | null };
  canReview: boolean;
  items: QueueItem[];
};

type WeekData = {
  students: Student[];
  entries: Entry[];
  maxPointsByDate: DayLimit[];
  pendingCount: number;
  pendingItems: PendingItem[];
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Monday-anchored week start for a given date. */
function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatWeekLabel(weekStart: Date) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 4);

  const format = (value: Date) =>
    value.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return `${format(weekStart)} – ${format(end)}`;
}

function entryKey(userId: string, date: string) {
  return `${userId}:${date}`;
}

function personLabel(person: { name: string | null; email: string | null }) {
  return person.name ?? person.email ?? "Unknown";
}

function formatDayKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

export default function ParticipationClient() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [data, setData] = useState<WeekData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteTarget, setNoteTarget] = useState<{ userId: string; dateKey: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sortBy, setSortBy] = useState<NameSortKey>("lastName");
  const [queueOpen, setQueueOpen] = useState(false);
  const [queue, setQueue] = useState<QueueRequest[] | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const weekStartKey = toDateKey(weekStart);

  // Only class days are graded; weekends carry no participation points.
  const classDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, offset) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + offset);
      return date;
    });
  }, [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(`/api/participation?weekStart=${weekStartKey}`, {
        cache: "no-store"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to load participation.");
      }

      const week = payload.data as WeekData;
      setData(week);
      const nextDrafts: Record<string, number> = {};
      const nextNotes: Record<string, string> = {};
      for (const entry of week.entries) {
        nextDrafts[entryKey(entry.userId, entry.date)] = entry.points;
        nextNotes[entryKey(entry.userId, entry.date)] = entry.notes;
      }
      for (const item of week.pendingItems ?? []) {
        nextDrafts[entryKey(item.userId, item.date)] = item.points;
        nextNotes[entryKey(item.userId, item.date)] = item.notes;
      }
      setDrafts(nextDrafts);
      setNoteDrafts(nextNotes);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load participation.");
    } finally {
      setLoading(false);
    }
  }, [weekStartKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const response = await fetch("/api/participation/requests", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to load pending requests.");
      }
      setQueue((payload.data?.requests ?? []) as QueueRequest[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load pending requests.");
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!queueOpen) return;
    void loadQueue();
  }, [queueOpen, loadQueue]);

  const maxByDate = useMemo(() => {
    return new Map((data?.maxPointsByDate ?? []).map((entry) => [entry.date, entry.maxPoints]));
  }, [data]);

  const weekPossible = useMemo(
    () => sumParticipationMax(data?.maxPointsByDate ?? []),
    [data]
  );

  const students = useMemo(() => sortNamedPeople(data?.students ?? [], sortBy), [data, sortBy]);

  const pendingKeys = useMemo(() => {
    return new Set((data?.pendingItems ?? []).map((item) => entryKey(item.userId, item.date)));
  }, [data]);

  const pendingCount = data?.pendingCount ?? 0;

  function shiftWeek(weeks: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + weeks * 7);
    setWeekStart(startOfWeek(next));
  }

  function setPoints(userId: string, dateKey: string, raw: string) {
    const max = maxByDate.get(dateKey) ?? 20;
    const parsed = Number(raw);
    const points = Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.round(parsed))) : 0;

    setDrafts((current) => ({ ...current, [entryKey(userId, dateKey)]: points }));
  }

  function fillWeek(userId: string) {
    setDrafts((current) => {
      const next = { ...current };
      classDays.forEach((day) => {
        const dateKey = toDateKey(day);
        next[entryKey(userId, dateKey)] = maxByDate.get(dateKey) ?? 20;
      });
      return next;
    });
  }

  function fillDay(dateKey: string) {
    const max = maxByDate.get(dateKey) ?? 20;
    setDrafts((current) => {
      const next = { ...current };
      for (const student of students) {
        next[entryKey(student.id, dateKey)] = max;
      }
      return next;
    });
  }

  async function save() {
    if (!data) return;

    setSaving(true);

    try {
      const entries = Object.entries(drafts).map(([key, points]) => {
        const [userId, date] = key.split(":");
        return {
          userId,
          date,
          points,
          notes: (noteDrafts[key] ?? "").trim().slice(0, NOTE_MAX)
        };
      });

      const response = await fetch("/api/participation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to save participation.");
      }

      const result = payload.data as {
        pending?: boolean;
        itemCount?: number;
        saved?: number;
        emailed?: boolean;
      };
      const saved = result.saved ?? 0;
      const queued = result.pending ? (result.itemCount ?? 0) : 0;
      const mailed = result.emailed ? " The adviser and other executive producers were emailed." : "";
      if (saved > 0 && queued > 0) {
        toast.success(
          `Saved ${saved} full-mark score${saved === 1 ? "" : "s"}. Sent ${queued} docked score${queued === 1 ? "" : "s"} for approval.${mailed}`
        );
      } else if (queued > 0) {
        toast.success(
          `Sent ${queued} docked score${queued === 1 ? "" : "s"} for the adviser or another producer to approve.${mailed}`
        );
      } else if (saved > 0) {
        toast.success("Participation saved.");
      } else {
        toast.message("No participation changes to submit.");
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save participation.");
    } finally {
      setSaving(false);
    }
  }

  async function decide(requestId: string, approved: boolean) {
    setDecidingId(requestId);
    try {
      const response = await fetch("/api/participation/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, approved })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to review request.");
      }
      toast.success(approved ? "Participation grades posted." : "Request denied. Live scores unchanged.");
      await Promise.all([load(), loadQueue()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to review request.");
    } finally {
      setDecidingId(null);
    }
  }

  function weekTotal(userId: string) {
    return classDays.reduce((total, day) => {
      return total + (drafts[entryKey(userId, toDateKey(day))] ?? 0);
    }, 0);
  }

  function setNote(userId: string, dateKey: string, notes: string) {
    setNoteDrafts((current) => ({
      ...current,
      [entryKey(userId, dateKey)]: notes.slice(0, NOTE_MAX)
    }));
  }

  const noteStudent = noteTarget
    ? students.find((student) => student.id === noteTarget.userId)
    : null;
  const noteDay = noteTarget
    ? classDays.find((day) => toDateKey(day) === noteTarget.dateKey)
    : null;
  const noteKey = noteTarget ? entryKey(noteTarget.userId, noteTarget.dateKey) : "";
  const noteMax = noteTarget ? (maxByDate.get(noteTarget.dateKey) ?? 20) : 20;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Classroom Participation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            35% of the grade. {PARTICIPATION_POINTS_PER_WEEK} points a week — 10 on Mondays (PA), 20 on
            Tue/Thu class; Wed/Fri shows and holidays off. Full marks post immediately. Docked scores
            need the adviser or another producer to approve.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex min-w-[10.5rem] items-center rounded-md border border-border bg-muted">
            <div className="pointer-events-none pl-2 text-muted-foreground">
              <ArrowUpDown className="h-3.5 w-3.5" />
            </div>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as NameSortKey)}>
              <SelectTrigger className="h-9 w-[9.5rem] border-0 bg-transparent shadow-none" aria-label="Sort students">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastName">Last name</SelectItem>
                <SelectItem value="firstName">First name</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="secondary" size="icon" onClick={() => shiftWeek(-1)} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium text-foreground">
            {formatWeekLabel(weekStart)}
          </span>
          <Button variant="secondary" size="icon" onClick={() => shiftWeek(1)} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setQueueOpen(true)}
            className={cn(
              pendingCount > 0 &&
                "border border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
            )}
          >
            <Inbox className="h-4 w-4" />
            Pending
            <span className="tabular-nums">{pendingCount}</span>
          </Button>
          <Button onClick={() => void save()} disabled={saving || loading}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </header>

      {loading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading participation…</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Student</th>
                {classDays.map((day) => {
                  const dateKey = toDateKey(day);
                  const max = maxByDate.get(dateKey) ?? 20;
                  return (
                    <th key={day.toISOString()} className="px-3 py-3 text-center font-medium text-muted-foreground">
                      <div className="flex items-center justify-center gap-1">
                        <span>
                          {WEEKDAY_LABELS[day.getDay()]}
                          <span className="ml-1 text-xs opacity-60">/{max}</span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5"
                          disabled={max <= 0}
                          aria-label={`Give everyone full marks for ${WEEKDAY_LABELS[day.getDay()]}`}
                          onClick={() => fillDay(dateKey)}
                        >
                          Full
                        </Button>
                      </div>
                    </th>
                  );
                })}
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">Total</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-t border-border">
                  <td className="px-4 py-2 text-foreground">{student.name ?? student.email}</td>
                  {classDays.map((day) => {
                    const dateKey = toDateKey(day);
                    const max = maxByDate.get(dateKey) ?? 20;
                    const key = entryKey(student.id, dateKey);
                    const note = (noteDrafts[key] ?? "").trim();
                    const hasScore = drafts[key] !== undefined;
                    const isPending = pendingKeys.has(key);
                    return (
                      <td key={dateKey} className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={max}
                            value={drafts[key] ?? ""}
                            onChange={(event) => setPoints(student.id, dateKey, event.target.value)}
                            title={isPending ? "Waiting for another producer to approve" : undefined}
                            className={cn(
                              "h-9 w-16 rounded-md border bg-muted px-2 text-center text-foreground outline-none",
                              isPending
                                ? "border-amber-400/70 text-amber-100"
                                : "border-border"
                            )}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-8 w-8 shrink-0",
                              note ? "text-foreground" : "text-muted-foreground"
                            )}
                            disabled={max <= 0 && !hasScore && !note}
                            aria-label={
                              note
                                ? `Edit comment for ${student.name ?? student.email} on ${WEEKDAY_LABELS[day.getDay()]}`
                                : `Add comment for ${student.name ?? student.email} on ${WEEKDAY_LABELS[day.getDay()]}`
                            }
                            onClick={() => setNoteTarget({ userId: student.id, dateKey })}
                          >
                            <MessageSquare className={cn("h-3.5 w-3.5", note && "fill-current")} />
                          </Button>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center font-medium text-foreground">
                    {weekTotal(student.id)}/{weekPossible}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => fillWeek(student.id)}>
                      Full marks
                    </Button>
                  </td>
                </tr>
              ))}
              {students.length === 0 ? (
                <tr>
                  <td colSpan={classDays.length + 3} className="px-4 py-8 text-center text-muted-foreground">
                    No students found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(noteTarget)} onOpenChange={(open) => { if (!open) setNoteTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Participation comment</DialogTitle>
            {noteTarget && noteDay ? (
              <DialogDescription>
                {noteStudent?.name ?? noteStudent?.email ?? "Student"} · {WEEKDAY_LABELS[noteDay.getDay()]}{" "}
                {noteDay.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {drafts[noteKey] !== undefined ? ` · ${drafts[noteKey]}/${noteMax}` : ""}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {noteTarget ? (
            <div className="space-y-2">
              <textarea
                value={noteDrafts[noteKey] ?? ""}
                onChange={(event) => setNote(noteTarget.userId, noteTarget.dateKey, event.target.value)}
                rows={5}
                maxLength={NOTE_MAX}
                placeholder="Why points were docked…"
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {drafts[noteKey] === undefined
                  ? "Enter a score for this day, then Save — comments only store with a score."
                  : drafts[noteKey] < noteMax
                    ? "Docked scores need another producer to approve before students see this."
                    : "Full marks post immediately. Save the week to keep this comment."}
                {(noteDrafts[noteKey] ?? "").length > 0
                  ? ` ${(noteDrafts[noteKey] ?? "").length}/${NOTE_MAX}`
                  : ""}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Pending participation</DialogTitle>
            <DialogDescription>
              Docked scores (less than full marks) wait here. Full marks already posted. The adviser
              or another producer can approve — you cannot approve your own request.
            </DialogDescription>
          </DialogHeader>
          {queueLoading && !queue ? (
            <p className="text-sm text-muted-foreground">Loading requests…</p>
          ) : !queue || queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending participation grades.</p>
          ) : (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              {queue.map((request) => (
                <section key={request.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {personLabel(request.requestedBy)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {request.items.length} score{request.items.length === 1 ? "" : "s"} ·{" "}
                        {new Date(request.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {request.canReview ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive-quiet"
                          disabled={decidingId === request.id}
                          onClick={() => void decide(request.id, false)}
                        >
                          {decidingId === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                          Deny
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={decidingId === request.id}
                          onClick={() => void decide(request.id, true)}
                        >
                          {decidingId === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Approve
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-200">Waiting for another producer</p>
                    )}
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[32rem] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="pb-2 pr-3 font-medium">Student</th>
                          <th className="pb-2 pr-3 font-medium">Day</th>
                          <th className="pb-2 pr-3 font-medium">Score</th>
                          <th className="pb-2 font-medium">Comment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {request.items.map((item) => (
                          <tr
                            key={`${item.userId}:${item.date}`}
                            className="border-t border-border/70"
                          >
                            <td className="py-2 pr-3 text-foreground">
                              {item.studentName ?? item.studentEmail ?? "Student"}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">
                              {formatDayKey(item.date)}
                            </td>
                            <td className="py-2 pr-3 tabular-nums text-foreground">
                              {item.currentPoints === null ? "—" : item.currentPoints} → {item.points}
                            </td>
                            <td className="py-2 text-muted-foreground">
                              {item.notes.trim() || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
