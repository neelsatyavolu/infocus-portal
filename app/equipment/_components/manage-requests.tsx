"use client";

import { useMemo, useState } from "react";
import { Check, Inbox } from "lucide-react";
import { ActionBar, Toolbar } from "@/components/kit/action-bar";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { useListHotkeys } from "@/components/kit/hotkeys";
import { KeyHints } from "@/components/kit/kbd";
import { KeyValueList } from "@/components/kit/key-value";
import { ListDetail } from "@/components/kit/layout";
import { List, ListRow } from "@/components/kit/list-row";
import { FilterChips } from "@/components/kit/filter-chips";
import { Panel } from "@/components/kit/panel";
import { useRememberedState } from "@/components/kit/remembered-state";
import { SectionLabel } from "@/components/kit/section";
import { ListDetailSkeleton, LoadingRegion } from "@/components/kit/skeleton";
import { StatusTag } from "@/components/kit/status-tag";
import { StickyActionBar } from "@/components/kit/sticky-action-bar";
import { Button } from "@/components/ui/button";
import type { RequestRow } from "@/components/equipment/equipment-api";
import {
  ITEM_STATE,
  REQUEST_STATE,
  canApprove,
  canDeny,
  formatShortDate,
  formatShortDateTime,
  itemCountLabel,
  itemStatus,
  requestReason,
  requestState,
  sortRequests,
  studentLabel
} from "@/components/equipment/equipment-status";
import { StatusLine } from "@/components/equipment/status-alert";
import { ABOVE_PHONE_TABBAR } from "@/components/equipment/sticky-bar";

type RequestFilter = "pending" | "all";
type Decision = "approve" | "deny";

function isRequestFilter(value: unknown): value is RequestFilter {
  return value === "pending" || value === "all";
}

function RequestStateTag({ request }: { request: RequestRow }) {
  const state = requestState(request);
  const style = REQUEST_STATE[state];
  return (
    <StatusTag tone={style.tone} icon={state === "fulfilled" ? Check : undefined}>
      {style.label}
    </StatusTag>
  );
}

/** Approve / Deny for one request (the one primary in the view is Approve). */
function DecisionButtons({
  request,
  busy,
  onDecide
}: {
  request: RequestRow;
  busy: boolean;
  onDecide: (id: string, action: Decision) => void;
}) {
  return (
    <>
      {canDeny(request) ? (
        <Button type="button" variant="destructive-quiet" disabled={busy} onClick={() => onDecide(request.id, "deny")}>
          Deny
        </Button>
      ) : null}
      {canApprove(request) ? (
        <Button type="button" disabled={busy} onClick={() => onDecide(request.id, "approve")}>
          Approve
        </Button>
      ) : null}
    </>
  );
}

function RequestDetail({
  request,
  busy,
  error,
  onDecide
}: {
  request: RequestRow;
  busy: boolean;
  /** Why the last Approve / Deny on this request failed. */
  error: string | null;
  onDecide: (id: string, action: Decision) => void;
}) {
  const hasActions = canApprove(request) || canDeny(request);
  // Why a button is missing, or (when both can show) what they do.
  const note =
    requestReason(request) ?? (hasActions ? "Approve or deny the whole request. Approving holds every item for this student." : null);
  return (
    <Panel
      title={studentLabel(request.student)}
      titleAs="h2"
      status={<RequestStateTag request={request} />}
      footer={
        note || hasActions ? (
          <>
            {note ? <p className="min-w-0 flex-[1_1_16rem]">{note}</p> : null}
            {hasActions ? (
              // Phones get these in the sticky action bar instead.
              <ActionBar align="end" className="ml-auto hidden lg:flex">
                <DecisionButtons request={request} busy={busy} onDecide={onDecide} />
              </ActionBar>
            ) : null}
          </>
        ) : null
      }
    >
      <div className="space-y-5">
        {error ? (
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}
        <KeyValueList
          items={[
            { label: "Student ID", value: request.student?.studentId ?? "—", mono: true },
            { label: "Email", value: request.email },
            { label: "Requested", value: formatShortDateTime(request.createdAt) }
          ]}
        />
        <div>
          <SectionLabel as="h3" className="mb-2">
            {itemCountLabel(request.items.length)}
          </SectionLabel>
          <ul aria-label="Requested items" className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {request.items.map((entry) => {
              const style = ITEM_STATE[itemStatus(entry.item)];
              return (
                <li key={entry.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm text-foreground">{entry.item.name}</p>
                    <p className="break-all font-mono text-xs tabular-nums text-muted-foreground">{entry.item.barcode}</p>
                  </div>
                  <StatusTag tone={style.tone}>{style.label}</StatusTag>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

/** The request queue: list on the left, the selected request on the right (one at a time on phones). */
export function ManageRequests({
  requests,
  loaded,
  active,
  busy,
  onDecide
}: {
  requests: RequestRow[];
  loaded: boolean;
  /** This tab is showing (J/K only work then). */
  active: boolean;
  busy: boolean;
  /** Resolves to the error message, or null when the change was saved. */
  onDecide: (id: string, action: Decision) => Promise<string | null>;
}) {
  // Every request shows by default (pending first, as before); Pending narrows to the queue.
  const [filter, setFilter] = useRememberedState<RequestFilter>("equipment:manage:request-filter:v1", "all", isRequestFilter);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phoneDetail, setPhoneDetail] = useState(false);
  const [decisionError, setDecisionError] = useState<{ id: string; message: string } | null>(null);

  const sorted = useMemo(() => sortRequests(requests), [requests]);
  const pending = useMemo(() => sorted.filter((row) => row.status === "PENDING"), [sorted]);
  const shown = filter === "pending" ? pending : sorted;
  // Keep the selection by id across reloads; fall back to the first row on desktop. A phone that
  // has a request open goes back to the list if it drops out, rather than swap in another student.
  const kept = shown.find((row) => row.id === selectedId) ?? null;
  const selected = kept ?? shown[0] ?? null;
  const showPhoneDetail = phoneDetail && kept !== null;
  const selectedError = selected && decisionError?.id === selected.id ? decisionError.message : null;

  function step(delta: number) {
    if (shown.length === 0) return;
    const index = selected ? shown.findIndex((row) => row.id === selected.id) : -1;
    const next = shown[Math.min(shown.length - 1, Math.max(0, index + delta))];
    setSelectedId(next.id);
  }

  /** Saves one decision; a failure stays on that request. Resolves true when it saved. */
  async function decide(id: string, action: Decision) {
    setDecisionError(null);
    const error = await onDecide(id, action);
    if (error) setDecisionError({ id, message: error });
    return error === null;
  }

  useListHotkeys({ onNext: () => step(1), onPrevious: () => step(-1), enabled: active && shown.length > 0 });

  if (!loaded) {
    return (
      <LoadingRegion label="Loading requests">
        <ListDetailSkeleton rows={6} />
      </LoadingRegion>
    );
  }

  // With nothing to list, one full-width card (no empty detail column beside it).
  const empty =
    shown.length === 0 ? (
      <div className="rounded-md border border-border bg-card">
        {filter === "pending" ? (
          <EmptyState
            icon={Inbox}
            title="No pending requests."
            action={
              <Button type="button" variant="ghost" onClick={() => setFilter("all")}>
                Show all
              </Button>
            }
          />
        ) : (
          <EmptyState icon={Inbox} title="No requests." />
        )}
      </div>
    ) : null;

  const list = (
    <List aria-label="Requests">
      {shown.map((request) => (
        <ListRow
          key={request.id}
          title={studentLabel(request.student)}
          tags={<RequestStateTag request={request} />}
          subtitle={`${itemCountLabel(request.items.length)} · ${formatShortDate(request.createdAt)}`}
          active={selected?.id === request.id}
          onClick={() => {
            setSelectedId(request.id);
            setPhoneDetail(true);
          }}
        />
      ))}
    </List>
  );

  return (
    <div className="space-y-4">
      <Toolbar
        aria-label="Filter requests"
        size="touch"
        start={
          <FilterChips
            ariaLabel="Show"
            size="touch"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "pending", label: "Pending", count: pending.length, tone: pending.length > 0 ? "warning" : undefined },
              { value: "all", label: "All", count: sorted.length }
            ]}
          />
        }
        end={<KeyHints items={[{ keys: ["J", "K"], label: "Next / previous request" }]} />}
      />
      {empty ?? (
        <ListDetail
          list={list}
          detail={
            selected ? (
              <RequestDetail
                request={selected}
                busy={busy}
                error={selectedError}
                onDecide={(id, action) => void decide(id, action)}
              />
            ) : null
          }
          showDetailOnPhone={showPhoneDetail}
          onBack={() => setPhoneDetail(false)}
          backLabel="All requests"
        />
      )}
      {showPhoneDetail && selected && (canApprove(selected) || canDeny(selected)) ? (
        <StickyActionBar
          reserveLauncher={false}
          className={`lg:hidden ${ABOVE_PHONE_TABBAR}`}
          // A failed decision also shows beside the buttons, in case the request's alert is scrolled away.
          status={selectedError ? <StatusLine status={{ type: "error", text: selectedError }} /> : undefined}
        >
          <DecisionButtons
            request={selected}
            busy={busy}
            onDecide={(id, action) => {
              // On phones, a saved decision returns to the list (the result shows in the message under the tabs).
              void decide(id, action).then((saved) => {
                if (saved) setPhoneDetail(false);
              });
            }}
          />
        </StickyActionBar>
      ) : null}
    </div>
  );
}
