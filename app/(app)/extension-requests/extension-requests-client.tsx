"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EXTENSION_REQUESTS_CHANGED_EVENT } from "@/src/lib/package-extensions";
import { ApproveExtensionDialog, type GrantTerms } from "./approve-extension-dialog";

type Approval = {
  userId: string;
  approved: boolean;
  name: string | null;
  createdAt: string;
};

type MemberConsent = {
  userId: string;
  agreed: boolean;
  name: string | null;
  createdAt: string;
};

type GroupMember = {
  userId: string;
  name: string | null;
  email: string | null;
};

type ExtensionRequest = {
  id: string;
  cycleNumber: number;
  requestedDays: number;
  grantedDays: number | null;
  /** Empty means the whole group. */
  grantedUserIds: string[];
  reason: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  createdAt: string;
  groupTopic: string;
  student: { id: string; name: string | null; email: string | null };
  groupMembers: GroupMember[];
  memberConsents: MemberConsent[];
  memberConsentComplete: boolean;
  canDecide?: boolean;
  approvalsRequired: number;
  approvals: Approval[];
};

type Payload = {
  canDecide: boolean;
  currentUserId: string;
  approvalsRequired: number;
  requests: ExtensionRequest[];
};

const STATUS_STYLES: Record<ExtensionRequest["status"], string> = {
  PENDING: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  APPROVED: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  DENIED: "bg-red-500/15 text-red-200 border-red-400/30"
};

function memberLabel(member: { name: string | null; email: string | null }) {
  return member.name ?? member.email ?? "Unknown";
}

/** Granted terms once a producer has approved, with "whole group" expanded to member ids. */
function grantedTerms(entry: ExtensionRequest): GrantTerms {
  return {
    grantedDays: entry.grantedDays ?? entry.requestedDays,
    grantedUserIds:
      entry.grantedUserIds.length > 0
        ? entry.grantedUserIds
        : entry.groupMembers.map((member) => member.userId)
  };
}

export default function ExtensionRequestsClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycleNumber, setCycleNumber] = useState(1);
  const [requestedDays, setRequestedDays] = useState(2);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState<ExtensionRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/extensions/requests", { cache: "no-store" });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Failed to load extension requests.");
      }

      setPayload(body.data as Payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load extension requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitRequest() {
    setSubmitting(true);

    try {
      const response = await fetch("/api/extensions/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleNumber, requestedDays, reason })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Failed to submit request.");
      }

      setReason("");
      toast.success("Extension request submitted for your group. Teammates must agree next.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function decideProducer(requestId: string, approved: boolean, terms?: GrantTerms | null) {
    try {
      const response = await fetch("/api/extensions/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "producer", requestId, approved, ...(terms ?? {}) })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Failed to record decision.");
      }

      setApproving(null);
      window.dispatchEvent(new Event(EXTENSION_REQUESTS_CHANGED_EVENT));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record decision.");
    }
  }

  async function decideMember(requestId: string, agreed: boolean) {
    try {
      const response = await fetch("/api/extensions/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "member", requestId, agreed })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Failed to record agreement.");
      }

      toast.success(agreed ? "You agreed to the extension request." : "You declined the extension request.");
      window.dispatchEvent(new Event(EXTENSION_REQUESTS_CHANGED_EVENT));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record agreement.");
    }
  }

  const requestCounts = useMemo(() => {
    const requests = payload?.requests ?? [];
    return {
      pending: requests.filter((request) => request.status === "PENDING").length,
      approved: requests.filter((request) => request.status === "APPROVED").length,
      denied: requests.filter((request) => request.status === "DENIED").length
    };
  }, [payload]);

  return (
    <div className="route-enter mx-auto w-full max-w-4xl space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow flex items-center gap-2">
              <CalendarClock className="h-3 w-3" />
              Deadlines · Group consent
            </div>
            <h1 className="display-md mt-2 text-foreground">Extension Requests</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              An extension request covers your entire package group. Every member must agree before
              producers can approve. Two producer approvals are required; the first approving producer
              sets how many days are granted and which members get them.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="meta-pill tabular-nums">{requestCounts.pending} pending</span>
            <span className="meta-pill tabular-nums">{requestCounts.approved} approved</span>
            <span className="meta-pill tabular-nums">{requestCounts.denied} denied</span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold text-foreground">Request an extension</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          You must be assigned to a package group for the selected cycle. Your teammates will be asked
          to agree before producers review it.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[110px_110px_1fr_auto]">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Cycle</span>
            <input
              type="number"
              min={1}
              value={cycleNumber}
              onChange={(event) => setCycleNumber(Math.max(1, Number(event.target.value) || 1))}
              className="h-10 w-full rounded-lg border border-border bg-muted px-3 text-foreground outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Days</span>
            <input
              type="number"
              min={1}
              max={30}
              value={requestedDays}
              onChange={(event) => setRequestedDays(Math.max(1, Number(event.target.value) || 1))}
              className="h-10 w-full rounded-lg border border-border bg-muted px-3 text-foreground outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Reason</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Family emergency, unresolvable technical issue, …"
              className="h-10 w-full rounded-lg border border-border bg-muted px-3 text-foreground outline-none"
            />
          </label>
          <Button className="self-end" onClick={() => void submitRequest()} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        {loading ? <p className="text-sm text-muted-foreground">Loading requests…</p> : null}

        {!loading && (payload?.requests.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No extension requests yet.
          </p>
        ) : null}

        {(payload?.requests ?? []).map((entry) => {
          const approvedCount = entry.approvals.filter((approval) => approval.approved).length;
          const consentByUser = new Map(entry.memberConsents.map((consent) => [consent.userId, consent]));
          const agreedCount = entry.groupMembers.filter(
            (member) => consentByUser.get(member.userId)?.agreed === true
          ).length;
          const myConsent = payload?.currentUserId
            ? consentByUser.get(payload.currentUserId)
            : undefined;
          const iAmMember = entry.groupMembers.some((member) => member.userId === payload?.currentUserId);
          const needsMyConsent =
            entry.status === "PENDING" && iAmMember && myConsent?.agreed !== true;
          const termsSet = entry.approvals.some((approval) => approval.approved);
          const terms = grantedTerms(entry);
          const labelById = new Map(entry.groupMembers.map((member) => [member.userId, memberLabel(member)]));
          const groupLabel =
            entry.groupMembers.map(memberLabel).join(", ") ||
            entry.student.name ||
            entry.student.email ||
            "Group";

          return (
            <article key={entry.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">
                    {groupLabel}
                    {entry.groupTopic ? ` · “${entry.groupTopic}”` : ""} · Cycle {entry.cycleNumber} · +
                    {entry.requestedDays} {entry.requestedDays === 1 ? "day" : "days"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Requested by {entry.student.name ?? entry.student.email}
                  </p>
                  {termsSet ? (
                    <p className="mt-0.5 text-xs text-foreground">
                      Granted +{terms.grantedDays} {terms.grantedDays === 1 ? "day" : "days"} to{" "}
                      {entry.grantedUserIds.length === 0
                        ? "the whole group"
                        : terms.grantedUserIds.map((userId) => labelById.get(userId) ?? "Unknown").join(", ")}
                    </p>
                  ) : null}
                  {entry.reason ? (
                    <p className="mt-1 text-sm text-muted-foreground">&ldquo;{entry.reason}&rdquo;</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Group agreement: {agreedCount}/{Math.max(entry.groupMembers.length, 1)}
                    {entry.groupMembers.length > 0
                      ? ` — ${entry.groupMembers
                          .map((member) => {
                            const consent = consentByUser.get(member.userId);
                            const mark =
                              consent == null ? "…" : consent.agreed ? " ✓" : " ✗";
                            return `${memberLabel(member)}${mark}`;
                          })
                          .join(", ")}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Producer approvals: {approvedCount}/{entry.approvalsRequired}
                    {entry.approvals.length > 0
                      ? ` — ${entry.approvals
                          .map((approval) => `${approval.name}${approval.approved ? " ✓" : " ✗"}`)
                          .join(", ")}`
                      : entry.memberConsentComplete
                        ? " — waiting for producers"
                        : " — waiting for full group agreement first"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-1 text-xs font-medium ${STATUS_STYLES[entry.status]}`}
                  >
                    {entry.status}
                  </span>

                  {needsMyConsent ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => void decideMember(entry.id, true)}>
                        <Check className="mr-1 h-3.5 w-3.5" />
                        I agree
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void decideMember(entry.id, false)}>
                        <X className="mr-1 h-3.5 w-3.5" />
                        Decline
                      </Button>
                    </>
                  ) : null}

                  {(entry.canDecide ?? payload?.canDecide) && entry.status === "PENDING" ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!entry.memberConsentComplete}
                        title={
                          entry.memberConsentComplete
                            ? undefined
                            : "All group members must agree first"
                        }
                        onClick={() => setApproving(entry)}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void decideProducer(entry.id, false)}>
                        <X className="mr-1 h-3.5 w-3.5" />
                        Deny
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {approving ? (
        <ApproveExtensionDialog
          open
          onOpenChange={(open) => {
            if (!open) setApproving(null);
          }}
          requestedDays={approving.requestedDays}
          members={approving.groupMembers.map((member) => ({
            userId: member.userId,
            label: memberLabel(member)
          }))}
          lockedTerms={
            approving.approvals.some(
              (approval) => approval.approved && approval.userId !== payload?.currentUserId
            )
              ? grantedTerms(approving)
              : null
          }
          initialTerms={
            approving.approvals.some((approval) => approval.approved)
              ? grantedTerms(approving)
              : {
                  grantedDays: approving.requestedDays,
                  grantedUserIds: approving.groupMembers.map((member) => member.userId)
                }
          }
          onConfirm={(terms) => decideProducer(approving.id, true, terms)}
        />
      ) : null}
    </div>
  );
}
