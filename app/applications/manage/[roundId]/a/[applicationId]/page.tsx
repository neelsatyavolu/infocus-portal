import type { Metadata } from "next";
import { ApplicantReview } from "@/components/applications/applicant-review";
import { loadApplicationDetail } from "@/src/server/applications/page-data";

export const metadata: Metadata = { title: "Applicant" };

export default async function ApplicantPage({ params }: { params: Promise<{ roundId: string; applicationId: string }> }) {
  const { roundId, applicationId } = await params;
  const detail = await loadApplicationDetail(roundId, applicationId);
  return <ApplicantReview detail={detail} />;
}
