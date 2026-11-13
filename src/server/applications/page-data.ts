import { notFound, redirect } from "next/navigation";
import { getApplicationsViewer } from "@/src/server/applications/access";
import { getApplicationDetail, getRoundOverview } from "@/src/server/applications/review";

/** Reviewer pages: non-reviewers go back to the applicant home; unknown ids 404. */
async function reviewerOrRedirect() {
  const viewer = await getApplicationsViewer();
  if (!viewer.isReviewer) redirect("/applications" as never);
  return viewer;
}

function notFoundOn404(error: unknown): never {
  if (error instanceof Error && error.message === "NOT_FOUND") notFound();
  throw error;
}

export async function loadRoundOverview(roundId: string) {
  const viewer = await reviewerOrRedirect();
  return getRoundOverview(viewer, roundId).catch(notFoundOn404);
}

export async function loadApplicationDetail(roundId: string, applicationId: string) {
  const viewer = await reviewerOrRedirect();
  return getApplicationDetail(viewer, roundId, applicationId).catch(notFoundOn404);
}
