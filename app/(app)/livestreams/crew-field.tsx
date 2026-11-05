"use client";

import { useId, useRef, useState } from "react";
import { Plus, RotateCw, X } from "lucide-react";
import { InlineError } from "@/components/kit/alert";
import { fieldClass, fieldLabelClass } from "@/components/kit/field";
import { IconButton } from "@/components/kit/icon-button";
import { SearchField } from "@/components/kit/search-field";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { CREDIT_ERROR } from "./livestreams-form";
import { memberLabel, memberMatches, personLabel, type EventRow, type Member } from "./livestreams-model";

/** Search shows at most this many people, so the results never need a scroll box of their own. */
const MAX_MATCHES = 8;

/** The remove button's square (IconButton size "touch"), so the header lines up with the rows. */
const REMOVE_SLOT = "w-10 shrink-0 md:w-9";

/**
 * Search-to-add: matching members (nickname, legal name or email) show only while there is a
 * query. Click one, or press Enter for the top match not already on the crew. Enter never saves
 * the form; ⌘/Ctrl+Enter is left to reach the form and save.
 */
function MemberSearch({
  members,
  membersError,
  onRetryMembers,
  selected,
  onAdd
}: {
  members: Member[] | null;
  membersError: string | null;
  onRetryMembers: () => void;
  selected: ReadonlySet<string>;
  onAdd: (userId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (membersError && !members) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <InlineError>{membersError}</InlineError>
        <Button type="button" variant="outline" size="sm" onClick={onRetryMembers}>
          <RotateCw aria-hidden />
          Try again
        </Button>
      </div>
    );
  }

  const q = query.trim();
  const matches = q && members ? members.filter((member) => memberMatches(member, q)) : [];
  const shown = matches.slice(0, MAX_MATCHES);
  const top = matches.find((member) => !selected.has(member.id));

  function add(member: Member) {
    onAdd(member.id);
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-2">
      <SearchField
        value={query}
        onChange={setQuery}
        inputRef={inputRef}
        placeholder="Search members to add"
        ariaLabel="Search members"
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.metaKey || event.ctrlKey) return;
          event.preventDefault();
          if (top) add(top);
        }}
      />
      {q ? (
        <ul aria-label="Matching members" className="divide-y divide-border rounded-md border border-border">
          {!members ? (
            <li className="flex h-10 items-center gap-2 px-3 text-sm text-muted-foreground">
              <Spinner />
              Loading members…
            </li>
          ) : shown.length ? (
            shown.map((member) => {
              const onCrew = selected.has(member.id);
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    disabled={onCrew}
                    onClick={() => add(member)}
                    className="flex min-h-10 w-full items-center gap-3 px-3 text-left text-sm text-foreground transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent md:min-h-9"
                  >
                    <Plus aria-hidden className={cn("h-4 w-4 shrink-0 text-muted-foreground", onCrew && "invisible")} />
                    <span className={cn("min-w-0 flex-1 truncate", onCrew && "text-muted-foreground")}>{memberLabel(member)}</span>
                    {member.email ? (
                      <span className="min-w-0 max-w-[45%] truncate text-xs text-muted-foreground max-sm:hidden">{member.email}</span>
                    ) : null}
                    {onCrew ? <StatusTag tone="success">On crew</StatusTag> : null}
                  </button>
                </li>
              );
            })
          ) : (
            <li className="flex h-10 items-center px-3 text-sm text-muted-foreground">No matches.</li>
          )}
          {matches.length > shown.length ? (
            <li className="flex h-9 items-center px-3 text-xs text-muted-foreground">
              {matches.length - shown.length} more. Keep typing to narrow it down.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Crew: search to add people, then one table of the crew, a row per person with their own
 * credit hours (blank = event default) and remove. Anyone on the crew can be removed, even
 * someone missing from the member list.
 */
export function CrewField({
  attendeeIds,
  credits,
  capacity,
  defaultHours,
  members,
  membersError,
  onRetryMembers,
  event,
  creditIdPrefix,
  creditErrors,
  onAdd,
  onRemove,
  onCreditChange
}: {
  attendeeIds: string[];
  credits: Record<string, string>;
  capacity: number;
  defaultHours: string;
  members: Member[] | null;
  membersError: string | null;
  onRetryMembers: () => void;
  event: EventRow | null;
  /** Each credit input's id is `${creditIdPrefix}-${userId}`, so a failed save can focus it. */
  creditIdPrefix: string;
  /** Crew members whose credit hours are out of range. */
  creditErrors?: string[];
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
  onCreditChange: (userId: string, value: string) => void;
}) {
  const labelId = useId();
  const creditErrorId = `${creditIdPrefix}-error`;
  const invalid = new Set(creditErrors ?? []);
  const selected = new Set(attendeeIds);
  const over = capacity > 0 && attendeeIds.length > capacity;

  function nameFor(userId: string) {
    const member = members?.find((person) => person.id === userId);
    if (member) return memberLabel(member);
    return personLabel(event?.attendees.find((attendee) => attendee.id === userId));
  }

  return (
    <div role="group" aria-labelledby={labelId} className="min-w-0 space-y-3">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <span id={labelId} className={fieldLabelClass}>
          Crew
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {over ? <StatusTag tone="warning">Over capacity</StatusTag> : null}
          <span className="font-mono-broadcast tabular-nums">
            {attendeeIds.length} / {capacity || "—"}
          </span>
          selected
        </span>
      </div>
      <MemberSearch
        members={members}
        membersError={membersError}
        onRetryMembers={onRetryMembers}
        selected={selected}
        onAdd={onAdd}
      />
      {attendeeIds.length ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-md border border-border">
            <div aria-hidden className="flex h-8 items-center gap-3 border-b border-border px-3">
              <span className={cn(fieldLabelClass, "min-w-0 flex-1")}>Name</span>
              <span className={cn(fieldLabelClass, "w-28 shrink-0")}>Credit hours</span>
              <span className={REMOVE_SLOT} />
            </div>
            <ul aria-label="Crew members" className="divide-y divide-border">
              {attendeeIds.map((userId) => {
                const name = nameFor(userId);
                const bad = invalid.has(userId);
                return (
                  <li key={userId} className="flex min-h-12 items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={name}>
                      {name}
                    </span>
                    <input
                      id={`${creditIdPrefix}-${userId}`}
                      type="number"
                      min={0}
                      max={24}
                      step={0.25}
                      aria-label={`Credit hours for ${name}`}
                      aria-invalid={bad || undefined}
                      aria-describedby={bad ? creditErrorId : undefined}
                      className={cn(fieldClass, "h-10 w-28 shrink-0 font-mono-broadcast tabular-nums md:h-9")}
                      value={credits[userId] ?? ""}
                      placeholder={`Default (${defaultHours || "0"})`}
                      onChange={(e) => onCreditChange(userId, e.target.value)}
                    />
                    <IconButton
                      label={`Remove ${name} from crew`}
                      icon={X}
                      size="touch"
                      tooltip={false}
                      className={REMOVE_SLOT}
                      onClick={() => onRemove(userId)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
          {attendeeIds.some((userId) => invalid.has(userId)) ? <InlineError id={creditErrorId}>{CREDIT_ERROR}</InlineError> : null}
          <p className="text-[13px] leading-snug text-muted-foreground">
            Leave blank for the event default. Enter 0 for no credit. Individual values are ignored when default credit is 0.
          </p>
        </div>
      ) : (
        <p className="text-[13px] leading-snug text-muted-foreground">No crew yet. Search above to add people.</p>
      )}
    </div>
  );
}
