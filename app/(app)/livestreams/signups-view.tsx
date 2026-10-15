"use client";

import { useState } from "react";
import { Check, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/kit/empty-state";
import { Spinner } from "@/components/kit/spinner";
import { StatusDot, StatusTag } from "@/components/kit/status-tag";
import { RelativeAge } from "@/components/relative-age";
import { Button } from "@/components/ui/button";
import {
  arrivalLabel,
  capacityTag,
  formatWhen,
  groupRequests,
  personLabel,
  type Payload,
  type PendingSignup,
  type RequestGroup
} from "./livestreams-model";
import { errorMessage } from "./use-livestreams-data";

export function signupGroupId(key: string) {
  return `signup-group-${key}`;
}

type Review = (signupId: string, status: "APPROVED" | "DENIED") => Promise<void>;

function RequestRow({
  request,
  isNew,
  pending,
  onReview
}: {
  request: PendingSignup;
  isNew: boolean;
  pending: "APPROVED" | "DENIED" | null;
  onReview: (request: PendingSignup, status: "APPROVED" | "DENIED") => void;
}) {
  const name = personLabel(request.user);
  return (
    <li className="grid min-w-0 gap-x-4 gap-y-2 border-t border-border px-4 py-3 md:grid-cols-[14rem_minmax(0,1fr)_4rem_11rem] md:items-center md:px-5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {isNew ? <StatusDot tone="new" label="New since your last visit" /> : null}
        <span className="truncate text-sm font-medium text-foreground" title={name}>
          {name}
        </span>
        {!request.availableFullEvent ? <StatusTag tone="warning">Partial availability</StatusTag> : null}
      </div>
      <p className="line-clamp-2 min-w-0 text-[13px] text-muted-foreground" title={request.note || undefined}>
        {request.note || "No note"}
      </p>
      <p
        className="font-mono-broadcast text-xs tabular-nums text-muted-foreground md:text-right"
        title={`Requested ${formatWhen(request.createdAt)}`}
      >
        <span className="md:sr-only">Requested </span>
        <RelativeAge iso={request.createdAt} />
        <span className="md:sr-only"> ago</span>
      </p>
      <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 text-sm md:h-8 md:text-xs"
          disabled={pending !== null}
          aria-label={`Approve ${name}`}
          onClick={() => onReview(request, "APPROVED")}
        >
          {pending === "APPROVED" ? <Spinner /> : <Check aria-hidden className="text-[var(--brand-green)]" />}
          Approve
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 text-sm md:h-8 md:text-xs"
          disabled={pending !== null}
          aria-label={`Deny ${name}`}
          onClick={() => onReview(request, "DENIED")}
        >
          {pending === "DENIED" ? <Spinner /> : null}
          Deny
        </Button>
      </div>
    </li>
  );
}

function GroupPanel({
  group,
  now,
  newIds,
  pending,
  onReview
}: {
  group: RequestGroup;
  now: Date;
  newIds: ReadonlySet<string>;
  pending: Record<string, "APPROVED" | "DENIED">;
  onReview: (request: PendingSignup, status: "APPROVED" | "DENIED") => void;
}) {
  const { event } = group;
  const tag = event ? capacityTag(event, now, true) : null;
  const when = group.startsAt ? formatWhen(group.startsAt) : "—";
  return (
    <section
      id={signupGroupId(group.key)}
      aria-label={group.title}
      className="scroll-mt-24 overflow-hidden rounded-md border border-border bg-card"
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 md:px-5">
        <div className="min-w-0">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold leading-snug tracking-[-0.01em] text-foreground">
            <span className="truncate">{group.title}</span>
            {group.otherSemester ? <StatusTag>Other semester</StatusTag> : null}
          </h2>
          <p className="text-[13px] tabular-nums text-muted-foreground">
            {when}
            {event ? ` · ${arrivalLabel(event)}` : ""}
          </p>
        </div>
        {event ? (
          <p className="flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
            Crew
            <span className="font-mono-broadcast tabular-nums text-foreground">
              {event.attendeeCount}/{event.capacity}
            </span>
            {tag ? <StatusTag tone={tag.tone}>{tag.label}</StatusTag> : null}
          </p>
        ) : null}
      </header>
      <ul>
        {group.requests.map((request) => (
          <RequestRow
            key={request.id}
            request={request}
            isNew={newIds.has(request.id)}
            pending={pending[request.id] ?? null}
            onReview={onReview}
          />
        ))}
      </ul>
    </section>
  );
}

/** Managers' request queue, one panel per livestream so the crew room is in view before approving. */
export function SignupsView({
  payload,
  now,
  newIds,
  onReview
}: {
  payload: Payload;
  now: Date;
  newIds: ReadonlySet<string>;
  onReview: Review;
}) {
  const [pending, setPending] = useState<Record<string, "APPROVED" | "DENIED">>({});
  const groups = groupRequests(payload.pendingSignups, payload.events, now);

  async function review(request: PendingSignup, status: "APPROVED" | "DENIED") {
    setPending((current) => ({ ...current, [request.id]: status }));
    try {
      await onReview(request.id, status);
      toast.success(status === "APPROVED" ? "Approved: added to crew" : "Denied");
    } catch (e) {
      toast.error(errorMessage(e, "Review failed"));
    } finally {
      setPending((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== request.id)));
    }
  }

  return (
    // The pending count is on the Sign ups tab; the header line says what a decision does.
    <section aria-label="Sign-up requests" className="space-y-3">
      {groups.length === 0 ? (
        <div className="rounded-md border border-border bg-card">
          <EmptyState icon={CheckCircle2} title="Inbox clear — no pending sign-ups." />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <GroupPanel
              key={group.key}
              group={group}
              now={now}
              newIds={newIds}
              pending={pending}
              onReview={(request, status) => void review(request, status)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
