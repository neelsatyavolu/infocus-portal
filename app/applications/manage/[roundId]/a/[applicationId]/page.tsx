import type { Metadata } from "next";
import { ApplicantsWorkspace, RoundActions } from "@/components/applications/applicants-workspace";
import { RoundHeader } from "@/components/applications/round-header";
import { loadApplicationDetail, loadRoundOverview } from "@/src/server/applications/page-data";

export const metadata: Metadata = { title: "Applicant" };

export default async function ApplicantPage({ params }: { params: Promise<{ roundId: string; applicationId: string }> }) {
  const { roundId, applicationId } = await params;
  const [overview, detail] = await Promise.all([loadRoundOverview(roundId), loadApplicationDetail(roundId, applicationId)]);
  return (
    <div className="space-y-5">
      <RoundHeader round={overview.round} tab="applicants" toolbar={<RoundActions overview={overview} />} />
      <ApplicantsWorkspace overview={overview} detail={detail} showDetailOnPhone />
    </div>
  );
}
