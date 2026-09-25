"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AllGradesView, type AllGradesEstimated } from "@/components/grades/all-grades-view";
import { REQUIRED_LIVESTREAM_HOURS } from "@/src/lib/livestream";
import { sortNamedPeople } from "@/src/lib/name-sort";
import type { GradebookWeek } from "@/src/lib/student-gradebook";
import { cn } from "@/src/lib/utils";

export type StudentPickerPerson = {
  userId: string;
  name: string | null;
  email: string | null;
};

type StudentGradebookPayload = {
  student: StudentPickerPerson;
  estimated: AllGradesEstimated;
  cycles: Array<{ cycleNumber: number; focus: string }>;
  gradebook: {
    semester: { label: string };
    weeks: GradebookWeek[];
    livestreamHours: number;
    requiredLivestreamHours: number;
  };
};

export function StudentGradebookPanel({
  people,
  selectedUserId,
  onSelectUserId,
  sortBy,
  refreshToken = 0
}: {
  people: StudentPickerPerson[];
  selectedUserId: string | null;
  onSelectUserId: (userId: string) => void;
  sortBy: "firstName" | "lastName";
  refreshToken?: number;
}) {
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<StudentGradebookPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = sortNamedPeople(people, sortBy);
    if (!needle) return sorted;
    return sorted.filter((person) => {
      const name = person.name?.toLowerCase() ?? "";
      const email = person.email?.toLowerCase() ?? "";
      return name.includes(needle) || email.includes(needle);
    });
  }, [people, query, sortBy]);

  useEffect(() => {
    if (!selectedUserId) {
      setPayload(null);
      setMessage(null);
      setLoading(false);
      return;
    }

    const userId = selectedUserId;
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setMessage(null);
        const response = await fetch(`/api/grades/admin?view=student&userId=${encodeURIComponent(userId)}`, {
          cache: "no-store"
        });
        const body = (await response.json()) as {
          data?: StudentGradebookPayload;
          error?: { message?: string };
        };
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message ?? "Failed to load student gradebook.");
        }
        if (!active) return;
        setPayload(body.data);
      } catch (error) {
        if (!active) return;
        setPayload(null);
        setMessage(error instanceof Error ? error.message : "Failed to load student gradebook.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [selectedUserId, refreshToken]);

  return (
    <div className="grid gap-4 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:items-stretch">
      <aside className="flex max-h-[28rem] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:max-h-none lg:min-h-0">
        <div className="shrink-0 border-b border-border px-3 py-3">
          <div className="inline-flex h-9 w-full items-center gap-2 rounded-md border border-border bg-[var(--ink)] px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a reporter…"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {filteredPeople.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">No reporters match that search.</li>
          ) : (
            filteredPeople.map((person) => {
              const active = person.userId === selectedUserId;
              return (
                <li key={person.userId}>
                  <button
                    type="button"
                    onClick={() => onSelectUserId(person.userId)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left transition",
                      active ? "bg-[rgb(43,179,110,0.12)]" : "hover:bg-[hsl(var(--background))]"
                    )}
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {person.name?.trim() || "Unnamed user"}
                    </span>
                    <span className="font-mono-broadcast text-[10px] text-muted-foreground">
                      {person.email ?? "—"}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      <div className="min-w-0">
        {message ? (
          <p className="mb-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}
        {!selectedUserId ? (
          <div className="rounded-2xl border border-border bg-card px-4 py-10 text-sm text-muted-foreground">
            Choose a reporter to see their Schoology-style gradebook.
          </div>
        ) : (
          <AllGradesView
            key={selectedUserId}
            loading={loading}
            semesterLabel={payload?.gradebook.semester.label ?? "26-27 S1"}
            cycles={payload?.cycles ?? []}
            estimated={payload?.estimated}
            weeks={payload?.gradebook.weeks ?? []}
            livestreamHours={payload?.gradebook.livestreamHours ?? 0}
            requiredHours={payload?.gradebook.requiredLivestreamHours ?? REQUIRED_LIVESTREAM_HOURS}
            description="Same grouped gradebook the student sees. Edit a score to try a what-if — nothing is saved."
          />
        )}
      </div>
    </div>
  );
}
