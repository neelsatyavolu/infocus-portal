import { HARVEST_CONTEST, type ContestPhase, type ContestResult, type PrizeStatus } from "@/src/lib/thanksgiving-board";
import { cn } from "@/src/lib/utils";

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const DAYS = `${HARVEST_CONTEST.prizeDays} free extension days`;

/** What happened to the viewer's own prize, said to them. */
function yourPrize(prize: PrizeStatus): string {
  switch (prize.kind) {
    case "own-group":
      return "The days are already on your Cycle 2 group's package. Check Extension Requests.";
    case "gifted":
      return `You gave the days to ${prize.to}.`;
    case "choosing":
      return "Your group already turned in its Final Cut, so pick a group still working to get the days (below).";
    case "no-group":
      return "You're not on a Cycle 2 group, so an exec will sort out the days by hand.";
  }
}

/** Where a winner's prize went, for everyone else. */
function theirPrize(prize: PrizeStatus): string {
  switch (prize.kind) {
    case "gifted":
      return `gave the days to ${prize.to}`;
    case "choosing":
      return "gets to give the days to a group still working on Cycle 2";
    default:
      return "won the days for their Cycle 2 group";
  }
}

function copy(phase: ContestPhase, result: ContestResult | null, viewerId: string | null): { headline: string; detail: string } {
  if (phase === "open") {
    return {
      headline: DAYS.toUpperCase(),
      detail: `Whoever is #1 at ${HARVEST_CONTEST.closesLabel} wins ${HARVEST_CONTEST.prizeDays} extension days for their whole Cycle 2 package group. If their group already turned in its Final Cut, they give the days to a group still working. Every catch is a point, a golden leaf is five, and harvest hour counts double. From ${HARVEST_CONTEST.hiddenLabel} the board goes dark: you'll see only your own points until the winner is revealed at ${HARVEST_CONTEST.revealLabel}.`
    };
  }
  if (phase === "blind") {
    return {
      headline: "THE BOARD IS DARK",
      detail: `It's the last hour, so nobody can see the standings, only their own points. Keep catching until ${HARVEST_CONTEST.closesLabel}. The winner is revealed at ${HARVEST_CONTEST.revealLabel}, here and in Slack.`
    };
  }
  if (phase === "closed" || !result) {
    return {
      headline: "WINNER REVEALED FRIDAY MORNING",
      detail: `The contest closed at ${HARVEST_CONTEST.closesLabel}. The winner is revealed at ${HARVEST_CONTEST.revealLabel}, here and in Slack.`
    };
  }
  if (result.winners.length === 0) {
    return { headline: "THE CONTEST IS OVER", detail: "The board keeps counting through November for bragging rights." };
  }
  const mine = result.winners.find((winner) => winner.userId === viewerId);
  if (mine) {
    return {
      headline: `YOU WON ${DAYS.toUpperCase()}`,
      detail: `You were #1 at ${HARVEST_CONTEST.closesLabel} with ${result.total} points. ${yourPrize(mine.prize)}`
    };
  }
  const names = joinNames(result.winners.map((winner) => winner.name));
  const where = result.winners.map((winner) => `${winner.name} ${theirPrize(winner.prize)}`).join("; ");
  return {
    headline: `${names.toUpperCase()} WON`,
    detail: `#1 at ${HARVEST_CONTEST.closesLabel} with ${result.total} points. ${where}. The board keeps counting through November for bragging rights.`
  };
}

/**
 * The Thanksgiving contest in big letters: the prize while it runs, the dark last hour, the wait
 * for Friday's reveal, then the winner (src/server/thanksgiving-contest.ts). On the leaderboard
 * page and in the leaderboard popup.
 */
export function ContestBanner({
  phase,
  result,
  viewerId,
  className
}: {
  phase: ContestPhase;
  result: ContestResult | null;
  viewerId: string | null;
  className?: string;
}) {
  const { headline, detail } = copy(phase, result, viewerId);
  return (
    <section
      aria-label="Leaderboard contest"
      className={cn("rounded-lg border border-[var(--brand-green)] bg-[var(--brand-green)]/10 p-4 sm:p-5", className)}
    >
      <p className="text-[32px] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-[40px]">
        {headline}
      </p>
      <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-[var(--ink-text)]">{detail}</p>
    </section>
  );
}
