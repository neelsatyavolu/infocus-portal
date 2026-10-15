"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { Check, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DisclosureToggle } from "@/components/kit/disclosure";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingsPanel, SettingsSection } from "@/components/settings-layout";
import { cn } from "@/src/lib/utils";
import { COLUMN_LABEL_CLASS, ROW_ACTION_CLASS, When } from "./admin-ui";
import { errorText, type PlatformAccessRequest, type PlatformAccessRequestStatus, type ReportMessage } from "./admin-types";

const STATUS_TAG: Record<PlatformAccessRequestStatus, { label: string; tone: "warning" | "success" | "danger"; icon: typeof Clock3 }> = {
  PENDING: { label: "Pending", tone: "warning", icon: Clock3 },
  APPROVED: { label: "Approved", tone: "success", icon: CheckCircle2 },
  DENIED: { label: "Denied", tone: "danger", icon: XCircle }
};

/** Name | time | actions (or status). Pending and reviewed rows share it, so times line up. */
const ROW_GRID = "grid gap-x-4 gap-y-2 px-4 py-3 md:px-5 @3xl:grid-cols-[minmax(0,1fr)_minmax(9rem,15rem)_10.5rem] @3xl:items-center";

function Who({ entry, extra }: { entry: PlatformAccessRequest; extra?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground">{entry.name ?? entry.email}</p>
      {entry.name || extra ? (
        <p className="truncate text-[13px] text-muted-foreground">
          {entry.name ? entry.email : null}
          {entry.name && extra ? " · " : null}
          {extra}
        </p>
      ) : null}
    </div>
  );
}

/** Admin → Access requests: people who tried to sign in before they were added. */
export function AccessRequestsSection({
  requests,
  onChanged,
  onMessage
}: {
  requests: PlatformAccessRequest[];
  onChanged: () => Promise<void>;
  onMessage: ReportMessage;
}) {
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [confirmApproveAll, setConfirmApproveAll] = useState(false);
  const [showReviewed, setShowReviewed] = useState(false);
  const reviewedId = useId();

  const pending = useMemo(
    () =>
      requests
        .filter((entry) => entry.status === "PENDING")
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()),
    [requests]
  );
  const reviewed = useMemo(
    () =>
      requests
        .filter((entry) => entry.status !== "PENDING")
        .sort((a, b) => {
          const byStatus = (a.status === "APPROVED" ? 0 : 1) - (b.status === "APPROVED" ? 0 : 1);
          return byStatus !== 0 ? byStatus : new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
        }),
    [requests]
  );

  async function decide(requestId: string, status: Exclude<PlatformAccessRequestStatus, "PENDING">) {
    setDecidingId(requestId);
    onMessage(null);

    try {
      const response = await fetch("/api/platform/access-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId, status })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to update access request.");
      }

      await onChanged();
      toast.success(
        status === "APPROVED"
          ? "Access request approved and user notified by email."
          : "Access request denied and user notified by email."
      );
    } catch (error) {
      const errorMessage = errorText(error, "Failed to update access request.");
      onMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setDecidingId(null);
    }
  }

  // Throws on failure so the confirm dialog stays open for a retry.
  async function approveAll() {
    if (pending.length === 0) {
      return;
    }

    setApprovingAll(true);
    onMessage(null);

    try {
      const response = await fetch("/api/platform/access-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE_ALL_PENDING" })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to approve all pending access requests.");
      }

      const approvedCount = Number(payload?.data?.approvedCount ?? 0);
      await onChanged();
      toast.success(
        approvedCount > 0
          ? `Approved ${approvedCount} pending access requests and sent email notifications.`
          : "No pending access requests to approve."
      );
    } catch (error) {
      const errorMessage = errorText(error, "Failed to approve all pending access requests.");
      onMessage(errorMessage);
      toast.error(errorMessage);
      throw error;
    } finally {
      setApprovingAll(false);
    }
  }

  return (
    <SettingsSection
      id="access-requests"
      title="Access requests"
      status={
        pending.length > 0 ? (
          <StatusTag tone="warning" srLabel="Access requests: ">
            {`${pending.length} waiting`}
          </StatusTag>
        ) : null
      }
      description="People who tried to sign in before they were added. Approving lets them in and emails them a sign-in link."
      actions={
        pending.length > 1 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ROW_ACTION_CLASS}
            onClick={() => setConfirmApproveAll(true)}
            disabled={approvingAll || decidingId !== null}
          >
            {approvingAll ? "Approving…" : `Approve all ${pending.length}`}
          </Button>
        ) : null
      }
    >
      <SettingsPanel>
        {pending.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground md:px-5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--brand-green)]" aria-hidden="true" />
            No one is waiting for access.
          </p>
        ) : (
          <>
            {/* Column names from @3xl (phones stack each row). The panel's hairlines separate it from the rows. */}
            <div aria-hidden="true" className={cn(ROW_GRID, "hidden py-2 @3xl:grid")}>
              <span className={COLUMN_LABEL_CLASS}>Person</span>
              <span className={cn(COLUMN_LABEL_CLASS, "text-right")}>Requested</span>
              <span />
            </div>
            <ul aria-label="Waiting for access" className="divide-y divide-border">
              {pending.map((entry) => {
                const deciding = decidingId === entry.id;
                const who = entry.name ?? entry.email;
                return (
                  <li key={entry.id} className={ROW_GRID}>
                    <Who entry={entry} />
                    <p className="text-[13px] text-muted-foreground @3xl:text-right">
                      <span className="@3xl:sr-only">Requested </span>
                      <When iso={entry.requestedAt} />
                    </p>
                    {/* Two full-width buttons only on phones; from sm they keep their own width. */}
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-start @3xl:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={ROW_ACTION_CLASS}
                        onClick={() => void decide(entry.id, "APPROVED")}
                        disabled={deciding || approvingAll}
                      >
                        <Check aria-hidden="true" />
                        {deciding ? "Saving…" : "Approve"}
                        {/* Screen readers hear "Approve Abby", so each row's buttons can be told apart. */}
                        <span className="sr-only"> {who}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive-quiet"
                        size="sm"
                        className={ROW_ACTION_CLASS}
                        onClick={() => void decide(entry.id, "DENIED")}
                        disabled={deciding || approvingAll}
                      >
                        Deny
                        <span className="sr-only"> {who}</span>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {reviewed.length > 0 ? (
          <DisclosureToggle
            open={showReviewed}
            onToggle={() => setShowReviewed((open) => !open)}
            controls={reviewedId}
            closedLabel={`Show ${reviewed.length} reviewed`}
            openLabel="Hide reviewed"
          />
        ) : null}

        {/* Rendered only while open: divide-y lines every child but the last, and a hidden last child would leave a double edge. */}
        {reviewed.length > 0 && showReviewed ? (
          <div id={reviewedId} className="max-h-[360px] overflow-auto">
            {/* Sticky inside the scroll box, so the columns stay named while the list scrolls. */}
            <div
              aria-hidden="true"
              className={cn(ROW_GRID, "sticky top-0 z-[1] hidden border-b border-border bg-card py-2 @3xl:grid")}
            >
              <span className={COLUMN_LABEL_CLASS}>Person</span>
              <span className={cn(COLUMN_LABEL_CLASS, "text-right")}>Reviewed</span>
              <span className={cn(COLUMN_LABEL_CLASS, "text-right")}>Decision</span>
            </div>
            <ul aria-label="Reviewed access requests" className="divide-y divide-border">
              {reviewed.map((entry) => {
                const tag = STATUS_TAG[entry.status];
                return (
                  <li key={entry.id} className={ROW_GRID}>
                    <Who
                      entry={entry}
                      extra={
                        <>
                          requested <When iso={entry.requestedAt} />
                        </>
                      }
                    />
                    <div className="min-w-0 text-[13px] text-muted-foreground @3xl:text-right">
                      {entry.decidedAt ? (
                        <>
                          <p>
                            <span className="@3xl:sr-only">Reviewed </span>
                            <When iso={entry.decidedAt} />
                          </p>
                          {entry.decidedByEmail ? <p className="truncate">by {entry.decidedByEmail}</p> : null}
                        </>
                      ) : null}
                    </div>
                    <div className="flex @3xl:justify-end">
                      <StatusTag tone={tag.tone} icon={tag.icon}>
                        {tag.label}
                      </StatusTag>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </SettingsPanel>
      <ConfirmDialog
        open={confirmApproveAll}
        onOpenChange={setConfirmApproveAll}
        title={`Approve all ${pending.length} pending access requests?`}
        description="Each person is let in and emailed a sign-in link."
        confirmLabel="Approve all"
        cancelLabel="Cancel"
        tone="default"
        onConfirm={approveAll}
      />
    </SettingsSection>
  );
}
