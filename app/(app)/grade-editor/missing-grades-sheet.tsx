"use client";

import { useMemo, useState } from "react";
import { ClipboardList, UserMinus } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { SearchField } from "@/components/kit/search-field";
import { SectionLabel } from "@/components/kit/section";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Sheet } from "@/components/kit/sheet";
import { ListSkeleton } from "@/components/kit/skeleton";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { MissingPayload, MissingPerson, MissingStatus } from "./grade-editor-types";
import { matchesSearch, personLabel, STATUS_TONE } from "./grade-editor-utils";

/** Same words and tones as the row tags and filter chips in the cycle table. */
const STATUS_TAG: Record<MissingStatus, { label: string; tone: (typeof STATUS_TONE)[keyof typeof STATUS_TONE] }> = {
  not_entered: { label: "Not entered", tone: STATUS_TONE.notEntered },
  unpublished: { label: "Unpublished", tone: STATUS_TONE.unpublished }
};

/** 40px on phones (this is a bottom sheet there), 32px from md. */
const ROW_BUTTON = "h-10 shrink-0 md:h-8";

type Tab = "missing" | "exclude";

type CycleGroup = {
  cycleNumber: number;
  focus: string;
  entries: Array<{ person: MissingPerson; status: MissingStatus }>;
  notEntered: number;
  unpublished: number;
};

function groupByCycle(data: MissingPayload, excludedIds: readonly string[]): CycleGroup[] {
  const visible = data.missingReport.filter((person) => !excludedIds.includes(person.userId));
  return data.consideredCycleNumbers
    .map((cycleNumber) => {
      const entries = visible
        .flatMap((person) =>
          person.missing.filter((entry) => entry.cycleNumber === cycleNumber).map((entry) => ({ person, status: entry.status }))
        )
        .sort((a, b) => (a.status === b.status ? 0 : a.status === "not_entered" ? -1 : 1));
      return {
        cycleNumber,
        focus: data.cycles.find((cycle) => cycle.cycleNumber === cycleNumber)?.focus?.trim() ?? "",
        entries,
        notEntered: entries.filter((entry) => entry.status === "not_entered").length,
        unpublished: entries.filter((entry) => entry.status === "unpublished").length
      };
    })
    .filter((group) => group.entries.length > 0);
}

/**
 * Missing grades, grouped by the cycle you'd fix: people with no grade (Not entered) or an
 * unpublished one, for every cycle that has at least one grade. Exempt final cuts never appear.
 * Excluding someone hides them here (and from every count) in this browser only.
 */
export function MissingGradesSheet({
  open,
  onOpenChange,
  data,
  loading,
  error,
  excludedIds,
  isExcluded,
  toggleExcluded,
  openCycleBlockedReason,
  onOpenCycle
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: MissingPayload | null;
  loading: boolean;
  error: string | null;
  excludedIds: string[];
  isExcluded: (userId: string) => boolean;
  toggleExcluded: (userId: string) => void;
  /** Why a cycle can't open right now (Save all or Publish all is running), or null. */
  openCycleBlockedReason: (cycleNumber: number) => string | null;
  /** Opens that cycle (the unsaved-changes confirm still applies) with the matching filter. */
  onOpenCycle: (cycleNumber: number, hasNotEntered: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("missing");
  const [query, setQuery] = useState("");

  const groups = useMemo(() => (data ? groupByCycle(data, excludedIds) : []), [data, excludedIds]);
  const missingPeople = useMemo(
    () => (data ? data.missingReport.filter((person) => !excludedIds.includes(person.userId)).length : 0),
    [data, excludedIds]
  );
  const people = useMemo(() => (data ? data.people.filter((person) => matchesSearch(person, query)) : []), [data, query]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      width="md"
      className="md:max-w-[30rem]"
      title="Missing grades"
      description={
        tab === "exclude"
          ? "Excluded people are hidden from the missing list. Toggle to exclude or restore. Saved in this browser."
          : "People who have no grade entered, or a grade that is not yet published, for a started cycle."
      }
      headerExtra={
        <>
          <SegmentedControl<Tab>
            ariaLabel="Missing grades view"
            size="touch"
            value={tab}
            onChange={setTab}
            options={[
              { value: "missing", label: "Missing", count: missingPeople },
              { value: "exclude", label: "Exclude people", count: excludedIds.length }
            ]}
          />
          {loading && data ? (
            <StatusTag tone="neutral" spinner title="Loading the latest missing grades">
              Updating
            </StatusTag>
          ) : null}
        </>
      }
    >
      {error ? (
        <Alert tone="danger" compact>
          {error}
        </Alert>
      ) : !data ? (
        loading ? (
          <ListSkeleton rows={6} leading={false} />
        ) : null
      ) : tab === "exclude" ? (
        <div className="space-y-3">
          <SearchField value={query} onChange={setQuery} placeholder="Find a person" size="touch" />
          <SectionLabel end="Saved in this browser">{`${excludedIds.length} excluded`}</SectionLabel>
          {people.length === 0 ? (
            <EmptyState size="inline" title="No people to show." />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {people.map((person) => (
                <li key={person.userId}>
                  <Checkbox
                    checked={isExcluded(person.userId)}
                    onCheckedChange={() => toggleExcluded(person.userId)}
                    labelClassName="flex min-h-12 w-full items-center gap-3 px-3 py-2 hover:bg-[var(--ink-3)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">{personLabel(person)}</span>
                      {person.email ? (
                        <span className="block truncate font-mono-broadcast text-xs text-muted-foreground">{person.email}</span>
                      ) : null}
                    </span>
                  </Checkbox>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No missing grades. All caught up." />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.cycleNumber} aria-labelledby={`missing-cycle-${group.cycleNumber}`} className="space-y-2">
              <div className="flex min-h-8 items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 id={`missing-cycle-${group.cycleNumber}`} className="truncate text-sm font-semibold text-foreground">
                    Cycle {group.cycleNumber}
                    {group.focus ? <span className="font-normal text-muted-foreground"> · {group.focus}</span> : null}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {[
                      group.notEntered > 0 ? `${group.notEntered} not entered` : null,
                      group.unpublished > 0 ? `${group.unpublished} unpublished` : null
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={ROW_BUTTON}
                  disabled={openCycleBlockedReason(group.cycleNumber) !== null}
                  title={openCycleBlockedReason(group.cycleNumber) ?? undefined}
                  onClick={() => onOpenCycle(group.cycleNumber, group.notEntered > 0)}
                >
                  Open cycle {group.cycleNumber}
                </Button>
              </div>
              <ul className="divide-y divide-border rounded-md border border-border">
                {group.entries.map(({ person, status }) => (
                  <li key={`${person.userId}-${status}`} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{personLabel(person)}</span>
                      {person.email ? (
                        <span className="block truncate font-mono-broadcast text-xs text-muted-foreground">{person.email}</span>
                      ) : null}
                    </span>
                    <StatusTag size="sm" tone={STATUS_TAG[status].tone}>
                      {STATUS_TAG[status].label}
                    </StatusTag>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={ROW_BUTTON}
                      aria-label={`Exclude ${personLabel(person)}`}
                      onClick={() => toggleExcluded(person.userId)}
                    >
                      <UserMinus aria-hidden />
                      Exclude
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Sheet>
  );
}
