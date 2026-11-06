import type { Metadata } from "next";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/page-header";
import { ContestBanner } from "@/components/thanksgiving/contest-banner";
import { HarvestBoard } from "@/components/thanksgiving/harvest-board";
import { PrizePanel } from "@/components/thanksgiving/prize-panel";
import { ReviewPanel } from "@/components/thanksgiving/review-panel";
import { TurkeySprite } from "@/components/thanksgiving/sprites";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { contestPhase, HARVEST_CONTEST, isBoardHidden, seesBoard, viewerPoints } from "@/src/lib/thanksgiving-board";
import { rankMove, viewerGapLine, type RankMove } from "@/src/lib/thanksgiving-standings";
import { mayGrantExtensions } from "@/src/server/extension-requests";
import { loadHarvestContest, settleHarvestContest } from "@/src/server/thanksgiving-contest";
import { loadPrizeChoosers, loadPrizeOptions } from "@/src/server/thanksgiving-prize";
import { loadReviewRows, viewerFlag } from "@/src/server/thanksgiving-review";
import { loadHarvestBoard, loadPastRanks } from "@/src/server/thanksgiving-scores";

export const metadata: Metadata = { title: "Leaderboard" };

/**
 * Thanksgiving leaderboard: everyone's leaves, golden leaves, pies, wishbones, giant turkey
 * sightings and pardoned turkeys this November (src/lib/thanksgiving-board.ts). Open to everyone
 * signed in. While the board is dark (until the reveal) everyone sees only their own points except
 * the super admin, who still sees the board.
 */
export default async function ThanksgivingLeaderboardPage() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  const reviewer = mayGrantExtensions(access.role);
  const now = new Date();
  const dark = isBoardHidden(now);
  const hidden = !seesBoard(now, access.role);
  await settleHarvestContest(now);
  const [board, result, flagged, review, choosers] = await Promise.all([
    loadHarvestBoard(now),
    loadHarvestContest(),
    viewerFlag(userId),
    reviewer && !hidden ? loadReviewRows() : null,
    loadPrizeChoosers(userId, reviewer)
  ]);
  const options = choosers.length > 0 ? await loadPrizeOptions() : [];
  const pastRanks = hidden ? new Map<string, number>() : await loadPastRanks(board.rows, now);
  const moves: Record<string, RankMove> = Object.fromEntries(
    board.rows.map((row) => [row.userId, rankMove(row.rank, pastRanks.get(row.userId))])
  );
  const gapLine = flagged || hidden ? null : viewerGapLine(board.rows, userId);

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow={`Thanksgiving ${board.year}`}
        title="Leaderboard"
        description="Catch leaves, eat pies, snap wishbones, spot the giant turkey and pardon the ones that strut by (five clicks each). Every catch counts one, a rare golden leaf counts five, and during harvest hour everything counts double."
      />
      {board.year === HARVEST_CONTEST.year ? <ContestBanner phase={contestPhase(now)} result={result} viewerId={userId} /> : null}
      <PrizePanel choosers={choosers} options={options} viewerId={userId} />
      {flagged ? (
        <Alert tone="warning" title="You're disqualified for now">
          Some of your catches looked automated, so you can&apos;t place or win while an exec checks them.
          You can keep playing; if it&apos;s all you, they&apos;ll restore you with everything you caught.
        </Alert>
      ) : null}
      {dark && !hidden ? (
        <Alert tone="info" title="Only you can see the board right now">
          Until the reveal at {HARVEST_CONTEST.revealLabel}, everyone else, execs included, sees only their own points.
        </Alert>
      ) : null}
      {hidden ? (
        <section aria-label="Your points" className="rounded-lg border border-border bg-card p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">Your points</p>
          <p className="font-mono-broadcast text-[40px] font-medium leading-none tabular-nums text-foreground">
            {viewerPoints(board, userId)}
          </p>
          <p className="mt-3 text-sm text-[var(--ink-text)]">
            The standings are hidden until the winner is revealed at {HARVEST_CONTEST.revealLabel}.
          </p>
        </section>
      ) : board.rows.length > 0 || board.disqualified.length > 0 ? (
        <section aria-label="Leaderboard">
          {gapLine ? <p className="mb-3 text-sm font-medium text-foreground">{gapLine}</p> : null}
          <HarvestBoard rows={board.rows} disqualified={board.disqualified} viewerId={userId} moves={moves} />
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
