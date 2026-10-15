"use client";

import { Check, Inbox, X } from "lucide-react";
import { TableShell } from "@/components/kit/data-table";
import { EmptyState, ErrorState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { SectionHeader } from "@/components/kit/section";
import { PanelSkeleton } from "@/components/kit/skeleton";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { type QueueRequest, formatDayKey, personLabel } from "./participation-week";

function scoreChange(current: number | null, next: number) {
  return `${current === null ? "—" : current} → ${next}`;
}

function DecisionButtons({
  request,
  deciding,
  onDecide,
  stacked
}: {
  request: QueueRequest;
  deciding: boolean;
  onDecide: (requestId: string, approved: boolean) => void;
  stacked: boolean;
}) {
  // Neither is filled: several requests can be on screen, and a view has at most one primary.
  const size = stacked ? "h-10 flex-1" : "h-8";
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="destructive-quiet"
        className={size}
        disabled={deciding}
        onClick={() => onDecide(request.id, false)}
      >
        {deciding ? <Spinner /> : <X aria-hidden />}
        Deny
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={size}
        disabled={deciding}
        onClick={() => onDecide(request.id, true)}
      >
        {deciding ? <Spinner /> : <Check aria-hidden />}
        Approve
      </Button>
    </>
  );
}

function RequestPanel({
  request,
  deciding,
  onDecide,
  wide
}: {
  request: QueueRequest;
  deciding: boolean;
  onDecide: (requestId: string, approved: boolean) => void;
  wide: boolean;
}) {
  const count = request.items.length;
  return (
    <Panel
      as="article"
      padding="none"
      title={personLabel(request.requestedBy)}
      status={
        request.canReview ? (
          <StatusTag tone="warning">Needs you</StatusTag>
        ) : (
          <StatusTag tone="neutral" title="Waiting for another producer">
            Waiting
          </StatusTag>
        )
      }
      description={`${count} score${count === 1 ? "" : "s"} · ${new Date(request.createdAt).toLocaleString()}`}
      actions={
        request.canReview && wide ? <DecisionButtons request={request} deciding={deciding} onDecide={onDecide} stacked={false} /> : null
      }
      footer={
        request.canReview && !wide ? (
          <span className="flex w-full gap-2">
            <DecisionButtons request={request} deciding={deciding} onDecide={onDecide} stacked />
          </span>
        ) : null
      }
    >
      {wide ? (
        <TableShell
          dense
          className="rounded-none border-0 bg-transparent"
          // First and last columns line up with the card header (20px), not the table's 12px.
          tableClassName="[&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5"
          caption={`Scores from ${personLabel(request.requestedBy)}`}
        >
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Day</th>
              <th scope="col" className="text-right!">
                Score
              </th>
              <th scope="col" className="w-[45%]">
                Comment
              </th>
            </tr>
          </thead>
          <tbody>
            {request.items.map((item) => (
              <tr key={`${item.userId}:${item.date}`}>
                <td className="text-foreground">{item.studentName ?? item.studentEmail ?? "Student"}</td>
                <td className="whitespace-nowrap text-muted-foreground">{formatDayKey(item.date)}</td>
                <td className="whitespace-nowrap text-right font-mono-broadcast tabular-nums text-foreground">
                  {scoreChange(item.currentPoints, item.points)}
                </td>
                <td className="text-[var(--ink-text)]">{item.notes.trim() || "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      ) : (
        <ul className="divide-y divide-border">
          {request.items.map((item) => (
            <li key={`${item.userId}:${item.date}`} className="px-4 py-3">
              <div className="flex min-w-0 items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-foreground">
                  {item.studentName ?? item.studentEmail ?? "Student"}
                  <span className="text-muted-foreground"> · {formatDayKey(item.date)}</span>
                </p>
                <span className="shrink-0 font-mono-broadcast text-sm tabular-nums text-foreground">
                  {scoreChange(item.currentPoints, item.points)}
                </span>
              </div>
              {item.notes.trim() ? <p className="mt-1 text-[13px] text-[var(--ink-text)]">{item.notes.trim()}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * The pending queue as a view of the page (the Pending segment): requests you can approve first,
 * then your own, which wait for another producer. Full marks never land here.
 */
export function ParticipationPending({
  queue,
  loading,
  error,
  onRetry,
  decidingId,
  onDecide,
  wide
}: {
  queue: QueueRequest[] | null;
  loading: boolean;
  /** The last queue load failed (with no list to show, this replaces the empty state). */
  error: string | null;
  onRetry: () => void;
  decidingId: string | null;
  onDecide: (requestId: string, approved: boolean) => void;
  /** lg and up: item tables and header actions; below: stacked items and a full-width button row. */
  wide: boolean;
}) {
  const needsYou = (queue ?? []).filter((request) => request.canReview);
  const waiting = (queue ?? []).filter((request) => !request.canReview);

  return (
    <div className="min-w-0 space-y-5">
      {queue === null && loading ? (
        <div aria-busy="true" aria-label="Loading requests" className="space-y-4">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={2} />
        </div>
      ) : queue === null && error ? (
        <div className="rounded-md border border-border bg-card">
          <ErrorState title="Couldn't load pending requests" message={error} onRetry={onRetry} busy={loading} />
        </div>
      ) : !queue || queue.length === 0 ? (
        <div className="rounded-md border border-border bg-card">
          <EmptyState icon={Inbox} title="No pending participation grades." description="Full marks already posted." />
        </div>
      ) : (
        <>
          {needsYou.length > 0 ? (
            <section aria-labelledby="pending-needs-you" className="space-y-3">
              <SectionHeader id="pending-needs-you" as="h2" title="Needs your approval" count={needsYou.length} />
              {needsYou.map((request) => (
                <RequestPanel
                  key={request.id}
                  request={request}
                  deciding={decidingId === request.id}
                  onDecide={onDecide}
                  wide={wide}
                />
              ))}
            </section>
          ) : null}
          {waiting.length > 0 ? (
            <section aria-labelledby="pending-yours" className="space-y-3">
              <SectionHeader
                id="pending-yours"
                as="h2"
                title="Your requests"
                count={waiting.length}
                description="You can't approve your own request."
              />
              {waiting.map((request) => (
                <RequestPanel
                  key={request.id}
                  request={request}
                  deciding={decidingId === request.id}
                  onDecide={onDecide}
                  wide={wide}
                />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
