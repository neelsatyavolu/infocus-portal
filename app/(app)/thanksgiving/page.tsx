import type { Metadata } from "next";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/page-header";
import { HarvestBoard } from "@/components/thanksgiving/harvest-board";
import { TurkeySprite } from "@/components/thanksgiving/sprites";
import { requireUserId } from "@/src/lib/auth";
import { loadHarvestBoard } from "@/src/server/thanksgiving-scores";

export const metadata: Metadata = { title: "Leaderboard" };

/**
 * Thanksgiving leaderboard: everyone's leaves, pies, wishbones, giant turkey sightings and
 * pardoned turkeys this November (src/lib/thanksgiving-board.ts). Open to everyone signed in.
 */
export default async function ThanksgivingLeaderboardPage() {
  const userId = await requireUserId();
  const board = await loadHarvestBoard();

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow={`Thanksgiving ${board.year}`}
        title="Leaderboard"
        description="Catch leaves, eat pies, snap wishbones, spot the giant turkey and pardon the ones that strut by (five clicks each). Every catch counts one."
      />
      {board.rows.length > 0 ? (
        <section aria-label="Leaderboard">
          <HarvestBoard rows={board.rows} viewerId={userId} />
        </section>
      ) : (
        <EmptyState
          icon={<TurkeySprite className="h-10 w-10" />}
          title="Nobody's on the board yet"
          description="Catch a falling leaf or eat a pie and you're first."
        />
      )}
    </div>
  );
}
