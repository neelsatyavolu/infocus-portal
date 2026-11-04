import type { Metadata } from "next";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/page-header";
import { ContestBanner } from "@/components/thanksgiving/contest-banner";
import { HarvestBoard } from "@/components/thanksgiving/harvest-board";
import { ReviewPanel } from "@/components/thanksgiving/review-panel";
import { TurkeySprite } from "@/components/thanksgiving/sprites";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { HARVEST_CONTEST, isContestOpen } from "@/src/lib/thanksgiving-board";
import { mayGrantExtensions } from "@/src/server/extension-requests";
import { loadHarvestContest, settleHarvestContest } from "@/src/server/thanksgiving-contest";
import { loadReviewRows, viewerFlag } from "@/src/server/thanksgiving-review";
import { loadHarvestBoard } from "@/src/server/thanksgiving-scores";

export const metadata: Metadata = { title: "Leaderboard" };

/**
 * Thanksgiving leaderboard: everyone's leaves, pies, wishbones, giant turkey sightings and
 * pardoned turkeys this November (src/lib/thanksgiving-board.ts). Open to everyone signed in.
 */
export default async function ThanksgivingLeaderboardPage() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  const reviewer = mayGrantExtensions(access.role);
  await settleHarvestContest();
  const [board, result, flagged, review] = await Promise.all([
    loadHarvestBoard(),
    loadHarvestContest(),
    viewerFlag(userId),
    reviewer ? loadReviewRows() : null
  ]);

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow={`Thanksgiving ${board.year}`}
        title="Leaderboard"
        description="Catch leaves, eat pies, snap wishbones, spot the giant turkey and pardon the ones that strut by (five clicks each). Every catch counts one."
      />
      {board.year === HARVEST_CONTEST.year ? (
        <ContestBanner open={isContestOpen(new Date())} result={result} viewerId={userId} />
      ) : null}
      {flagged ? (
        <Alert tone="warning" title="You're disqualified for now">
          Some of your catches looked automated, so you can&apos;t place or win while an exec checks them.
          You can keep playing; if it&apos;s all you, they&apos;ll restore you with everything you caught.
        </Alert>
      ) : null}
      {board.rows.length > 0 || board.disqualified.length > 0 ? (
        <section aria-label="Leaderboard">
          <HarvestBoard rows={board.rows} disqualified={board.disqualified} viewerId={userId} />
        </section>
      ) : (
        <EmptyState
          icon={<TurkeySprite className="h-10 w-10" />}
          title="Nobody's on the board yet"
          description="Catch a falling leaf or eat a pie and you're first."
        />
      )}
      {review ? <ReviewPanel initialRows={review} /> : null}
    </div>
  );
}
