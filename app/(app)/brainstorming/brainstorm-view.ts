import {
  isGoogleDocUrl,
  PROOF_OF_CONTACT_REQUIRED,
  type BrainstormProofView
} from "@/src/lib/package-brainstorm";
import { cycleStageStatus, emptyCycleStageStatusInput, type CycleStageStatus } from "@/src/lib/package-stage-status";

/** Types and pure helpers for /brainstorming (no React, so they are unit-tested in tests/brainstorming-view.test.ts). */

export type Person = { name: string | null; email: string | null };

export type BrainstormMember = Person & { userId: string };

export type BrainstormPackage = {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  brainstormDocUrl: string;
  proofOfContact: boolean;
  needsChanges: boolean;
  canEdit: boolean;
  assignedProducer: (Person & { userId: string }) | null;
  members: BrainstormMember[];
  proofs: BrainstormProofView[];
};

export type BrainstormPayload = {
  currentUserId: string;
  canApprove: boolean;
  activeCycleNumber: number;
  cycles: Array<{ cycleNumber: number; focus: string }>;
  packages: BrainstormPackage[];
};

/** The PATCH /api/brainstorming response (serializeBrainstormPackage) has no canEdit. */
export type SavedBrainstormPackage = Omit<BrainstormPackage, "canEdit"> & { canEdit?: boolean };

/** What the page has on screen: a payload and the ?cycle it answered (null = the current cycle). */
export type BrainstormView = { payload: BrainstormPayload; requested: number | null };

/** The page's instruction line. */
export const BRAINSTORM_INSTRUCTIONS =
  "Upload three proofs of contact and link the group Google Doc. Your producer reviews this on Groups and approves the check-in.";

export function personLabel(person: Person | null | undefined) {
  if (!person) return null;
  return person.name?.trim() || person.email || null;
}

export function packageTitle(pkg: Pick<BrainstormPackage, "groupTopic">) {
  return pkg.groupTopic.trim() || "Untitled package";
}

/**
 * Which state the page is in. `wantedCycle` is ?cycle, else the known current cycle (null on a
 * first visit). A view counts only when it answers that cycle, so a cycle switch shows the
 * skeleton instead of the previous cycle's packages.
 */
export function brainstormScreen(view: BrainstormView | null, wantedCycle: number | null, error: string | null) {
  const showingWanted =
    view !== null && (wantedCycle !== null ? view.payload.activeCycleNumber === wantedCycle : view.requested === null);
  const state: "loading" | "error" | "ready" = showingWanted ? "ready" : error ? "error" : "loading";
  return {
    state,
    displayCycle: wantedCycle ?? (view && showingWanted ? view.payload.activeCycleNumber : null),
    packages: showingWanted && view ? view.payload.packages : []
  };
}

export function packageStatus(pkg: BrainstormPackage): CycleStageStatus {
  return cycleStageStatus("brainstorming", {
    ...emptyCycleStageStatusInput(),
    proofOfContact: pkg.proofOfContact,
    proofCount: pkg.proofs.length,
    brainstormDocUrl: pkg.brainstormDocUrl,
    brainstormNeedsChanges: pkg.needsChanges
  });
}

/** "Abby, otto@example.edu, Member" in roster order (name, else email, else Member), or "No members". */
export function memberLine(members: BrainstormMember[]) {
  return members.map((member) => personLabel(member) ?? "Member").join(", ") || "No members";
}

/** Members, then the producer, in the same form as the other stage pages' header. */
export function metaLine(pkg: BrainstormPackage) {
  return `${memberLine(pkg.members)} · Producer: ${personLabel(pkg.assignedProducer) ?? "not assigned yet"}`;
}

/** The one-line "what happens next" for a package, from data the page already has. */
export function nextStep(pkg: BrainstormPackage): string {
  const status = packageStatus(pkg);
  if (status === "approved") return "Approved by your producer.";
  if (status === "needs-revisions") {
    // Only a proof upload after the feedback clears REVISIONS (a doc edit does not), and filled slots must be emptied first.
    return "Your producer asked for changes. Read the feedback, then remove a proof and upload a new one to send it back for review.";
  }
  if (status === "submitted") {
    return `Everything is in. Waiting for ${personLabel(pkg.assignedProducer) ?? "your producer"} to review.`;
  }
  const missing = Math.max(0, PROOF_OF_CONTACT_REQUIRED - pkg.proofs.length);
  const needsDoc = !isGoogleDocUrl(pkg.brainstormDocUrl);
  const proofs = missing > 0 ? `${missing} ${pkg.proofs.length > 0 ? "more " : ""}${missing === 1 ? "proof" : "proofs"}` : "";
  if (proofs && needsDoc) return `Add ${proofs} and the Google Doc link.`;
  if (proofs) return `Add ${proofs}.`;
  return "Add the Google Doc link.";
}

export type DocState = "linked" | "missing" | "dirty";

export function isDocDirty(saved: string, draft: string | undefined) {
  return draft !== undefined && draft.trim() !== saved.trim();
}

export function docState(saved: string, draft: string | undefined): DocState {
  if (isDocDirty(saved, draft)) return "dirty";
  return isGoogleDocUrl(saved) ? "linked" : "missing";
}

/** Merges a saved package into the one on screen, keeping canEdit when the response has none. */
export function mergeSavedPackage(current: BrainstormPackage, next: SavedBrainstormPackage): BrainstormPackage {
  return { ...current, ...next, canEdit: next.canEdit ?? current.canEdit };
}

/** A new proof in its slot. A proof after producer feedback sends brainstorming back for review. */
export function withProof(pkg: BrainstormPackage, proof: BrainstormProofView): BrainstormPackage {
  const proofs = [...pkg.proofs.filter((item) => item.slot !== proof.slot), proof].sort((a, b) => a.slot - b.slot);
  return { ...pkg, proofs, needsChanges: false };
}

export function withoutProof(pkg: BrainstormPackage, slot: number): BrainstormPackage {
  return { ...pkg, proofs: pkg.proofs.filter((proof) => proof.slot !== slot) };
}

export function mapPackage(
  payload: BrainstormPayload,
  packageId: string,
  update: (pkg: BrainstormPackage) => BrainstormPackage
): BrainstormPayload {
  if (!payload.packages.some((pkg) => pkg.id === packageId)) return payload;
  return { ...payload, packages: payload.packages.map((pkg) => (pkg.id === packageId ? update(pkg) : pkg)) };
}

/** ?cycle=N: only a positive integer counts; anything else means the server default. */
export function parseCycleParam(value: string | null | undefined) {
  if (!value) return null;
  const cycle = Number(value);
  return Number.isInteger(cycle) && cycle > 0 ? cycle : null;
}

/**
 * The query string after switching to `cycle`: always ?cycle=N, except on the known current
 * cycle, where the param is dropped (a reload then follows the current cycle). Other params stay.
 */
export function cycleSearch(search: string, cycle: number, currentCycle: number | null) {
  const params = new URLSearchParams(search);
  if (currentCycle !== null && cycle === currentCycle) params.delete("cycle");
  else params.set("cycle", String(cycle));
  const next = params.toString();
  return next ? `?${next}` : "";
}
