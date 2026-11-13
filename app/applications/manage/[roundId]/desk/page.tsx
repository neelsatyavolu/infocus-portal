import type { Metadata } from "next";
import { DecisionDesk } from "@/components/applications/decision-desk";
import { RoundHeader } from "@/components/applications/round-header";
import { loadRoundOverview } from "@/src/server/applications/page-data";

export const metadata: Metadata = { title: "Decision desk" };

export default async function DecisionDeskPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const overview = await loadRoundOverview(roundId);
  return (
    <div className="space-y-5">
      <RoundHeader round={overview.round} tab="desk" />
      <DecisionDesk overview={overview} />
    </div>
  );
}
