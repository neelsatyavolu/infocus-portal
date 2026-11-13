import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplicationForm } from "@/components/applications/application-form";
import { getApplicationsViewer } from "@/src/server/applications/access";
import { getMyApplication } from "@/src/server/applications/applicant";

export const metadata: Metadata = { title: "Application" };

export default async function ApplicationPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const viewer = await getApplicationsViewer();
  const view = await getMyApplication(viewer, roundId).catch((error: unknown) => {
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  });
  // Re-mount after submit/unsubmit so the form starts from what the server saved.
  return <ApplicationForm key={`${view.application?.status ?? "new"}-${view.application?.version ?? 0}`} view={view} />;
}
