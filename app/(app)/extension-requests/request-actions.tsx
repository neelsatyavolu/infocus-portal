"use client";

import { Check, Mail, Plus, X, type LucideIcon } from "lucide-react";
import { CONTROL_HEIGHT } from "@/components/kit/action-bar";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { rowPrimary, voteHelper, type RequestView } from "./request-view";

/** What the open row can do; the page owns the calls and dialogs. */
export type RequestActions = {
  onMemberDecision: (view: RequestView, agreed: boolean) => void;
  onApprove: (view: RequestView, grant: boolean) => void;
  onDeny: (view: RequestView) => void;
  onEmail: (view: RequestView) => void;
  /** Execs may resend a decided request's email (payload.canGrant). */
  canEmail: boolean;
  memberBusy: { id: string; agreed: boolean } | null;
  emailingId: string | null;
};

type ButtonSpec = {
  key: string;
  label: string;
  icon: LucideIcon;
  variant: "default" | "outline" | "destructive-quiet";
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  title?: string;
};

type Cluster = { key: string; label: string; helper: string | null; buttons: ButtonSpec[] };

/**
 * Matched buttons, 40px on phones and h-9 from md. Phones: two per row, the primary full width and last, and an odd last
 * secondary also full width (no ragged rows). From sm: one right-aligned row.
 */
function ButtonRow({ buttons }: { buttons: ButtonSpec[] }) {
  const secondaries = buttons.filter((button) => button.variant !== "default");
  const lastOdd = secondaries.length % 2 === 1 ? secondaries[secondaries.length - 1]?.key : null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:shrink-0 sm:flex-wrap sm:items-center sm:justify-end">
      {buttons.map(({ key, label, icon: Icon, variant, onClick, disabled, busy, title }) => (
        <Button
          key={key}
          type="button"
          variant={variant}
          title={title}
          disabled={disabled || busy}
          onClick={onClick}
          className={cn(CONTROL_HEIGHT.touch, "w-full sm:w-auto", (variant === "default" || key === lastOdd) && "col-span-2")}
        >
          {busy ? <Spinner /> : <Icon aria-hidden />}
          {label}
        </Button>
      ))}
    </div>
  );
}

function clustersFor(view: RequestView, actions: RequestActions): Cluster[] {
  const { entry } = view;
  const primary = rowPrimary(view);
  const memberBusy = actions.memberBusy?.id === entry.id ? actions.memberBusy : null;
  const clusters: Cluster[] = [];

  if (view.needsMyConsent) {
    clusters.push({
      key: "agreement",
      label: "Your agreement",
      helper: "Declining denies the request for the whole group.",
      buttons: [
        {
          key: "decline",
          label: "Decline",
          icon: X,
          variant: "outline",
          busy: memberBusy?.agreed === false,
          disabled: Boolean(memberBusy),
          onClick: () => actions.onMemberDecision(view, false)
        },
        {
          key: "agree",
          label: "I agree",
          icon: Check,
          variant: primary === "agree" ? "default" : "outline",
          busy: memberBusy?.agreed === true,
          disabled: Boolean(memberBusy),
          onClick: () => actions.onMemberDecision(view, true)
        }
      ]
    });
  }

  const vote: ButtonSpec[] = [];
  if (view.showVote) {
    vote.push({ key: "deny", label: "Deny", icon: X, variant: "destructive-quiet", onClick: () => actions.onDeny(view) });
  }
  if (view.showGrant) {
    vote.push({
      key: "grant",
      label: "Grant",
      icon: Plus,
      variant: "outline",
      title: "Grant it now without waiting for every member to agree",
      onClick: () => actions.onApprove(view, true)
    });
  }
  if (view.showVote) {
    // After my approval it stays as Approve (outline): re-approving can still change the terms.
    vote.push({
      key: "approve",
      label: "Approve",
      icon: Check,
      variant: primary === "approve" ? "default" : "outline",
      disabled: !view.approveEnabled,
      title: view.approveEnabled ? undefined : "All group members must agree first",
      onClick: () => actions.onApprove(view, false)
    });
  }
  if (vote.length > 0) {
    clusters.push({ key: "vote", label: "Your vote", helper: voteHelper(view), buttons: vote });
  }

  if (actions.canEmail && entry.status !== "PENDING") {
    clusters.push({
      key: "email",
      label: "Decision email",
      helper: null,
      buttons: [
        {
          key: "email",
          label: "Email group",
          icon: Mail,
          variant: "outline",
          busy: actions.emailingId === entry.id,
          title:
            entry.status === "APPROVED"
              ? "Email the decision to the students this extension covers"
              : "Email the decision to the group",
          onClick: () => actions.onEmail(view)
        }
      ]
    });
  }
  return clusters;
}

/**
 * The open row's actions, under a hairline. One cluster shows just its helper; a viewer who is
 * both a member and a voter gets two labelled clusters (agreement, then vote) split by a line.
 */
export function RequestActionArea({ view, actions }: { view: RequestView; actions: RequestActions }) {
  const clusters = clustersFor(view, actions);
  if (clusters.length === 0) return null;
  const labelled = clusters.length > 1;
  return (
    <div className="mt-5 border-t border-border">
      {clusters.map((cluster) => (
        <div
          key={cluster.key}
          role="group"
          aria-label={cluster.label}
          className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:gap-4 [&+&]:mt-4 [&+&]:border-t [&+&]:border-border"
        >
          {labelled || cluster.helper ? (
            <div className="min-w-0 text-[13px] leading-snug text-muted-foreground">
              {labelled ? (
                <p className="text-[11px] font-medium uppercase tracking-[0.11em] text-foreground">{cluster.label}</p>
              ) : null}
              {cluster.helper ? <p className={cn(labelled && "mt-0.5")}>{cluster.helper}</p> : null}
            </div>
          ) : null}
          <ButtonRow buttons={cluster.buttons} />
        </div>
      ))}
    </div>
  );
}
