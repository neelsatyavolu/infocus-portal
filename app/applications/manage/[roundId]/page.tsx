import type { Metadata } from "next";
import { ApplicantsWorkspace, RoundActions } from "@/components/applications/applicants-workspace";
import { RoundHeader } from "@/components/applications/round-header";
import { loadApplicationDetail, loadRoundOverview } from "@/src/server/applications/page-data";

export const metadata: Metadata = { title: "Applicants" };

/** The round's applicants: the list on the left and the first applicant opened on the right. */
export default async function RoundApplicantsPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const overview = await loadRoundOverview(roundId);
  const first = overview.applications.find((row) => row.status === "SUBMITTED") ?? overview.applications[0];
  const detail = first ? await loadApplicationDetail(roundId, first.id) : null;
  return (
    <div className="space-y-5">
      <RoundHeader round={overview.round} tab="applicants" toolbar={<RoundActions overview={overview} />} />
      <ApplicantsWorkspace overview={overview} detail={detail} showDetailOnPhone={false} />
    </div>
  );
}
