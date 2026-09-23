import type { PackageApprovalStage } from "@prisma/client";

export type CutUploadEvent = {
  currentStage: PackageApprovalStage;
  awaitingRevisedInitialCut: boolean;
  nextVersionNumber: number;
};

export function initialCutVersionTitle(versionNumber: number) {
  return `Initial Cut Version ${Math.max(1, Math.floor(versionNumber) || 1)}`;
}

export type CutUploadResult =
  | { ok: true; nextStage: PackageApprovalStage; clearAwaiting: boolean; email: "ap" | "adviser" | "execs" | null }
  | { ok: false; status: 409 };

/**
 * Initial Cut upload transition table from the spec.
 */
export function applyInitialCutUpload(event: CutUploadEvent): CutUploadResult {
  const { currentStage, awaitingRevisedInitialCut, nextVersionNumber } = event;

  if (currentStage === "APPROVED") {
    return { ok: false, status: 409 };
  }

  if (currentStage === "DRAFT") {
    return { ok: true, nextStage: "ASSOCIATE_REVIEW", clearAwaiting: true, email: "ap" };
  }

  if (currentStage === "ASSOCIATE_REVIEW" && awaitingRevisedInitialCut) {
    if (nextVersionNumber < 2) {
      return { ok: true, nextStage: "ASSOCIATE_REVIEW", clearAwaiting: false, email: null };
    }
    return { ok: true, nextStage: "ADVISER_REVIEW", clearAwaiting: true, email: "adviser" };
  }

  if (currentStage === "ASSOCIATE_REVIEW") {
    return { ok: true, nextStage: "ASSOCIATE_REVIEW", clearAwaiting: false, email: "ap" };
  }

  if (currentStage === "ADVISER_REVIEW") {
    return { ok: true, nextStage: "ADVISER_REVIEW", clearAwaiting: false, email: "adviser" };
  }

  if (currentStage === "EXECUTIVE_REVIEW") {
    return { ok: true, nextStage: "EXECUTIVE_REVIEW", clearAwaiting: false, email: "execs" };
  }

  return { ok: true, nextStage: "ASSOCIATE_REVIEW", clearAwaiting: true, email: "ap" };
}

export function groupFolderName(groupTopic: string, memberLastNames: string[]) {
  const topic = groupTopic.trim();
  if (topic) {
    return topic;
  }
  const names = memberLastNames.map((name) => name.trim()).filter(Boolean);
  return names.length > 0 ? names.join("-") : "Untitled group";
}
