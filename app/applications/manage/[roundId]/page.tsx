import type { Metadata } from "next";
import { ApplicantsTable } from "@/components/applications/applicants-table";
import { RoundHeader } from "@/components/applications/round-header";
import { loadRoundOverview } from "@/src/server/applications/page-data";

export const metadata: Metadata = { title: "Applicants" };

export default async function RoundApplicantsPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const overview = await loadRoundOverview(roundId);
  return (
    <div className="space-y-5">
      <RoundHeader round={overview.round} tab="applicants" />
      <ApplicantsTable overview={overview} />
    </div>
  );
}
