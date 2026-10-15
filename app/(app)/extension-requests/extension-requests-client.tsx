"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarPlus, Hourglass, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ApproveExtensionDialog } from "./approve-extension-dialog";
import { DenyExtensionDialog } from "./deny-extension-dialog";
import { GrantExtensionDialog } from "./grant-extension-dialog";
import { HowItWorks } from "./how-it-works";
import type { RequestActions } from "./request-actions";
import { RequestExtensionDialog } from "./request-extension-dialog";
import { RequestList, RequestListError, RequestListSkeleton } from "./request-list";
import { RequestToolbar } from "./request-toolbar";
import {
  anyRowPrimary,
  buildRequestView,
  grantedTerms,
  hasLiveRequestFor,
  sortViews,
  type Payload,
  type RequestView,
  type Viewer
} from "./request-view";
import { useExtensionRequests } from "./use-extension-requests";
import { useRequestQueue } from "./use-request-queue";

function viewsOf(payload: Payload) {
  return sortViews(payload.requests.map((entry) => buildRequestView(entry, payload.currentUserId)));
}

function contextOf(view: RequestView) {
  return `${view.title} · Cycle ${view.entry.cycleNumber}`;
}

export default function ExtensionRequestsClient({ viewer }: { viewer: Viewer }) {
  const data = useExtensionRequests();
  const { payload } = data;
  const views = useMemo(() => (payload ? viewsOf(payload) : null), [payload]);
  const queue = useRequestQueue(views);
  const howId = useId();

  const [approving, setApproving] = useState<{ view: RequestView; grant: boolean } | null>(null);
  const [denying, setDenying] = useState<RequestView | null>(null);
  const [granting, setGranting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const announceTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(announceTimer.current), []);

  /** Clear, then set: the live region reads a repeated message ("Approved.") again. */
  function announce(message: string) {
    setAnnouncement("");
    window.clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(() => setAnnouncement(message), 100);
  }

  // The request draft lives here, so closing the dialog keeps it. The cycle follows the
  // viewer's active cycle until they pick one.
  const [requesting, setRequesting] = useState(false);
  const [cyclePick, setCyclePick] = useState<number | null>(null);
  const [requestedDays, setRequestedDays] = useState(2);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const requestCycle = cyclePick ?? payload?.activeCycleNumber ?? null;
  const cycleOptions = useMemo(() => {
    const numbers = payload?.cycleNumbers ?? [];
    if (requestCycle === null || numbers.includes(requestCycle)) return numbers;
    return [...numbers, requestCycle].sort((a, b) => a - b);
  }, [payload, requestCycle]);

  const me = payload?.currentUserId ?? "";
  const canGrant = payload?.canGrant ?? viewer.canGrant;

  async function submitRequest() {
    if (submitting || requestCycle === null) return;
    setSubmitting(true);
    const ok = await data.submitRequest({ cycleNumber: requestCycle, requestedDays, reason });
    setSubmitting(false);
    if (ok) {
      setReason("");
      setRequesting(false);
    }
  }

  /**
   * After a decision, open the next request that waits on the viewer and say so. With none left,
   * keep the decided request open (showing its new state) and focused, so focus never drops to
   * the page when its buttons unmount.
   */
  function advance(decidedId: string, verb: string, next: Payload | null) {
    const following = next ? viewsOf(next).find((view) => view.awaitsMe && view.entry.id !== decidedId) : undefined;
    announce(following ? `${verb}. Next: ${following.title}` : `${verb}.`);
    queue.openAndFocus(following ? following.entry.id : decidedId);
  }

  const actions: RequestActions = {
    canEmail: canGrant,
    memberBusy: data.memberBusy,
    emailingId: data.emailingId,
    onMemberDecision: async (view, agreed) => {
      const result = await data.decideMember(view.entry.id, agreed);
      if (result.ok) advance(view.entry.id, agreed ? "Agreed" : "Declined", result.data);
    },
    onApprove: (view, grant) => setApproving({ view, grant }),
    onDeny: (view) => setDenying(view),
    onEmail: (view) => void data.emailGroup(view.entry.id)
  };

  const studentHasLive =
    !viewer.isProducer && hasLiveRequestFor(views ?? [], payload?.activeCycleNumber ?? null, ["PENDING", "APPROVED"]);
  // One primary per view, from the data only (it never flips as rows open): a request that
  // carries a decision button wins; otherwise the header's main job is filled.
  const rowHasPrimary = anyRowPrimary(views ?? []);
  const requestVariant = viewer.isProducer || rowHasPrimary || studentHasLive ? "outline" : "default";
  const grantVariant = rowHasPrimary ? "outline" : "default";
  // With no requests the rules panel stays open and there is nothing to filter, so no toolbar.
  const showToolbar = views === null ? !data.loadError : views.length > 0;
  const openRequest = () => setRequesting(true);
  const closeDecisionDialogs = () => {
    setApproving(null);
    setDenying(null);
  };

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Hourglass aria-hidden className="h-3 w-3" />
            Package deadlines
          </>
        }
        title="Extension Requests"
        description={
          viewer.isProducer
            ? "Every member agrees first, then two producer approvals. The first approver sets the days and who gets them."
            : "Ask for more time for your whole package group. Every member agrees, then two producers approve."
        }
        actions={
          <>
            <Button type="button" variant={requestVariant} onClick={openRequest}>
              <CalendarPlus aria-hidden />
              Request extension
            </Button>
            {viewer.isProducer && canGrant ? (
              // The dialog starts on the payload's active cycle, so it waits for the list.
              <Button type="button" variant={grantVariant} disabled={payload === null} onClick={() => setGranting(true)}>
                <Plus aria-hidden />
                Grant an extension
              </Button>
            ) : null}
          </>
        }
      />

      {showToolbar ? (
        <RequestToolbar
          counts={views === null ? null : queue.counts}
          filter={queue.filter}
          onFilterChange={queue.setFilter}
          showKeyHint={queue.visible.length > 1}
          busy={data.refreshing && payload !== null}
          howOpen={queue.howOpen}
          howId={howId}
          onToggleHow={queue.toggleHow}
        />
      ) : null}

      {queue.howOpen ? <HowItWorks id={howId} /> : null}

      {payload === null ? (
        data.loadError ? (
          <RequestListError message={data.loadError} retrying={data.refreshing} onRetry={() => void data.load()} />
        ) : (
          <RequestListSkeleton />
        )
      ) : (
        <RequestList
          total={views?.length ?? 0}
          matchingCount={queue.matchingCount}
          shown={queue.shown}
          denied={queue.denied}
          deniedOpen={queue.deniedOpen}
          onToggleDenied={queue.toggleDenied}
          filter={queue.filter}
          emptyDescription={
            viewer.isProducer
              ? "Requests from package groups show up here."
              : "Requests show up here with each teammate's agreement and the producer votes."
          }
          onShowAll={() => queue.setFilter("all")}
          openId={queue.openId}
          isNew={queue.isNew}
          onToggle={queue.toggle}
          registerButton={queue.registerButton}
          actions={actions}
        />
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <RequestExtensionDialog
        open={requesting}
        onOpenChange={setRequesting}
        cycleNumber={requestCycle}
        cycleOptions={cycleOptions}
        onCycleChange={setCyclePick}
        days={requestedDays}
        onDaysChange={setRequestedDays}
        reason={reason}
        onReasonChange={setReason}
        submitting={submitting}
        pendingWarning={
          hasLiveRequestFor(views ?? [], requestCycle, ["PENDING"])
            ? `Your group already has a pending request for Cycle ${requestCycle}.`
            : null
        }
        onSubmit={() => void submitRequest()}
      />

      {granting ? (
        <GrantExtensionDialog
          initialCycleNumber={payload?.activeCycleNumber ?? 1}
          cycleNumbers={payload?.cycleNumbers ?? []}
          onOpenChange={(open) => {
            if (!open) setGranting(false);
          }}
          onGranted={async () => {
            setGranting(false);
            await data.afterGrant();
          }}
        />
      ) : null}

      {denying ? (
        <DenyExtensionDialog
          context={contextOf(denying)}
          onOpenChange={(open) => {
            if (!open) setDenying(null);
          }}
          onConfirm={async (denyReason) => {
            const result = await data.decideProducer(
              { requestId: denying.entry.id, approved: false, reason: denyReason },
              closeDecisionDialogs
            );
            if (result.ok) advance(denying.entry.id, "Denied", result.data);
          }}
        />
      ) : null}

      {approving ? (
        <ApproveExtensionDialog
          open
          onOpenChange={(open) => {
            if (!open) setApproving(null);
          }}
          context={contextOf(approving.view)}
          requestedDays={approving.view.entry.requestedDays}
          members={approving.view.members.map((member) => ({ userId: member.userId, label: member.label }))}
          lockedTerms={
            approving.view.entry.approvals.some((approval) => approval.approved && approval.userId !== me)
              ? grantedTerms(approving.view.entry)
              : null
          }
          initialTerms={
            approving.view.termsSet
              ? grantedTerms(approving.view.entry)
              : {
                  grantedDays: approving.view.entry.requestedDays,
                  grantedUserIds: approving.view.entry.groupMembers.map((member) => member.userId)
                }
          }
          grantWithoutAgreement={approving.grant}
          onConfirm={async (terms) => {
            const { view, grant } = approving;
            const result = await data.decideProducer(
              { requestId: view.entry.id, approved: true, terms, grantWithoutAgreement: grant || undefined },
              closeDecisionDialogs
            );
            if (result.ok) {
              advance(view.entry.id, grant ? "Granted" : "Approved", result.data);
            }
          }}
        />
      ) : null}
    </div>
  );
}
