import type { StatusToneInput } from "@/components/kit/tone";
import { extensionRequestAwaitsUser } from "@/src/lib/package-extensions";

/**
 * Pure view-model for /extension-requests: everything the page shows about a request, derived
 * from GET /api/extensions/requests. No React here, so the rules stay in one testable place.
 */

export type Approval = {
  userId: string;
  approved: boolean;
  /** Why this producer denied; empty on approvals. */
  reason: string;
  name: string | null;
  createdAt: string;
};

export type MemberConsent = {
  userId: string;
  agreed: boolean;
  name: string | null;
  createdAt: string;
};

export type GroupMember = {
  userId: string;
  name: string | null;
  email: string | null;
};

export type RequestStatus = "PENDING" | "APPROVED" | "DENIED";

export type ExtensionRequest = {
  id: string;
  cycleNumber: number;
  requestedDays: number;
  grantedDays: number | null;
  /** Empty means the whole group. */
  grantedUserIds: string[];
  /** An exec granted it: no member agreement, one more exec approves. */
  producerGranted: boolean;
  reason: string;
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  groupTopic: string;
  student: { id: string; name: string | null; email: string | null };
  groupMembers: GroupMember[];
  memberConsents: MemberConsent[];
  memberConsentComplete: boolean;
  canDecide?: boolean;
  /** Exec outside the group may grant it before every member agrees. */
  canGrantPending?: boolean;
  approvalsRequired: number;
  approvals: Approval[];
};

export type Payload = {
  canDecide: boolean;
  canGrant: boolean;
  currentUserId: string;
  approvalsRequired: number;
  /** The cycle the viewer is working on; seeds the Cycle pickers. */
  activeCycleNumber: number;
  /** Real cycle numbers this semester. */
  cycleNumbers: number[];
  requests: ExtensionRequest[];
};

/** Who is looking, from the access the page already loads (before the fetch lands). */
export type Viewer = { isProducer: boolean; canGrant: boolean };

export type GrantTerms = { grantedDays: number; grantedUserIds: string[] };

export type MemberMark = "agreed" | "declined" | "waiting";

export type MemberLine = { userId: string; label: string; you: boolean; mark: MemberMark };
export type VoteLine = { userId: string; label: string; you: boolean; approved: boolean; reason: string };

export type RequestView = {
  entry: ExtensionRequest;
  /** The topic, or the member names when there is none. */
  title: string;
  hasTopic: boolean;
  memberNames: string;
  requesterLabel: string;
  /** A student filed it (a direct exec grant was filed by the exec). */
  filedByMember: boolean;
  /** Days on the row: what the group asked for, or the granted days on an exec grant. */
  shownDays: number;
  agreedCount: number;
  memberTotal: number;
  approvedCount: number;
  members: MemberLine[];
  votes: VoteLine[];
  termsSet: boolean;
  terms: GrantTerms;
  /** "whole group" or the covered names. */
  grantedTo: string;
  needsMyConsent: boolean;
  /** Same rule as the sidebar badge (extensionRequestAwaitsUser). */
  awaitsMe: boolean;
  /** My approval is on this still-pending request (I can edit terms or flip to Deny). */
  iApproved: boolean;
  showVote: boolean;
  approveEnabled: boolean;
  showGrant: boolean;
  nextStep: string;
  status: { label: string; tone: StatusToneInput };
  /** Latest thing someone else did (ms), for the "updated since your last visit" dot. */
  lastActivityAt: number;
};

export function memberLabel(member: { name: string | null; email: string | null }) {
  return member.name ?? member.email ?? "Unknown";
}

export function daysLabel(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** "Abby, Otto +2": the first `max` names, then how many more. */
export function listNames(names: string[], max = 2) {
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown} +${names.length - max}` : shown;
}

/** Granted terms once a producer has approved, with "whole group" expanded to member ids. */
export function grantedTerms(entry: ExtensionRequest): GrantTerms {
  return {
    grantedDays: entry.grantedDays ?? entry.requestedDays,
    grantedUserIds:
      entry.grantedUserIds.length > 0
        ? entry.grantedUserIds
        : entry.groupMembers.map((member) => member.userId)
  };
}

function timeOf(iso: string | null | undefined) {
  const value = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(value) ? value : 0;
}

/**
 * The viewer cast the deciding action. A denial is terminal, so the one negative consent or vote
 * decided it; an approval was decided by the newest vote (votes on a pending request are only
 * approvals, and re-approving keeps a vote's createdAt).
 */
function decidedByMe(entry: ExtensionRequest, me: string) {
  if (entry.status === "DENIED") {
    return (
      entry.memberConsents.some((consent) => consent.userId === me && !consent.agreed) ||
      entry.approvals.some((approval) => approval.userId === me && !approval.approved)
    );
  }
  if (entry.status === "APPROVED") {
    const newest = entry.approvals.reduce<Approval | null>(
      (latest, approval) => (latest === null || timeOf(approval.createdAt) > timeOf(latest.createdAt) ? approval : latest),
      null
    );
    return newest?.userId === me;
  }
  return false;
}

/** The latest thing someone else did; the viewer's own filing, agreement, votes and decision don't count. */
function lastActivity(entry: ExtensionRequest, me: string) {
  const times = [
    entry.student.id === me ? 0 : timeOf(entry.createdAt),
    decidedByMe(entry, me) ? 0 : timeOf(entry.decidedAt),
    ...entry.memberConsents.filter((consent) => consent.userId !== me).map((consent) => timeOf(consent.createdAt)),
    ...entry.approvals.filter((approval) => approval.userId !== me).map((approval) => timeOf(approval.createdAt))
  ];
  return Math.max(0, ...times);
}

type Facts = Omit<RequestView, "nextStep" | "status">;

function nextStepFor(view: Facts): string {
  const { entry, approvedCount } = view;
  const tally = `${approvedCount}/${entry.approvalsRequired}`;
  if (entry.status === "APPROVED") return `Granted +${daysLabel(view.terms.grantedDays)} → ${view.grantedTo}`;
  if (entry.status === "DENIED") {
    const deniers = view.votes.filter((vote) => !vote.approved).map((vote) => vote.label);
    if (deniers.length > 0) return `Denied by ${listNames(deniers)}`;
    const decliners = view.members.filter((member) => member.mark === "declined").map((member) => member.label);
    return decliners.length > 0 ? `${listNames(decliners)} declined` : "Denied";
  }
  if (view.needsMyConsent) return "Needs your agreement";
  if (view.awaitsMe) return `Needs your vote · ${tally}`;
  if (entry.producerGranted) return `Waiting on a second exec · ${tally}`;
  if (!entry.memberConsentComplete) {
    const waiting = view.members.filter((member) => member.mark !== "agreed").map((member) => member.label);
    const on = waiting.length > 0 ? listNames(waiting) : "group agreement";
    // An exec outside the group can grant it now: say so on the closed row, not only in its detail.
    return view.showGrant ? `You can grant · waiting on ${on}` : `Waiting on ${on}`;
  }
  return approvedCount > 0 ? `Waiting on a second producer · ${tally}` : `Waiting on producers · ${tally}`;
}

function statusFor(view: Facts): RequestView["status"] {
  if (view.awaitsMe) return { label: "Needs you", tone: "warning" };
  if (view.entry.status === "APPROVED") return { label: "Approved", tone: "success" };
  if (view.entry.status === "DENIED") return { label: "Denied", tone: "danger" };
  return { label: "Pending", tone: "neutral" };
}

export function buildRequestView(entry: ExtensionRequest, me: string): RequestView {
  const consentByUser = new Map(entry.memberConsents.map((consent) => [consent.userId, consent]));
  const members: MemberLine[] = entry.groupMembers.map((member) => {
    const consent = consentByUser.get(member.userId);
    return {
      userId: member.userId,
      label: memberLabel(member),
      you: member.userId === me,
      mark: consent == null ? "waiting" : consent.agreed ? "agreed" : "declined"
    };
  });
  const labelById = new Map(members.map((member) => [member.userId, member.label]));
  const votes: VoteLine[] = entry.approvals.map((approval) => ({
    userId: approval.userId,
    label: approval.name ?? "Producer",
    you: approval.userId === me,
    approved: approval.approved,
    reason: approval.reason
  }));
  const terms = grantedTerms(entry);
  const termsSet = entry.approvals.some((approval) => approval.approved);
  const filedByMember = entry.groupMembers.some((member) => member.userId === entry.student.id);
  const shownDays = entry.producerGranted ? terms.grantedDays : entry.requestedDays;
  const memberNames = members.map((member) => member.label).join(", ");
  const pending = entry.status === "PENDING";
  const iAmMember = members.some((member) => member.you);
  const showVote = Boolean(entry.canDecide) && pending;

  const facts: Facts = {
    entry,
    title: entry.groupTopic.trim() || memberNames || entry.student.name || entry.student.email || "Group",
    hasTopic: entry.groupTopic.trim().length > 0,
    memberNames,
    requesterLabel: memberLabel(entry.student),
    filedByMember,
    shownDays,
    agreedCount: members.filter((member) => member.mark === "agreed").length,
    memberTotal: Math.max(members.length, 1),
    approvedCount: entry.approvals.filter((approval) => approval.approved).length,
    members,
    votes,
    termsSet,
    terms,
    grantedTo:
      entry.grantedUserIds.length === 0
        ? "whole group"
        : listNames(terms.grantedUserIds.map((userId) => labelById.get(userId) ?? "Unknown")),
    needsMyConsent: !entry.producerGranted && pending && iAmMember && consentByUser.get(me)?.agreed !== true,
    awaitsMe: extensionRequestAwaitsUser(
      {
        status: entry.status,
        producerGranted: entry.producerGranted,
        memberUserIds: entry.groupMembers.map((member) => member.userId),
        consents: entry.memberConsents,
        approvals: entry.approvals,
        viewerMayDecide: Boolean(entry.canDecide)
      },
      me
    ),
    iApproved: pending && entry.approvals.some((approval) => approval.userId === me && approval.approved),
    showVote,
    approveEnabled: entry.producerGranted || entry.memberConsentComplete,
    showGrant: Boolean(entry.canGrantPending) && !entry.memberConsentComplete,
    lastActivityAt: lastActivity(entry, me)
  };
  return { ...facts, nextStep: nextStepFor(facts), status: statusFor(facts) };
}

/** Covered names for the Granted line: every covered member, not truncated. */
export function grantedNames(view: RequestView) {
  if (view.entry.grantedUserIds.length === 0) return "whole group";
  const labelById = new Map(view.members.map((member) => [member.userId, member.label]));
  return view.terms.grantedUserIds.map((userId) => labelById.get(userId) ?? "Unknown").join(", ");
}

/** The one filled button an open row may carry: I agree first, then an enabled first-time Approve. */
export function rowPrimary(view: RequestView): "agree" | "approve" | null {
  if (view.needsMyConsent) return "agree";
  if (view.showVote && view.approveEnabled && !view.iApproved) return "approve";
  return null;
}

/** Visible reason next to the buttons (the old title-only tooltips, readable on touch). */
export function voteHelper(view: RequestView): string | null {
  if (!view.showVote && !view.showGrant) return null;
  const parts: string[] = [];
  if (view.showVote && view.iApproved) {
    parts.push(
      view.entry.producerGranted
        ? "You approved this grant. Waiting on a second exec."
        : "You approved these terms. Waiting on a second producer."
    );
  } else if (view.showVote && !view.approveEnabled) {
    parts.push(`Approve unlocks when every member agrees (${view.agreedCount}/${view.memberTotal}).`);
  }
  if (view.showGrant) parts.push("Grant skips the remaining agreements; one more exec approves.");
  return parts.length > 0 ? parts.join(" ") : null;
}

export const FILTER_VALUES = ["needs-you", "pending", "approved", "denied", "all"] as const;
export type FilterValue = (typeof FILTER_VALUES)[number];

export function isFilterValue(value: unknown): value is FilterValue {
  return typeof value === "string" && (FILTER_VALUES as readonly string[]).includes(value);
}

export function matchesFilter(view: RequestView, filter: FilterValue) {
  switch (filter) {
    case "needs-you":
      return view.awaitsMe;
    case "pending":
      return view.entry.status === "PENDING";
    case "approved":
      return view.entry.status === "APPROVED";
    case "denied":
      return view.entry.status === "DENIED";
    default:
      return true;
  }
}

export function filterCounts(views: RequestView[]): Record<FilterValue, number> {
  return {
    "needs-you": views.filter((view) => view.awaitsMe).length,
    pending: views.filter((view) => view.entry.status === "PENDING").length,
    approved: views.filter((view) => view.entry.status === "APPROVED").length,
    denied: views.filter((view) => view.entry.status === "DENIED").length,
    all: views.length
  };
}

/** Needs you when anything waits on you, else the remembered chip if it has rows, else All. */
export function defaultFilter(counts: Record<FilterValue, number>, remembered: FilterValue | null): FilterValue {
  if (counts["needs-you"] > 0) return "needs-you";
  if (remembered && counts[remembered] > 0) return remembered;
  return "all";
}

function rank(view: RequestView) {
  if (view.awaitsMe) return 0;
  if (view.entry.status === "PENDING") return 1;
  return view.entry.status === "APPROVED" ? 2 : 3;
}

/** Waiting on me, then pending, approved, denied; newest first within each. */
export function sortViews(views: RequestView[]) {
  return [...views].sort(
    (a, b) => rank(a) - rank(b) || timeOf(b.entry.createdAt) - timeOf(a.entry.createdAt)
  );
}

/**
 * In All, denied requests fold away under a "Denied" row at the bottom of the list (the Denied
 * chip shows them open). Returns the rows shown above the fold and the folded ones.
 */
export function splitDenied(views: RequestView[], filter: FilterValue) {
  if (filter !== "all") return { shown: views, denied: [] as RequestView[] };
  return {
    shown: views.filter((view) => view.entry.status !== "DENIED"),
    denied: views.filter((view) => view.entry.status === "DENIED")
  };
}

/** One filled button per view: the header's button is filled only when no request carries one. */
export function anyRowPrimary(views: RequestView[]) {
  return views.some((view) => rowPrimary(view) !== null);
}

/** Opens the first row by itself when it waits on the viewer, or when it is the only row. */
export function autoOpenId(visible: RequestView[]) {
  const first = visible[0];
  if (!first) return null;
  return first.awaitsMe || visible.length === 1 ? first.entry.id : null;
}

/** The viewer is on a group with a live (pending or approved) request for this cycle. */
export function hasLiveRequestFor(views: RequestView[], cycleNumber: number | null, statuses: RequestStatus[]) {
  if (cycleNumber === null) return false;
  return views.some(
    (view) =>
      view.entry.cycleNumber === cycleNumber &&
      statuses.includes(view.entry.status) &&
      view.members.some((member) => member.you)
  );
}

export function shortDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}
