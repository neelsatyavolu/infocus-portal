"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Loader2, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  MEMBER_GENERAL_CYCLE_NUMBER,
  MEMBER_NOTE_MAX,
  isGeneralMemberNoteCycle,
  memberNoteKey
} from "@/src/lib/member-notes";
import { type NameSortKey, sortNamedPeople } from "@/src/lib/name-sort";
import { cn } from "@/src/lib/utils";

type CycleTab = {
  cycleNumber: number;
  focus: string;
};

type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  notesByCycle: Record<string, string>;
};

type MembersPayload = {
  cycles: CycleTab[];
  members: MemberRow[];
};

function personLabel(person: { name: string | null; email: string | null }) {
  return person.name?.trim() || person.email || "Unnamed member";
}

export default function MembersClient() {
  const [cycles, setCycles] = useState<CycleTab[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeCycleNumber, setActiveCycleNumber] = useState(MEMBER_GENERAL_CYCLE_NUMBER);
  const [sortBy, setSortBy] = useState<NameSortKey>("lastName");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const draftsRef = useRef<Record<string, string>>({});
  const membersRef = useRef<MemberRow[]>([]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const load = useCallback(async () => {
    const response = await fetch("/api/members", { cache: "no-store" });
    const payload = (await response.json()) as { data?: MembersPayload; error?: { message?: string } };
    if (!response.ok || !payload.data) {
      throw new Error(payload.error?.message ?? "Failed to load members.");
    }
    return payload.data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setMessage(null);
        const data = await load();
        if (cancelled) return;
        setCycles(data.cycles);
        setMembers(data.members);
        const nextDrafts: Record<string, string> = {};
        for (const member of data.members) {
          for (const [cycle, notes] of Object.entries(member.notesByCycle)) {
            nextDrafts[memberNoteKey(member.id, Number(cycle))] = notes;
          }
        }
        setDrafts(nextDrafts);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load members.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const activeCycle = cycles.find((cycle) => cycle.cycleNumber === activeCycleNumber) ?? null;
  const isGeneral = isGeneralMemberNoteCycle(activeCycleNumber);

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? members.filter((member) => {
          const name = (member.name ?? "").toLowerCase();
          const email = (member.email ?? "").toLowerCase();
          return name.includes(q) || email.includes(q);
        })
      : members;
    return sortNamedPeople(filtered, sortBy);
  }, [members, query, sortBy]);

  const notesOnTab = useMemo(() => {
    return members.filter((member) => {
      const key = memberNoteKey(member.id, activeCycleNumber);
      return (drafts[key] ?? member.notesByCycle[String(activeCycleNumber)] ?? "").trim().length > 0;
    }).length;
  }, [members, drafts, activeCycleNumber]);

  async function persist(userId: string, cycleNumber: number) {
    const key = memberNoteKey(userId, cycleNumber);
    const notes = (draftsRef.current[key] ?? "").slice(0, MEMBER_NOTE_MAX);
    const current = membersRef.current.find((member) => member.id === userId);
    const saved = current?.notesByCycle[String(cycleNumber)] ?? "";
    if (notes === saved) return;

    setSavingKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    try {
      const response = await fetch("/api/members/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, cycleNumber, notes })
      });
      const payload = (await response.json()) as {
        data?: { userId: string; cycleNumber: number; notes: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to save note.");
      }
      setMembers((prev) =>
        prev.map((member) =>
          member.id === payload.data!.userId
            ? {
                ...member,
                notesByCycle: {
                  ...member.notesByCycle,
                  [String(payload.data!.cycleNumber)]: payload.data!.notes
                }
              }
            : member
        )
      );
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save note.");
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function queueSave(userId: string, cycleNumber: number) {
    const key = memberNoteKey(userId, cycleNumber);
    const existing = saveTimersRef.current.get(key);
    if (existing) clearTimeout(existing);
    saveTimersRef.current.set(
      key,
      setTimeout(() => {
        saveTimersRef.current.delete(key);
        void persist(userId, cycleNumber);
      }, 700)
    );
  }

  function setNote(userId: string, value: string) {
    const key = memberNoteKey(userId, activeCycleNumber);
    setDrafts((current) => ({ ...current, [key]: value.slice(0, MEMBER_NOTE_MAX) }));
    queueSave(userId, activeCycleNumber);
  }

  function flushNote(userId: string, cycleNumber: number) {
    const key = memberNoteKey(userId, cycleNumber);
    const timer = saveTimersRef.current.get(key);
    if (timer) {
      clearTimeout(timer);
      saveTimersRef.current.delete(key);
    }
    void persist(userId, cycleNumber);
  }

  function flushAllPending() {
    const pending = [...saveTimersRef.current.entries()];
    saveTimersRef.current.clear();
    for (const [key, timer] of pending) {
      clearTimeout(timer);
      const separator = key.lastIndexOf(":");
      const userId = key.slice(0, separator);
      const cycleNumber = Number(key.slice(separator + 1));
      if (userId && Number.isInteger(cycleNumber)) {
        void persist(userId, cycleNumber);
      }
    }
  }

  function onTabClick(cycleNumber: number) {
    if (cycleNumber === activeCycleNumber) return;
    flushAllPending();
    setActiveCycleNumber(cycleNumber);
  }

  const saving = savingKeys.size > 0;

  return (
    <div className="route-enter mx-auto w-full max-w-[80rem] space-y-3 pb-24">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-4 md:px-5">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Producer view</div>
            <h1 className="display-md mt-1 text-balance text-foreground">Members</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {isGeneral
                ? "Standing notes on each reporter. Switch cycles for notes that stay with that package."
                : activeCycle?.focus?.trim()
                  ? `Cycle ${activeCycle.cycleNumber} · ${activeCycle.focus}`
                  : `Notes for package cycle ${activeCycleNumber}.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="meta-pill">
              {members.length} member{members.length === 1 ? "" : "s"}
              {notesOnTab > 0 ? ` · ${notesOnTab} with notes` : ""}
            </span>
            {saving ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          <label className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search members…"
              className="h-9 w-full rounded-md border border-border bg-muted pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="inline-flex min-w-[10.5rem] items-center rounded-md border border-border bg-muted">
            <div className="pointer-events-none pl-2 text-muted-foreground">
              <ArrowUpDown className="h-3.5 w-3.5" />
            </div>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as NameSortKey)}>
              <SelectTrigger className="h-9 w-[9.5rem] border-0 bg-transparent shadow-none" aria-label="Sort members">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastName">Last name</SelectItem>
                <SelectItem value="firstName">First name</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {message ? (
          <p className="relative mt-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading members…</p>
        ) : visibleMembers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {query.trim() ? "No members match that search." : "No class members to show."}
          </p>
        ) : (
          <ul>
            {visibleMembers.map((member) => {
              const key = memberNoteKey(member.id, activeCycleNumber);
              const value = drafts[key] ?? "";
              const hasNote = value.trim().length > 0;
              return (
                <li key={member.id} className="border-b border-border last:border-b-0">
                  <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(12rem,18rem)_1fr] md:items-start">
                    <div className="min-w-0 pt-1">
                      <p className="truncate text-sm font-semibold text-foreground">{personLabel(member)}</p>
                      {member.email ? (
                        <p className="truncate font-mono-broadcast text-[11px] text-muted-foreground">{member.email}</p>
                      ) : null}
                    </div>
                    <label className="block">
                      <span className="sr-only">
                        {isGeneral ? "General notes" : `Cycle ${activeCycleNumber} notes`} for {personLabel(member)}
                      </span>
                      <textarea
                        value={value}
                        maxLength={MEMBER_NOTE_MAX}
                        rows={3}
                        placeholder={
                          isGeneral ? "General notes…" : `Notes for cycle ${String(activeCycleNumber).padStart(2, "0")}…`
                        }
                        onChange={(event) => setNote(member.id, event.target.value)}
                        onBlur={() => flushNote(member.id, activeCycleNumber)}
                        className={cn(
                          "min-h-[4.5rem] w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-[var(--brand-green)]/50 focus:ring-1 focus:ring-[var(--brand-green)]/30",
                          hasNote ? "border-border" : "border-border/70"
                        )}
                      />
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="sticky bottom-4 z-20 mx-auto flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-xl border border-foreground/[0.08] bg-black/85 light:bg-muted p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur">
          <button
            type="button"
            onClick={() => onTabClick(MEMBER_GENERAL_CYCLE_NUMBER)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.18em] transition",
              isGeneral
                ? "bg-[var(--brand-green)] text-[var(--ink)]"
                : "text-[var(--ink-text)] hover:bg-foreground/5 hover:text-foreground"
            )}
          >
            General
          </button>
          {cycles.map((cycle) => {
            const active = cycle.cycleNumber === activeCycleNumber;
            return (
              <button
                key={cycle.cycleNumber}
                type="button"
                onClick={() => onTabClick(cycle.cycleNumber)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.18em] transition",
                  active
                    ? "bg-[var(--brand-green)] text-[var(--ink)]"
                    : "text-[var(--ink-text)] hover:bg-foreground/5 hover:text-foreground"
                )}
              >
                Cycle
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono-broadcast text-[10px] font-bold",
                    active ? "bg-black/35 text-[var(--ink)]" : "bg-black/40 light:bg-foreground/10 text-[var(--ink-text)]"
                  )}
                >
                  {String(cycle.cycleNumber).padStart(2, "0")}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
