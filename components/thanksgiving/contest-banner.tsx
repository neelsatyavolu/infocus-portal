import { HARVEST_CONTEST, type ContestResult } from "@/src/lib/thanksgiving-board";
import { cn } from "@/src/lib/utils";

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The Thanksgiving contest in big letters: the prize while it runs, the winner once it has closed
 * (src/server/thanksgiving-contest.ts). On the leaderboard page and in the leaderboard popup.
 */
export function ContestBanner({
  open,
  result,
  viewerId,
  className
}: {
  /** The contest hasn't closed yet. */
  open: boolean;
  result: ContestResult | null;
  viewerId: string | null;
  className?: string;
}) {
  const days = `${HARVEST_CONTEST.prizeDays} free extension days`;
  let headline: string;
  let detail: string;
  if (open) {
    headline = days.toUpperCase();
    detail = `Whoever is #1 on the leaderboard at ${HARVEST_CONTEST.closesLabel} wins ${HARVEST_CONTEST.prizeDays} extension days for their whole package group. It's the total that counts: leaves, pies, wishbones, giant turkeys and pardons, one point each.`;
  } else if (result && result.winners.length > 0) {
    const youWon = result.winners.some((winner) => winner.userId === viewerId);
    headline = youWon ? `YOU WON ${days.toUpperCase()}` : `${joinNames(result.winners.map((winner) => winner.name)).toUpperCase()} WON`;
    detail = youWon
      ? `You were #1 at ${HARVEST_CONTEST.closesLabel} with ${result.total}. ${result.ungranted.includes(viewerId ?? "") ? "You're not on a package group this cycle, so an exec will add the days by hand." : "The days are already on your group's package. Check Extension Requests."}`
      : `${days[0].toUpperCase()}${days.slice(1)} for their package group, #1 at ${HARVEST_CONTEST.closesLabel} with ${result.total}. The board keeps counting through November for bragging rights.`;
  } else {
    headline = "THE CONTEST IS OVER";
    detail = "The board keeps counting through November for bragging rights.";
  }

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
