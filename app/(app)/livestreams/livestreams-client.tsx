"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Radio,
  RefreshCcw,
  Trash2,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  LIVESTREAM_AVAILABILITY_LABELS,
  LIVESTREAM_STATUS_LABELS,
  REQUIRED_LIVESTREAM_HOURS
} from "@/src/lib/livestream";
import { cn } from "@/src/lib/utils";

type Person = { id: string; name: string | null; email: string | null };

type EventRow = {
  id: string;
  title: string;
  startsAt: string;
  location: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  availability: "PUBLIC" | "UNLISTED" | "UNCONFIRMED";
  hours: number | null;
  capacity: number;
  notes: string;
  manager: Person | null;
  attendees: (Person & { creditHours: number | null })[];
  attendeeCount: number;
  openSlots: number;
  capacityTone: "full" | "one" | "open";
  mySignup: { id: string; status: string; availableFullEvent: boolean } | null;
  pendingSignupCount: number;
};

type PendingSignup = {
  id: string;
  eventId: string;
  status: string;
  availableFullEvent: boolean;
  note: string;
  createdAt: string;
  user: Person | null;
  event: { id: string; title: string; startsAt: string } | null;
};

type CompletionRow = {
  userId: string;
  name: string | null;
  email: string | null;
  completedHours: number;
  completedEvents: number;
  requiredHours: number;
  creditPercent: number;
  points: number;
};

type Payload = {
  semester: { label: string; start: string; end: string };
  requiredHours: number;
  canManage: boolean;
  canSignup: boolean;
  canAppointManagers: boolean;
  canViewCompletion: boolean;
  currentUserId: string;
  managers: Person[];
  events: EventRow[];
  pendingSignups: PendingSignup[];
  mySignups: Array<{ id: string; eventId: string; status: string }>;
};

type Tab = "schedule" | "completion" | "signups";

type EventFormState = {
  title: string;
  startsAt: string;
  location: string;
  status: EventRow["status"];
  availability: EventRow["availability"];
  hours: string;
  capacity: string;
  notes: string;
  managerUserId: string;
  attendeeUserIds: string[];
  attendeeCredits: Record<string, string>;
};

function personLabel(p: { name?: string | null; email?: string | null } | null | undefined) {
  if (!p) return "—";
  return p.name?.trim() || p.email || "Member";
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function toLocalInputValue(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function capacityClass(tone: EventRow["capacityTone"]) {
  if (tone === "full") return "bg-amber-500/[0.07]";
  if (tone === "one") return "bg-orange-500/[0.07]";
  return "bg-red-500/[0.05]";
}

function capacityDot(tone: EventRow["capacityTone"]) {
  if (tone === "full") return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]";
  if (tone === "one") return "bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.55)]";
  return "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]";
}

function statusPill(status: EventRow["status"]) {
  if (status === "COMPLETED") {
    return "border-[rgb(0,199,44,0.35)] bg-[rgb(0,199,44,0.12)] text-[var(--brand-green)]";
  }
  if (status === "CANCELLED") {
    return "border-white/10 bg-white/[0.04] text-[var(--ink-text)] line-through decoration-white/30";
  }
  return "border-sky-400/30 bg-sky-500/10 text-sky-300";
}

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message || "Request failed");
  }
  return body.data as T;
}

const emptyForm = (): EventFormState => ({
  title: "",
  startsAt: toLocalInputValue(),
  location: "",
  status: "SCHEDULED",
  availability: "UNCONFIRMED",
  hours: "",
  capacity: "4",
  notes: "",
  managerUserId: "",
  attendeeCredits: {},
  attendeeUserIds: []
});

const fieldClass =
  "mt-1.5 h-10 w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[var(--brand-green)]/50 focus:ring-1 focus:ring-[var(--brand-green)]/30";

const labelClass = "block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-text)]";

export default function LivestreamsClient() {
  const [tab, setTab] = useState<Tab>("schedule");
  const [data, setData] = useState<Payload | null>(null);
  const [completion, setCompletion] = useState<CompletionRow[] | null>(null);
  const [members, setMembers] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EventFormState>(emptyForm);
  const [managerPick, setManagerPick] = useState("");
  const [signupNote, setSignupNote] = useState<Record<string, string>>({});
  const [memberQuery, setMemberQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const payload = await readJson<Payload>(await fetch("/api/livestreams"));
    setData(payload);

    if (payload.canManage) {
      const memberPayload = await readJson<{ members: Person[] }>(
        await fetch("/api/livestreams/members")
      );
      setMembers(memberPayload.members);
    }

    if (payload.canViewCompletion && tab === "completion") {
      const c = await readJson<{ rows: CompletionRow[] }>(
        await fetch("/api/livestreams/completion")
      );
      setCompletion(c.rows);
    }
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!data?.canViewCompletion || tab !== "completion") return;
    let cancelled = false;
    (async () => {
      try {
        const c = await readJson<{ rows: CompletionRow[] }>(
          await fetch("/api/livestreams/completion")
        );
        if (!cancelled) setCompletion(c.rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load completion");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.canViewCompletion, tab]);

  const formOpen = creating || Boolean(editing);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setMemberQuery("");
    setCreating(true);
  };

  const openEdit = (event: EventRow) => {
    setCreating(false);
    setEditing(event);
    setMemberQuery("");
    setForm({
      title: event.title,
      startsAt: toLocalInputValue(event.startsAt),
      location: event.location,
      status: event.status,
      availability: event.availability,
      hours: event.hours == null ? "" : String(event.hours),
      capacity: String(event.capacity),
      notes: event.notes,
      managerUserId: event.manager?.id ?? "",
      attendeeCredits: Object.fromEntries(event.attendees.map((a) => [a.id, a.creditHours == null ? "" : String(a.creditHours)])),
      attendeeUserIds: event.attendees.map((a) => a.id)
    });
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  const saveEvent = async () => {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        startsAt: new Date(form.startsAt).toISOString(),
        location: form.location.trim(),
        status: form.status,
        availability: form.availability,
        hours: form.hours === "" ? null : Number(form.hours),
        capacity: Number(form.capacity) || 4,
        notes: form.notes,
        managerUserId: form.managerUserId || null,
        attendeeCredits: form.attendeeUserIds.map((userId) => ({
          userId,
          creditHours: form.attendeeCredits[userId]?.trim() ? Number(form.attendeeCredits[userId]) : null
        })),
        attendeeUserIds: form.attendeeUserIds
      };

      if (editing) {
        await readJson(
          await fetch(`/api/livestreams/events/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })
        );
      } else {
        await readJson(
          await fetch("/api/livestreams/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })
        );
      }
      closeForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteEvent = async (id: string) => {
    if (!confirm("Delete this livestream event?")) return;
    setBusy(true);
    try {
      await readJson(await fetch(`/api/livestreams/events/${id}`, { method: "DELETE" }));
      closeForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const requestSignup = async (eventId: string) => {
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch("/api/livestreams/signups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            availableFullEvent: true,
            note: signupNote[eventId] ?? ""
          })
        })
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  const reviewSignup = async (signupId: string, status: "APPROVED" | "DENIED") => {
    setBusy(true);
    setError(null);
    try {
      await readJson(
        await fetch(`/api/livestreams/signups/${signupId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        })
      );
      await load();
      if (tab === "completion" && data?.canViewCompletion) {
        const c = await readJson<{ rows: CompletionRow[] }>(
          await fetch("/api/livestreams/completion")
        );
        setCompletion(c.rows);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  };

  const addManager = async () => {
    if (!managerPick) return;
    setBusy(true);
    try {
      await readJson(
        await fetch("/api/livestreams/managers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: managerPick })
        })
      );
      setManagerPick("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add manager");
    } finally {
      setBusy(false);
    }
  };

  const removeManager = async (userId: string) => {
    setBusy(true);
    try {
      await readJson(
        await fetch(`/api/livestreams/managers?userId=${encodeURIComponent(userId)}`, {
          method: "DELETE"
        })
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove manager");
    } finally {
      setBusy(false);
    }
  };

  const toggleAttendee = (userId: string) => {
    setForm((prev) => {
      const has = prev.attendeeUserIds.includes(userId);
      return {
        ...prev,
        attendeeUserIds: has
          ? prev.attendeeUserIds.filter((id) => id !== userId)
          : [...prev.attendeeUserIds, userId]
      };
    });
  };

  const signupEvents = useMemo(() => {
    if (!data) return [];
    return data.events.filter((e) => e.status === "SCHEDULED");
  }, [data]);

  const stats = useMemo(() => {
    if (!data) {
      return { total: 0, scheduled: 0, completed: 0, cancelled: 0, pending: 0 };
    }
    return {
      total: data.events.length,
      scheduled: data.events.filter((e) => e.status === "SCHEDULED").length,
      completed: data.events.filter((e) => e.status === "COMPLETED").length,
      cancelled: data.events.filter((e) => e.status === "CANCELLED").length,
      pending: data.pendingSignups.length
    };
  }, [data]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const label = personLabel(m).toLowerCase();
      return label.includes(q) || (m.email ?? "").toLowerCase().includes(q);
    });
  }, [members, memberQuery]);

  const tabs = useMemo(() => {
    const list: Array<{ id: Tab; label: string; badge?: number }> = [
      { id: "schedule", label: "Schedule" }
    ];
    if (data?.canViewCompletion) {
      list.push({ id: "completion", label: "Completion" });
    }
    list.push({
      id: "signups",
      label: "Sign ups",
      badge: data?.canManage ? data.pendingSignups.length : undefined
    });
    return list;
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--ink-text)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--brand-green)]" />
        Loading livestreams…
      </div>
    );
  }

  return (
    <div className="route-enter mx-auto w-full max-w-[1760px] space-y-5 pb-28">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border p-6 md:p-8"
        style={{
          background:
            "radial-gradient(900px 240px at 92% 10%, rgba(0,199,44,0.18), transparent 60%), linear-gradient(135deg, #024E14 0%, #0A2510 50%, #0A0A0A 100%)"
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.015) 0 2px, transparent 2px 14px)"
          }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(0,199,44,0.4)] bg-black/40 px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-green)] backdrop-blur">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--brand-green)]"
                style={{ boxShadow: "0 0 8px var(--brand-green)" }}
              />
              Livestreams · {data?.semester.label ?? "—"}
            </div>
            <h1
              className="mt-3 font-display text-[40px] font-black uppercase italic leading-none tracking-tight text-white md:text-[56px]"
              style={{ letterSpacing: "-0.025em" }}
            >
              {tab === "schedule"
                ? "Schedule"
                : tab === "completion"
                  ? "Completion"
                  : "Sign ups"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--ink-text)]">
              {tab === "schedule"
                ? "Every livestream this semester — arrival times, crew, managers, and hours."
                : tab === "completion"
                  ? `${REQUIRED_LIVESTREAM_HOURS} hours for full credit. Partial credit scales linearly (4h = 50%).`
                  : data?.canManage
                    ? "Review member requests. Approving adds them to the crew and keeps completion in sync."
                    : "Request a slot on an open livestream. Managers approve and the schedule updates."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--ink-text)]">
              <div className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3" />
                <span>
                  Semester <strong className="font-semibold text-white">{data?.semester.label}</strong>
                </span>
              </div>
              <span className="h-3 w-px bg-[var(--ink-4)]" />
              <div className="inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <span>
                  <strong className="font-semibold text-white">
                    {data?.requiredHours ?? REQUIRED_LIVESTREAM_HOURS}h
                  </strong>{" "}
                  required
                </span>
              </div>
              <span className="h-3 w-px bg-[var(--ink-4)]" />
              <div className="inline-flex items-center gap-1.5">
                <Radio className="h-3 w-3" />
                <span>
                  <strong className="font-semibold text-white">{stats.total}</strong> events
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/15 bg-black/30 text-white hover:bg-white/10"
              onClick={() => load().catch((e) => setError(e.message))}
              disabled={busy}
            >
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
            {data?.canManage ? (
              <Button
                type="button"
                size="sm"
                className="bg-[var(--brand-green)] text-[var(--ink)] hover:bg-[var(--brand-green-deep)]"
                onClick={openCreate}
                disabled={busy}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add event
              </Button>
            ) : null}
          </div>
        </div>

        {/* Stats */}
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Scheduled", value: stats.scheduled, tone: "text-sky-300" },
            { label: "Completed", value: stats.completed, tone: "text-[var(--brand-green)]" },
            { label: "Cancelled", value: stats.cancelled, tone: "text-[var(--ink-text)]" },
            {
              label: data?.canManage ? "Pending sign-ups" : "Open slots",
              value: data?.canManage
                ? stats.pending
                : data?.events.reduce((n, e) => n + (e.status === "SCHEDULED" ? e.openSlots : 0), 0) ??
                  0,
              tone: "text-amber-300"
            }
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-white/[0.08] bg-black/35 px-4 py-3 backdrop-blur"
            >
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-text)]">
                {card.label}
              </p>
              <p className={cn("mt-1 font-display text-3xl font-black tabular-nums", card.tone)}>
                {card.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {/* Schedule */}
      {tab === "schedule" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--ink-text)]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1">
              <span className={cn("h-1.5 w-1.5 rounded-full", capacityDot("full"))} />
              Full
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-500/10 px-2.5 py-1">
              <span className={cn("h-1.5 w-1.5 rounded-full", capacityDot("one"))} />
              1 open
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/25 bg-red-500/10 px-2.5 py-1">
              <span className={cn("h-1.5 w-1.5 rounded-full", capacityDot("open"))} />
              2+ open
            </span>
          </div>

          {!data?.events.length ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.1] bg-card/40 px-6 py-16 text-center">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.08] bg-black/40">
                <Radio className="h-5 w-5 text-[var(--brand-green)]" />
              </div>
              <p className="font-display text-lg font-bold uppercase tracking-wide text-white">
                No livestreams yet
              </p>
              <p className="mt-1 max-w-md text-sm text-[var(--ink-text)]">
                {data?.canManage
                  ? "Add the first event to start the semester schedule."
                  : "Check back once producers post the schedule."}
              </p>
              {data?.canManage ? (
                <Button
                  type="button"
                  size="sm"
                  className="mt-4 bg-[var(--brand-green)] text-[var(--ink)]"
                  onClick={openCreate}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add event
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card/60 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.8)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-black/40 text-left">
                      {[
                        "Event",
                        "When",
                        "Location",
                        "Status",
                        "Crew",
                        "Manager",
                        "Hours",
                        ...(data.canManage ? [""] : [])
                      ].map((h) => (
                        <th
                          key={h || "actions"}
                          className="px-4 py-3 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ink-text)]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((event) => (
                      <tr
                        key={event.id}
                        className={cn(
                          "border-b border-white/[0.04] transition hover:bg-white/[0.02]",
                          capacityClass(event.capacityTone)
                        )}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-start gap-2.5">
                            <span
                              className={cn(
                                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                                capacityDot(event.capacityTone)
                              )}
                            />
                            <div>
                              <div className="font-medium text-white">{event.title}</div>
                              <div className="mt-0.5 text-[11px] text-[var(--ink-text)]">
                                {LIVESTREAM_AVAILABILITY_LABELS[event.availability]}
                                {event.pendingSignupCount
                                  ? ` · ${event.pendingSignupCount} pending`
                                  : ""}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-[var(--ink-text)]">
                          {formatWhen(event.startsAt)}
                        </td>
                        <td className="px-4 py-3.5 text-[var(--ink-text)]">
                          {event.location || "—"}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              statusPill(event.status)
                            )}
                          >
                            {LIVESTREAM_STATUS_LABELS[event.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium tabular-nums text-white">
                            {event.attendeeCount}
                            <span className="text-[var(--ink-text)]">/{event.capacity}</span>
                          </div>
                          <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-[var(--ink-text)]">
                            {event.attendees
                              .map((person) => person.name?.trim().split(/\s+/)[0] || personLabel(person))
                              .join(", ") || "No crew yet"}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-[var(--ink-text)]">
                          {personLabel(event.manager)}
                        </td>
                        <td className="px-4 py-3.5 font-mono-broadcast tabular-nums text-white">
                          {event.hours ?? "—"}
                        </td>
                        {data.canManage ? (
                          <td className="px-4 py-3.5 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-[var(--ink-text)] hover:text-white"
                              onClick={() => openEdit(event)}
                            >
                              Edit
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data?.canAppointManagers ? (
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold uppercase tracking-wide text-white">
                    Livestream managers
                  </h2>
                  <p className="mt-1 max-w-xl text-xs text-[var(--ink-text)]">
                    Producers appoint managers. Managers can edit the schedule, approve sign-ups, and
                    view completion.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.managers.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/35 px-3 py-1.5 text-xs text-white"
                  >
                    <Users className="h-3 w-3 text-[var(--brand-green)]" />
                    {personLabel(m)}
                    <button
                      type="button"
                      className="ml-0.5 text-[var(--ink-text)] transition hover:text-red-300"
                      onClick={() => removeManager(m.id)}
                      aria-label={`Remove ${personLabel(m)}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {!data.managers.length ? (
                  <span className="text-xs text-[var(--ink-text)]">No managers yet.</span>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <select
                  className="h-10 min-w-[240px] rounded-lg border border-white/[0.08] bg-black/40 px-3 text-sm text-white outline-none focus:border-[var(--brand-green)]/50"
                  value={managerPick}
                  onChange={(e) => setManagerPick(e.target.value)}
                >
                  <option value="">Add manager…</option>
                  {members
                    .filter((m) => !data.managers.some((x) => x.id === m.id))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {personLabel(m)}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 bg-[var(--brand-green)] text-[var(--ink)]"
                  onClick={addManager}
                  disabled={!managerPick || busy}
                >
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Completion */}
      {tab === "completion" && data?.canViewCompletion ? (
        <section className="space-y-4">
          {!completion ? (
            <div className="flex min-h-[200px] items-center justify-center gap-2 text-sm text-[var(--ink-text)]">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-green)]" />
              Loading completion…
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-black/40 text-left">
                      {["Name", "Events", "Hours", "Credit", "Points"].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ink-text)]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {completion.map((row) => (
                      <tr
                        key={row.userId}
                        className="border-b border-white/[0.04] transition hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-white">{personLabel(row)}</div>
                          <div className="text-[11px] text-[var(--ink-text)]">{row.email}</div>
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-white">{row.completedEvents}</td>
                        <td className="px-4 py-3.5 tabular-nums text-white">
                          {row.completedHours}
                          <span className="text-[var(--ink-text)]"> / {row.requiredHours}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-[var(--brand-green)]"
                                style={{ width: `${Math.min(100, row.creditPercent)}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-[var(--ink-text)]">
                              {row.creditPercent}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono-broadcast tabular-nums text-white">
                          {row.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* Sign ups */}
      {tab === "signups" ? (
        <section className="space-y-4">
          {data?.canManage ? (
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold uppercase tracking-wide text-white">
                  Pending requests
                </h2>
                {data.pendingSignups.length ? (
                  <span className="rounded-full bg-[var(--brand-green)] px-2 py-0.5 font-mono-broadcast text-[10px] font-bold text-[var(--ink)]">
                    {data.pendingSignups.length}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-[var(--ink-text)]">
                Approving adds the member to the schedule crew. Completion updates when the event is
                marked completed.
              </p>
              {!data.pendingSignups.length ? (
                <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-white/[0.08] px-4 py-10 text-center">
                  <CheckCircle2 className="mb-2 h-5 w-5 text-[var(--brand-green)]" />
                  <p className="text-sm text-[var(--ink-text)]">Inbox clear — no pending sign-ups.</p>
                </div>
              ) : (
                <ul className="mt-4 space-y-2">
                  {data.pendingSignups.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-white">{personLabel(s.user)}</div>
                        <div className="mt-0.5 text-xs text-[var(--ink-text)]">
                          {s.event?.title ?? "Event"} ·{" "}
                          {s.event ? formatWhen(s.event.startsAt) : "—"}
                          {!s.availableFullEvent ? " · partial availability" : ""}
                          {s.note ? ` · ${s.note}` : ""}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="bg-[var(--brand-green)] text-[var(--ink)]"
                          onClick={() => reviewSignup(s.id, "APPROVED")}
                          disabled={busy}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-white/15"
                          onClick={() => reviewSignup(s.id, "DENIED")}
                          disabled={busy}
                        >
                          Deny
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <h2 className="font-display text-base font-bold uppercase tracking-wide text-white">
              {data?.canSignup ? "Request a slot" : "Open livestreams"}
            </h2>
            <p className="mt-1 text-xs text-[var(--ink-text)]">
              {data?.canSignup
                ? "Pick an open event. Managers approve requests and the schedule updates."
                : "Livestream managers cannot request slots. You can assign crew while editing an event."}
            </p>
            {!signupEvents.length ? (
              <p className="mt-6 text-center text-sm text-[var(--ink-text)]">
                No open livestreams right now.
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {signupEvents.map((event) => {
                  const attending = event.attendees.some((a) => a.id === data?.currentUserId);
                  const my = event.mySignup;
                  const full = event.openSlots <= 0;
                  return (
                    <li
                      key={event.id}
                      className={cn(
                        "rounded-xl border border-white/[0.06] px-4 py-3.5",
                        capacityClass(event.capacityTone)
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn("h-2 w-2 rounded-full", capacityDot(event.capacityTone))}
                            />
                            <div className="font-medium text-white">{event.title}</div>
                          </div>
                          <div className="mt-1 text-xs text-[var(--ink-text)]">
                            {formatWhen(event.startsAt)} · {event.location || "TBD"} ·{" "}
                            {event.attendeeCount}/{event.capacity}
                          </div>
                        </div>
                        {attending ? (
                          <span className="rounded-full border border-[rgb(0,199,44,0.35)] bg-[rgb(0,199,44,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-green)]">
                            On crew
                          </span>
                        ) : my?.status === "PENDING" ? (
                          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                            Pending
                          </span>
                        ) : null}
                      </div>
                      {!attending && my?.status !== "PENDING" && data?.canSignup ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <input
                            className="h-9 min-w-[160px] flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 text-xs text-white outline-none focus:border-[var(--brand-green)]/50"
                            placeholder="Optional note"
                            value={signupNote[event.id] ?? ""}
                            onChange={(e) =>
                              setSignupNote((prev) => ({ ...prev, [event.id]: e.target.value }))
                            }
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="bg-[var(--brand-green)] text-[var(--ink)]"
                            disabled={busy || full}
                            onClick={() => requestSignup(event.id)}
                          >
                            {full ? "Full" : "Request sign-up"}
                          </Button>
                        </div>
                      ) : null}
                      {!attending && my?.status === "DENIED" && data?.canSignup ? (
                        <Button
                          type="button"
                          size="sm"
                          className="mt-3 bg-[var(--brand-green)] text-[var(--ink)]"
                          disabled={busy || full}
                          onClick={() => requestSignup(event.id)}
                        >
                          Request again
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {/* Edit / create dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto border-white/[0.08] bg-[#0c0c0e] p-0 sm:rounded-2xl">
          <div className="border-b border-white/[0.06] px-6 py-5">
            <DialogHeader>
              <DialogTitle className="font-display text-xl font-bold uppercase tracking-wide text-white">
                {editing ? "Edit livestream" : "New livestream"}
              </DialogTitle>
              <DialogDescription className="text-[var(--ink-text)]">
                {editing
                  ? "Update schedule details, crew, and hours."
                  : "Add an event to the semester schedule."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 px-6 py-5">
            <label className={labelClass}>
              Event name
              <input
                className={fieldClass}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Choir Pops Concert"
              />
            </label>
            <label className={labelClass}>
              Date & arrival time
              <input
                type="datetime-local"
                className={fieldClass}
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
              />
            </label>
            <label className={labelClass}>
              Location
              <input
                className={fieldClass}
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="PAC, Gym, LAX Field…"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>
                Status
                <select
                  className={fieldClass}
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as EventRow["status"] }))
                  }
                >
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </label>
              <label className={labelClass}>
                Availability
                <select
                  className={fieldClass}
                  value={form.availability}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      availability: e.target.value as EventRow["availability"]
                    }))
                  }
                >
                  <option value="PUBLIC">Public</option>
                  <option value="UNLISTED">Unlisted</option>
                  <option value="UNCONFIRMED">Unconfirmed</option>
                </select>
              </label>
              <label className={labelClass}>
                Default credit hours {form.status === "COMPLETED" ? "(required)" : ""}
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  className={fieldClass}
                  value={form.hours}
                  onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                  placeholder="e.g. 3"
                />
              </label>
              <label className={labelClass}>
                Capacity
                <input
                  type="number"
                  min={1}
                  max={50}
                  className={fieldClass}
                  value={form.capacity}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--ink-text)]">
                Credit applies only to completed events. Set default hours to 0 to cancel all credit,
                including individual overrides. Attendance is retained.
              </p>
              <Button type="button" variant="destructive" size="sm"
                onClick={() => setForm((f) => ({ ...f, hours: "0" }))}>
                Cancel credit
              </Button>
            </div>
            <label className={labelClass}>
              Event manager
              <select
                className={fieldClass}
                value={form.managerUserId}
                onChange={(e) => setForm((f) => ({ ...f, managerUserId: e.target.value }))}
              >
                <option value="">None</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {personLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className={labelClass}>Crew / attendees</span>
                <span className="text-[11px] tabular-nums text-[var(--ink-text)]">
                  {form.attendeeUserIds.length} selected
                </span>
              </div>
              <input
                className={cn(fieldClass, "mb-2")}
                placeholder="Search members…"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
              />
              <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-white/[0.08] bg-black/30 p-2">
                {filteredMembers.map((m) => {
                  const checked = form.attendeeUserIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition",
                        checked ? "bg-[rgb(0,199,44,0.12)] text-white" : "text-[var(--ink-text)] hover:bg-white/[0.04] hover:text-white"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="accent-[var(--brand-green)]"
                        checked={checked}
                        onChange={() => toggleAttendee(m.id)}
                      />
                      {personLabel(m)}
                    </label>
                  );
                })}
                {!filteredMembers.length ? (
                  <p className="px-2 py-3 text-center text-xs text-[var(--ink-text)]">No matches.</p>
                ) : null}
              </div>
            </div>
            {form.attendeeUserIds.length > 0 ? (
              <div className="space-y-2">
                <p className={labelClass}>Individual credit hours</p>
                <p className="text-xs text-[var(--ink-text)]">
                  Leave blank for the event default. Enter 0 for no credit.
                  Individual values are ignored when default credit is 0.
                </p>
                {form.attendeeUserIds.map((userId) => (
                  <label key={userId} className="flex items-center justify-between gap-3 text-xs text-white">
                    <span>{personLabel(members.find((member) => member.id === userId)
                      ?? editing?.attendees.find((attendee) => attendee.id === userId))}</span>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      step={0.25}
                      className={cn(fieldClass, "!mt-0 !w-32")}
                      value={form.attendeeCredits[userId] ?? ""}
                      placeholder={`Default (${form.hours || "0"})`}
                      onChange={(e) => setForm((f) => ({
                        ...f, attendeeCredits: { ...f.attendeeCredits, [userId]: e.target.value }
                      }))}
                    />
                  </label>
                ))}
              </div>
            ) : null}
            <label className={labelClass}>
              Notes
              <textarea
                className="mt-1.5 min-h-[72px] w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-green)]/50 focus:ring-1 focus:ring-[var(--brand-green)]/30"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
          </div>

          <DialogFooter className="gap-2 border-t border-white/[0.06] px-6 py-4 sm:justify-between">
            {editing ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                disabled={busy}
                onClick={() => deleteEvent(editing.id)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="border-white/15" onClick={closeForm}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-[var(--brand-green)] text-[var(--ink)]"
                onClick={saveEvent}
                disabled={busy}
              >
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating tab bar — portaled so fixed isn't trapped by route-enter transform / scroll shell */}
      {mounted
        ? createPortal(
            <nav
              aria-label="Livestream sections"
              className="pointer-events-none fixed bottom-4 left-0 right-0 z-[60] flex justify-center px-4 lg:left-[240px]"
            >
              <div className="pointer-events-auto inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-black/90 p-1 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.75)] backdrop-blur-md">
                {tabs.map((item) => {
                  const isActive = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-display text-[12px] font-semibold uppercase tracking-[0.18em] transition",
                        isActive
                          ? "bg-[var(--brand-green)] text-[var(--ink)]"
                          : "text-[var(--ink-text)] hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {item.label}
                      {item.badge ? (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 font-mono-broadcast text-[10px] font-bold",
                            isActive
                              ? "bg-black/35 text-[var(--ink)]"
                              : "bg-black/40 text-[var(--ink-text)]"
                          )}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </nav>,
            document.body
          )
        : null}
    </div>
  );
}
