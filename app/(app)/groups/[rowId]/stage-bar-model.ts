import {
  cycleStageStatus,
  emptyCycleStageStatusInput,
  type CycleStageStatus,
  type CycleStageStatusInput
} from "@/src/lib/package-stage-status";
import {
  groupNavTabDone,
  pendingGroupNavSlug,
  type GroupNavSlug,
  type GroupNavState
} from "@/src/lib/package-stages";

/**
 * Everything the group stage bar and approval path show, built on the server from the row the
 * stage page already loads (no extra queries). Plain values only, so it crosses to the client.
 */
export type GroupStageFacts = {
  pitching: boolean;
  proofOfContact: boolean;
  aRollBRoll: boolean;
  finalCut: boolean;
  /** Effective approval stage (revisions stay at the stage that asked). Drives navigation. */
  approvalStage: string;
  /** Raw approval stage. The hosted stage header builds its status tag from this one. */
  rawApprovalStage: string;
  proofCount: number;
  brainstormDocUrl: string;
  brainstormNeedsChanges: boolean;
  initialCut: boolean;
  initialCutHasMedia: boolean;
  awaitingRevisedInitialCut: boolean;
  initialCutNeedsRevisions: boolean;
  finalCutHasMedia: boolean;
  queuedForAir: boolean;
  /** YYYY-MM-DD show a queued package is assigned to. */
  queuedForShowDate: string | null;
  /** ISO times for "when did that happen" lines. */
  proofsUpdatedAt: string | null;
  brainstormFeedbackAt: string | null;
  latestCutAt: string | null;
  signoffs: Array<{ stage: string; approved: boolean; createdAt: string }>;
};

/** A client-side optimistic value, applied only while the server value it replaced is current. */
export type FlagOverride = { value: boolean; base: boolean };
export type FlagKey = "pitching" | "proofOfContact";
export type FlagOverrides = Partial<Record<FlagKey, FlagOverride>>;

export function resolveFlag(override: FlagOverride | undefined, base: boolean) {
  return override && override.base === base ? override.value : base;
}

/**
 * Drops overrides whose server value has moved on (the refresh landed). A spent override must
 * not linger: if the value later returned to its old base (another producer undid it), it would
 * wrongly apply again. Returns the same object when nothing changes.
 */
export function pruneFlagOverrides(overrides: FlagOverrides, server: Record<FlagKey, boolean>): FlagOverrides {
  const keys = (Object.keys(overrides) as FlagKey[]).filter((key) => overrides[key]?.base !== server[key]);
  if (keys.length === 0) return overrides;
  const next = { ...overrides };
  for (const key of keys) delete next[key];
  return next;
}

export function applyFlagOverrides(facts: GroupStageFacts, overrides: FlagOverrides): GroupStageFacts {
  return {
    ...facts,
    pitching: resolveFlag(overrides.pitching, facts.pitching),
    proofOfContact: resolveFlag(overrides.proofOfContact, facts.proofOfContact)
  };
}

export function navStateFromFacts(facts: GroupStageFacts): GroupNavState {
  return {
    pitching: facts.pitching,
    proofOfContact: facts.proofOfContact,
    aRollBRoll: facts.aRollBRoll,
    finalCut: facts.finalCut,
    approvalStage: facts.approvalStage
  };
}

function statusInput(facts: GroupStageFacts): CycleStageStatusInput {
  return {
    ...emptyCycleStageStatusInput(),
    proofOfContact: facts.proofOfContact,
    proofCount: facts.proofCount,
    brainstormDocUrl: facts.brainstormDocUrl,
    brainstormNeedsChanges: facts.brainstormNeedsChanges,
    aRollBRoll: facts.aRollBRoll,
    initialCut: facts.initialCut,
    initialCutHasMedia: facts.initialCutHasMedia,
    awaitingRevisedInitialCut: facts.awaitingRevisedInitialCut,
    initialCutNeedsRevisions: facts.initialCutNeedsRevisions,
    approvalStage: facts.rawApprovalStage,
    finalCutHasMedia: facts.finalCutHasMedia,
    queuedForAir: facts.queuedForAir
  };
}

export function pitchStatus(pitching: boolean): CycleStageStatus {
  return pitching ? "approved" : "pending";
}

/** Contact status, the same rule the student Brainstorming tab uses. */
export function contactStatus(input: {
  proofOfContact: boolean;
  proofCount: number;
  brainstormDocUrl: string;
  brainstormNeedsChanges: boolean;
}): CycleStageStatus {
  return cycleStageStatus("brainstorming", { ...emptyCycleStageStatusInput(), ...input });
}

/** A-roll footage isn't loaded here, so only approved or locked are known. */
function aRollStatus(facts: GroupStageFacts): CycleStageStatus | null {
  if (facts.aRollBRoll) return "approved";
  return facts.proofOfContact ? null : "locked";
}

export function initialCutStatus(facts: GroupStageFacts) {
  return cycleStageStatus("initial-cut", statusInput(facts));
}

export function finalCutStatus(facts: GroupStageFacts) {
  return cycleStageStatus("final-cut", statusInput(facts), { showQueued: true });
}

/** 1, 2 or 3 for the review step in progress; 4 once all three have signed off. */
export function initialReviewStep(approvalStage: string): 1 | 2 | 3 | 4 {
  if (approvalStage === "ADVISER_REVIEW") return 2;
  if (approvalStage === "EXECUTIVE_REVIEW") return 3;
  if (approvalStage === "APPROVED") return 4;
  return 1;
}

export type StepState = "done" | "current" | "upcoming";

/** Stage 1/2/3 states. Stage 1 waits until A-roll is approved or a cut was sent for review. */
export function initialStepStates(facts: GroupStageFacts): [StepState, StepState, StepState] {
  const step = initialReviewStep(facts.approvalStage);
  const started = step > 1 || facts.aRollBRoll || facts.approvalStage === "ASSOCIATE_REVIEW";
  const state = (n: number): StepState =>
    n < step ? "done" : n === step && started ? "current" : "upcoming";
  return [state(1), state(2), state(3)];
}

const PACIFIC_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric"
});
const UTC_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

/** "Oct 8" in Pacific time (the class's time zone), the same on the server and in the browser. */
export function formatStageDay(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : PACIFIC_DAY.format(date);
}

/** "Oct 21" for a YYYY-MM-DD show date. */
export function formatShowDay(day: string | null | undefined) {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : UTC_DAY.format(date);
}

function dated(label: string, iso: string | null | undefined) {
  const day = formatStageDay(iso);
  return day ? `${label} ${day}` : null;
}

export type StageCellKey = "pitching" | "brainstorming" | "a-roll" | "initial" | "final-cut";

export type StageCell = {
  key: StageCellKey;
  index: number;
  label: string;
  shortLabel: string;
  href: string;
  /** The page being viewed. */
  active: boolean;
  done: boolean;
  /** The first stage still waiting (where a tile or J/K lands). */
  pending: boolean;
  /** Tag to show, from the cycle status vocabulary. Null shows no tag. */
  status: CycleStageStatus | null;
  /** Nothing has happened here yet: muted text, still a link. */
  dimmed: boolean;
  /** Top rule: one segment, or three for Initial Cut (Stage 1, 2, 3). */
  segments: StepState[];
  /** "Proofs Oct 8", shown on wide screens; left off the open stage when its page says it. */
  meta: string | null;
  title?: string;
};

function cellKeyForSlug(slug: GroupNavSlug): StageCellKey {
  return slug.startsWith("initial-stage-") ? "initial" : (slug as StageCellKey);
}

/** Pending shows only where work waits or on the page being viewed; locked never shows. */
function visibleStatus(status: CycleStageStatus | null, pending: boolean, active: boolean) {
  if (!status || status === "locked") return null;
  if (status === "pending" && !pending && !active) return null;
  return status;
}

const LOCKED_TITLE = "Students unlock this once the previous stage is approved";

/** The five cells of a group's stage bar (Pitch, Contact, A/B-roll, Initial Cut, Final Cut). */
export function groupStageCells(rowId: string, activeSlug: GroupNavSlug, facts: GroupStageFacts): StageCell[] {
  const nav = navStateFromFacts(facts);
  const pendingKey = cellKeyForSlug(pendingGroupNavSlug(nav));
  const activeKey = cellKeyForSlug(activeSlug);
  const step = initialReviewStep(facts.approvalStage);
  const initialSteps = initialStepStates(facts);
  const contact = contactStatus(facts);
  const showDay = facts.queuedForAir ? formatShowDay(facts.queuedForShowDate) : null;

  const base = [
    {
      key: "pitching" as const,
      label: "Pitch",
      shortLabel: "Pitch",
      slug: "pitching",
      done: groupNavTabDone("pitching", nav),
      status: pitchStatus(facts.pitching),
      meta: null,
      metaOnPage: false
    },
    {
      key: "brainstorming" as const,
      label: "Contact",
      shortLabel: "Contact",
      slug: "brainstorming",
      done: groupNavTabDone("brainstorming", nav),
      status: contact,
      meta:
        contact === "approved"
          ? null
          : contact === "needs-revisions"
            ? dated("Feedback", facts.brainstormFeedbackAt)
            : dated("Proofs", facts.proofsUpdatedAt),
      // Contact's decision bar and Initial Cut's approval stages repeat the date.
      metaOnPage: true
    },
    {
      key: "a-roll" as const,
      label: "A/B-roll",
      shortLabel: "A/B",
      slug: "a-roll",
      done: groupNavTabDone("a-roll", nav),
      status: aRollStatus(facts),
      meta: null,
      metaOnPage: false
    },
    {
      key: "initial" as const,
      label: "Initial Cut",
      shortLabel: "Initial",
      slug: `initial-stage-${Math.min(step, 3)}`,
      done: groupNavTabDone("initial-stage-3", nav),
      status: initialCutStatus(facts),
      meta: dated("Cut", facts.latestCutAt),
      metaOnPage: true
    },
    {
      key: "final-cut" as const,
      label: "Final Cut",
      shortLabel: "Final",
      slug: "final-cut",
      done: groupNavTabDone("final-cut", nav),
      status: finalCutStatus(facts),
      // Nothing on the Final Cut page names the show date, so it stays here.
      meta: showDay ? `Airs ${showDay}` : null,
      metaOnPage: false
    }
  ];

  return base.map((cell, position) => {
    const active = cell.key === activeKey;
    const pending = cell.key === pendingKey && !cell.done;
    const status = visibleStatus(cell.status, pending, active);
    const segments: StepState[] =
      cell.key === "initial" ? initialSteps : [cell.done ? "done" : pending ? "current" : "upcoming"];
    return {
      key: cell.key,
      index: position + 1,
      label: cell.label,
      shortLabel: cell.shortLabel,
      href: `/groups/${rowId}/${cell.slug}`,
      active,
      done: cell.done,
      pending,
      status,
      dimmed: !active && !cell.done && !pending && status === null,
      segments,
      meta: (status !== null || cell.done) && !(active && cell.metaOnPage) ? cell.meta : null,
      title:
        cell.status === "locked"
          ? LOCKED_TITLE
          : cell.key === "initial"
            ? `Initial Cut · ${step > 3 ? "all three stages approved" : `Stage ${step} of 3`}`
            : undefined
    };
  });
}

export type ApprovalStep = {
  key: string;
  number: 1 | 2 | 3;
  role: string;
  href: string;
  state: StepState;
  active: boolean;
  /** Only on the step in progress, and only when something happened there. */
  status: CycleStageStatus | null;
  meta: string | null;
};

const STEP_SIGNOFF_STAGE = {
  1: "ASSOCIATE_REVIEW",
  2: "ADVISER_REVIEW",
  3: "EXECUTIVE_REVIEW"
} as const;

const STEP_ROLE = {
  1: "Producer review",
  2: "Adviser review",
  3: "Executive sign-off"
} as const;

const STEP_TAG_STATUSES: CycleStageStatus[] = ["needs-revisions", "stage-1-approved", "submitted"];

function latestSignoff(facts: GroupStageFacts, stage: string, approved: boolean) {
  return facts.signoffs
    .filter((entry) => entry.stage === stage && entry.approved === approved)
    .reduce<string | null>(
      (latest, entry) => (!latest || new Date(entry.createdAt) > new Date(latest) ? entry.createdAt : latest),
      null
    );
}

/**
 * Initial Cut's three-step approval chain (Stage 1 producer → Stage 2 adviser → Stage 3
 * executives). The header already names the producer, or tags a group that has none.
 */
export function approvalPathSteps(rowId: string, activeSlug: GroupNavSlug, facts: GroupStageFacts): ApprovalStep[] {
  const states = initialStepStates(facts);
  const status = initialCutStatus(facts);
  return ([1, 2, 3] as const).map((number) => {
    const state = states[number - 1];
    const signoffStage = STEP_SIGNOFF_STAGE[number];
    const revisions = state === "current" && status === "needs-revisions";
    const meta =
      state === "done"
        ? dated("Approved", latestSignoff(facts, signoffStage, true))
        : revisions
          ? dated("Sent back", latestSignoff(facts, signoffStage, false))
          : state === "current"
            ? dated("Cut", facts.latestCutAt)
            : null;
    return {
      key: `initial-stage-${number}`,
      number,
      role: STEP_ROLE[number],
      href: `/groups/${rowId}/initial-stage-${number}`,
      state,
      active: activeSlug === `initial-stage-${number}`,
      status: state === "current" && STEP_TAG_STATUSES.includes(status) ? status : null,
      meta
    };
  });
}

export function isInitialSlug(slug: GroupNavSlug) {
  return slug.startsWith("initial-stage-");
}

/** A/B-roll, Initial and Final are the hosted StageWorkspace; Pitch and Contact are this route's panels. */
export function isWorkspaceSlug(slug: GroupNavSlug) {
  return slug !== "pitching" && slug !== "brainstorming";
}
