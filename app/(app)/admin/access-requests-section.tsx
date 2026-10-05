"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Clock3, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingsPanel, SettingsPanelBody, SettingsRow, SettingsSection } from "@/components/settings-layout";
import { cn } from "@/src/lib/utils";
import type { PlatformAccessRequest, PlatformAccessRequestStatus, ReportMessage } from "./admin-types";

const STATUS_STYLE: Record<PlatformAccessRequestStatus, { label: string; className: string; Icon: typeof Clock3 }> = {
  PENDING: { label: "Pending", className: "border-amber-300/35 bg-amber-400/10 text-amber-200 light:text-amber-700", Icon: Clock3 },
  APPROVED: { label: "Approved", className: "border-[var(--brand-green)]/30 bg-[var(--brand-green)]/10 text-brand-green", Icon: CheckCircle2 },
  DENIED: { label: "Denied", className: "border-danger/35 bg-danger-tint text-danger", Icon: XCircle }
};

function StatusBadge({ status }: { status: PlatformAccessRequestStatus }) {
  const { label, className, Icon } = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.11em]", className)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function when(iso: string) {
  return new Date(iso).toLocaleString();
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
  const [showReviewed, setShowReviewed] = useState(false);

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

    const response = await fetch("/api/platform/access-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: requestId, status })
    });
    const payload = await response.json();

    if (!response.ok) {
      onMessage(payload?.error?.message ?? "Failed to update access request.");
      setDecidingId(null);
      return;
    }

    await onChanged();
    setDecidingId(null);
    toast.success(status === "APPROVED" ? "Access request approved and user notified by email." : "Access request denied and user notified by email.");
  }

  async function approveAll() {
    if (pending.length === 0) {
      return;
    }

    if (!window.confirm(`Approve all ${pending.length} pending access requests?`)) {
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
        onMessage(payload?.error?.message ?? "Failed to approve all pending access requests.");
        return;
      }

      const approvedCount = Number(payload?.data?.approvedCount ?? 0);
      await onChanged();
      toast.success(approvedCount > 0 ? `Approved ${approvedCount} pending access requests and sent email notifications.` : "No pending access requests to approve.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Failed to approve all pending access requests.");
    } finally {
      setApprovingAll(false);
    }
  }

  return (
    <SettingsSection
      id="access-requests"
      title="Access requests"
      description="People who tried to sign in before they were added. Approve to let them in and email them a sign-in link."
      actions={
        pending.length > 1 ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void approveAll()} disabled={approvingAll || decidingId !== null}>
            {approvingAll ? "Approving…" : `Approve all ${pending.length}`}
          </Button>
        ) : null
      }
    >
      <SettingsPanel>
        {pending.length === 0 ? (
          <SettingsPanelBody className="text-sm text-muted-foreground">No one is waiting for access.</SettingsPanelBody>
        ) : (
          pending.map((entry) => (
            <SettingsRow
              key={entry.id}
              title={entry.name ?? entry.email}
              description={entry.name ? `${entry.email} · requested ${when(entry.requestedAt)}` : `Requested ${when(entry.requestedAt)}`}
            >
              <Button
                type="button"
                size="sm"
                onClick={() => void decide(entry.id, "APPROVED")}
                disabled={decidingId === entry.id || approvingAll}
              >
                {decidingId === entry.id ? "Saving…" : "Approve"}
              </Button>
              <Button
                type="button"
                variant="destructive-quiet"
                size="sm"
                onClick={() => void decide(entry.id, "DENIED")}
                disabled={decidingId === entry.id || approvingAll}
              >
                Deny
              </Button>
            </SettingsRow>
          ))
        )}

        {reviewed.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowReviewed((open) => !open)}
            aria-expanded={showReviewed}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground md:px-5"
          >
            {showReviewed ? "Hide reviewed requests" : `Show ${reviewed.length} reviewed`}
            <ChevronDown className={cn("h-4 w-4 transition-transform", showReviewed && "rotate-180")} aria-hidden="true" />
          </button>
        ) : null}

        {showReviewed ? (
          <div className="max-h-[360px] divide-y divide-border overflow-auto">
            {reviewed.map((entry) => (
              <SettingsRow
                key={entry.id}
                title={entry.name ?? entry.email}
                description={
                  <>
                    {entry.name ? `${entry.email} · ` : ""}requested {when(entry.requestedAt)}
                    {entry.decidedAt
                      ? ` · reviewed ${when(entry.decidedAt)}${entry.decidedByEmail ? ` by ${entry.decidedByEmail}` : ""}`
                      : ""}
                  </>
                }
              >
                <StatusBadge status={entry.status} />
              </SettingsRow>
            ))}
          </div>
        ) : null}
      </SettingsPanel>
    </SettingsSection>
  );
}
