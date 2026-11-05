import type { ComponentType } from "react";
import { Medal } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import {
  HARVEST_KINDS,
  HARVEST_LABELS,
  type DisqualifiedEntry,
  type HarvestKind,
  type RankedEntry
} from "@/src/lib/thanksgiving-board";
import { cn } from "@/src/lib/utils";
import type { RankMove } from "@/src/lib/thanksgiving-standings";
import { GoldenLeafSprite, LeafSprite, PieSprite, TurkeySprite, WishboneSprite } from "./sprites";

function LeafIcon({ className }: { className?: string }) {
  return <LeafSprite variant={1} className={className} />;
}

/** A pardoned turkey gets a medal. */
function PardonIcon({ className }: { className?: string }) {
  return <Medal aria-hidden className={cn(className, "text-[var(--brand-green)]")} />;
}

const KIND_ICONS: Record<HarvestKind, ComponentType<{ className?: string }>> = {
  leaves: LeafIcon,
  goldenLeaves: GoldenLeafSprite,
  pies: PieSprite,
  wishbones: WishboneSprite,
  giantTurkeys: TurkeySprite,
  pardons: PardonIcon
};

const NUMBER = "font-mono-broadcast tabular-nums";

/** ▲3 / ▼1 / New since 24 hours ago; nothing when the place hasn't changed. */
function MoveTag({ move }: { move: RankMove | undefined }) {
  if (move === undefined || move === 0) return null;
  if (move === "new") {
    return (
      <StatusTag tone="neutral" size="sm" className="ml-2" title="Not on the board 24 hours ago">
        New
      </StatusTag>
    );
  }
  const up = move > 0;
  return (
    <span
      className={cn(NUMBER, "ml-2 text-xs", up ? "text-[var(--brand-green)]" : "text-muted-foreground")}
      title={`${up ? "Up" : "Down"} ${Math.abs(move)} since 24 hours ago`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(move)}
      <span className="sr-only">{` ${up ? "up" : "down"} since yesterday`}</span>
    </span>
  );
}

/**
 * The Thanksgiving leaderboard as a table: rank, name, total, then one column per kind of catch.
 * `compact` (the popup) keeps rank, name and total only. The viewer's row is marked. Disqualified
 * accounts follow the ranks, unranked, with their total struck through. Total is points (golden
 * leaves count 5, harvest hour doubles); Bonus is harvest hour's extra. `moves` marks how far each
 * ranked person moved since 24 hours ago.
 */
export function HarvestBoard({
  rows,
  disqualified = [],
  viewerId,
  compact = false,
  moves
}: {
  rows: readonly RankedEntry[];
  disqualified?: readonly DisqualifiedEntry[];
  viewerId: string | null;
  compact?: boolean;
  moves?: Readonly<Record<string, RankMove>>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-0 text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="w-12 px-3 py-2 font-medium">
              #
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Name
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Total
            </th>
            {compact
              ? null
              : HARVEST_KINDS.map((kind) => {
                  const Icon = KIND_ICONS[kind];
                  return (
                    <th key={kind} scope="col" className="px-3 py-2 text-right font-medium">
                      <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
                        <Icon className="h-4 w-4 shrink-0" />
                        {HARVEST_LABELS[kind]}
                      </span>
                    </th>
                  );
                })}
            {compact ? null : (
              <th scope="col" className="px-3 py-2 text-right font-medium" title="Harvest hour's extra points">
                Bonus
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const mine = row.userId === viewerId;
            return (
              <tr key={row.userId} className={cn(mine && "bg-[var(--brand-green)]/10")} aria-current={mine ? "true" : undefined}>
                <td className={cn(NUMBER, "px-3 py-2 text-muted-foreground")}>{row.rank}</td>
                <td className="max-w-[16rem] truncate px-3 py-2 font-medium text-foreground">
                  {row.name}
                  {mine ? <span className="ml-2 text-xs font-normal text-muted-foreground">You</span> : null}
                  <MoveTag move={moves?.[row.userId]} />
                </td>
                <td className={cn(NUMBER, "px-3 py-2 text-right text-foreground")}>{row.total}</td>
                {compact
                  ? null
                  : HARVEST_KINDS.map((kind) => (
                      <td key={kind} className={cn(NUMBER, "px-3 py-2 text-right text-[var(--ink-text)]")}>
                        {row[kind]}
                      </td>
                    ))}
                {compact ? null : (
                  <td className={cn(NUMBER, "px-3 py-2 text-right text-[var(--ink-text)]")}>{row.bonus > 0 ? `+${row.bonus}` : 0}</td>
                )}
              </tr>
            );
          })}
          {disqualified.map((row) => (
            <tr key={row.userId} className="text-muted-foreground">
              <td className={cn(NUMBER, "px-3 py-2")}>
                <span aria-hidden>–</span>
                <span className="sr-only">Not ranked</span>
              </td>
              <td className="max-w-[16rem] px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{row.name}</span>
                  {row.userId === viewerId ? <span className="text-xs">You</span> : null}
                  <StatusTag tone="danger" size="sm" title="Caught by the leaderboard's cheat checks">
                    Disqualified
                  </StatusTag>
                </span>
              </td>
              <td className={cn(NUMBER, "px-3 py-2 text-right line-through")}>{row.total}</td>
              {compact
                ? null
                : HARVEST_KINDS.map((kind) => (
                    <td key={kind} className={cn(NUMBER, "px-3 py-2 text-right line-through")}>
                      {row[kind]}
                    </td>
                  ))}
              {compact ? null : <td className={cn(NUMBER, "px-3 py-2 text-right line-through")}>{row.bonus}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
