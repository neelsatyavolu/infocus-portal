"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCw, SearchX, UserRound, Users } from "lucide-react";
import { AllGradesView, type AllGradesEstimated } from "@/components/grades/all-grades-view";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { useListHotkeys } from "@/components/kit/hotkeys";
import { IconButton } from "@/components/kit/icon-button";
import { ListDetail } from "@/components/kit/layout";
import { SearchField } from "@/components/kit/search-field";
import { Skeleton } from "@/components/kit/skeleton";
import { Button } from "@/components/ui/button";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { neighborIds } from "@/src/lib/keyboard-nav";
import { REQUIRED_LIVESTREAM_HOURS } from "@/src/lib/livestream";
import { sortNamedPeople } from "@/src/lib/name-sort";
import type { GradebookWeek } from "@/src/lib/student-gradebook";
import { cn } from "@/src/lib/utils";
import { studentCacheKey } from "./grade-editor-api";
import { SortSelect } from "./grade-editor-toolbar";
import type { SortBy } from "./grade-editor-types";
import { emailLocalPart } from "./grade-editor-utils";

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

/**
 * The Student view: a reporter list on the left (search, sort, J/K) and that reporter's
 * Schoology-style gradebook on the right, the same one they see. What-if edits never save.
 * Phones show one pane at a time with a back button.
 */
export function StudentGradebookPanel({
  people,
  selectedUserId,
  onSelectUserId,
  sortBy,
  onSortChange,
  refreshToken = 0,
  onRefresh,
  refreshing = false,
  loading: listLoading = false
}: {
  people: StudentPickerPerson[];
  selectedUserId: string | null;
  onSelectUserId: (userId: string | null) => void;
  sortBy: SortBy;
  onSortChange: (sortBy: SortBy) => void;
  refreshToken?: number;
  onRefresh: () => void;
  refreshing?: boolean;
  /** The reporter list is still loading (nothing to show yet). */
  loading?: boolean;
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

  const order = useMemo(() => filteredPeople.map((person) => person.userId), [filteredPeople]);

  useListHotkeys({
    onNext: () => {
      const next = selectedUserId ? neighborIds(order, selectedUserId).next : order[0];
      if (next) onSelectUserId(next);
    },
    onPrevious: () => {
      const previous = selectedUserId ? neighborIds(order, selectedUserId).previous : null;
      if (previous) onSelectUserId(previous);
    },
    enabled: order.length > 0
  });

  // A new reporter (or Refresh) starts over while rendering: the last copy at once, else the loader.
  const [shown, setShown] = useState<{ userId: string | null; refreshToken: number | undefined } | null>(null);
  if (shown === null || shown.userId !== selectedUserId || shown.refreshToken !== refreshToken) {
    setShown({ userId: selectedUserId, refreshToken });
    if (!selectedUserId) {
      setPayload(null);
      setMessage(null);
      setLoading(false);
    } else {
      const cached = cachedValue<StudentGradebookPayload>(studentCacheKey(selectedUserId));
      if (cached) {
        setPayload(cached);
      } else {
        setLoading(true);
      }
      setMessage(null);
    }
  }

  useEffect(() => {
    if (!selectedUserId) return;

    const userId = selectedUserId;
    let active = true;
    fetch(`/api/grades/admin?view=student&userId=${encodeURIComponent(userId)}`, {
      cache: "no-store"
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: StudentGradebookPayload;
          error?: { message?: string };
        };
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message ?? "Failed to load student gradebook.");
        }
        rememberValue(studentCacheKey(userId), body.data);
        if (!active) return;
        setPayload(body.data);
      })
      .catch((error) => {
        if (!active) return;
        setPayload(null);
        setMessage(error instanceof Error ? error.message : "Failed to load student gradebook.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedUserId, refreshToken]);

  const list = (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card lg:max-h-[calc(100dvh-var(--app-header-h,4rem)-2rem)]">
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <SearchField value={query} onChange={setQuery} placeholder="Find a reporter" size="touch" />
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {listLoading ? (
              "Loading reporters…"
            ) : (
              <>
                <span className="font-mono-broadcast tabular-nums">{filteredPeople.length}</span> reporters
              </>
            )}
          </span>
          <SortSelect value={sortBy} onChange={onSortChange} size="touch" className="w-32 shrink-0" />
          <IconButton label="Refresh" icon={RotateCw} variant="outline" size="touch" busy={refreshing} onClick={onRefresh} />
        </div>
      </div>
      <ul aria-label="Reporters" aria-busy={listLoading || undefined} className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {listLoading ? (
          Array.from({ length: 8 }, (_, index) => (
            <li key={index} aria-hidden className="flex min-h-12 flex-col justify-center gap-1.5 px-4 py-2">
              <Skeleton className={cn("h-3.5", index % 3 === 1 ? "w-1/2" : "w-2/3")} />
              <Skeleton className="h-2.5 w-1/3" />
            </li>
          ))
        ) : people.length === 0 ? (
          <li>
            <EmptyState size="inline" icon={Users} title="No reporters to grade yet" />
          </li>
        ) : filteredPeople.length === 0 ? (
          <li>
            <EmptyState
              size="inline"
              icon={SearchX}
              title={`No reporters match "${query.trim()}"`}
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              }
            />
          </li>
        ) : (
          filteredPeople.map((person) => {
            const active = person.userId === selectedUserId;
            return (
              <li key={person.userId}>
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => onSelectUserId(person.userId)}
                  className={cn(
                    "relative flex min-h-12 w-full flex-col items-start justify-center gap-0.5 px-4 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    active
                      ? "bg-[var(--brand-green)]/[0.12] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[var(--brand-green)]"
                      : "hover:bg-[var(--ink-3)]"
                  )}
                >
                  <span className="max-w-full truncate text-sm font-semibold text-foreground">
                    {person.name?.trim() || "Unnamed user"}
                  </span>
                  <span className="max-w-full truncate font-mono-broadcast text-[11px] text-muted-foreground" title={person.email ?? undefined}>
                    {emailLocalPart(person.email)}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );

  const detail = (
    <div className="min-w-0 space-y-4">
      {message ? <Alert tone="danger">{message}</Alert> : null}
      {!selectedUserId ? (
        <div className="rounded-md border border-border bg-card">
          <EmptyState icon={UserRound} title="Choose a reporter" description="Their gradebook appears here, the same one they see." />
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
          intro={false}
        />
      )}
    </div>
  );

  return (
    <ListDetail
      list={list}
      detail={detail}
      showDetailOnPhone={selectedUserId !== null}
      onBack={() => onSelectUserId(null)}
      backLabel="All reporters"
      listWidth="17rem"
    />
  );
}
