"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { StatTile } from "@/components/kit/stat-tile";
import { StatusTag } from "@/components/kit/status-tag";
import { MAX_PACKAGES_PER_SHOW } from "@/src/lib/publishing-queue";
import { cn } from "@/src/lib/utils";
import type { QueueSummary as Summary, ShowView } from "./queue-view-model";

/** The words under a half-width tile's value; on phones screen readers still get them. */
function Hint({ children }: { children: ReactNode }) {
  return <span className="max-sm:sr-only">{children}</span>;
}

/** "Next show" on phones, the longer words from sm. */
function TileLabel({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="max-sm:hidden">{long}</span>
    </>
  );
}

const TILE = "max-sm:p-3";

/** Tile values step down to 16px on phones, where two tiles share one row. */
function Value({ children }: { children: ReactNode }) {
  return <span className="max-sm:text-base">{children}</span>;
}

function inFlightText(count: number) {
  return count > 0 ? `${count} in progress` : null;
}

function joined(parts: Array<ReactNode | null | false | undefined>) {
  const shown = parts.filter(Boolean);
  return shown.map((part, index) => (
    <span key={index}>
      {index > 0 ? " · " : null}
      {part}
    </span>
  ));
}

function NextShowTile({ next, canEdit, onJump }: { next: ShowView | null; canEdit: boolean; onJump: (date: string) => void }) {
  if (!next) {
    return <StatTile className={TILE} label="Next show" value={<Value>None</Value>} mono={false} hint={<Hint>No show days coming up</Hint>} />;
  }
  const count = next.rows.length;
  // Producers act on an empty regular show; special shows are skipped by auto-assign on purpose.
  const needsPackage = canEdit && count === 0 && !next.specialName;
  const [weekday, ...rest] = next.shortLabel.split(", ");
  return (
    <StatTile
      className={TILE}
      label={<TileLabel short="Next" long="Next show" />}
      mono={false}
      value={
        <Value>
          <span className="max-sm:hidden">{weekday}, </span>
          {rest.join(", ") || next.shortLabel}
        </Value>
      }
      // A word, not a color: phones hide the hint, so the tag alone has to say it.
      tag={
        needsPackage ? (
          <StatusTag size="sm" tone="warning" title="Needs a package">
            Empty
          </StatusTag>
        ) : undefined
      }
      hint={<Hint>{joined([next.relative, next.specialName, `${count} of ${MAX_PACKAGES_PER_SHOW} packages`])}</Hint>}
      onClick={() => onJump(next.date)}
    />
  );
}

function OpenShowsTile({ summary, onJump, onJumpUnassigned }: { summary: Summary; onJump: (date: string) => void; onJumpUnassigned: () => void }) {
  const { openRegular, regularCount, openSpecial, unassignedCount, firstOpenRegularDate } = summary;
  const target = firstOpenRegularDate
    ? () => onJump(firstOpenRegularDate)
    : unassignedCount > 0
      ? onJumpUnassigned
      : undefined;
  return (
    <StatTile
      className={TILE}
      label={<TileLabel short="Open" long="Open shows" />}
      value={<Value>{openRegular}</Value>}
      tone={openRegular === 0 && regularCount > 0 ? "success" : undefined}
      hint={
        <>
          <Hint>
            {joined([
              openRegular === 0
                ? regularCount > 0
                  ? "Every show has a package"
                  : "No regular shows coming up"
                : `of ${regularCount} regular shows have no package`,
              openSpecial > 0 ? `${openSpecial} special open` : null
            ])}
          </Hint>
          {/* Needs action, so it shows at every width (phones hide the rest of the hint). */}
          {unassignedCount > 0 ? (
            <span className="text-[var(--brand-amber)]">
              <span aria-hidden className="max-sm:hidden">
                {" · "}
              </span>
              {unassignedCount} without a show
            </span>
          ) : null}
        </>
      }
      onClick={target}
    />
  );
}

function YoutubeTile({
  summary,
  publishingConfigured,
  canEdit,
  onJumpToFailed,
  onShowPublished
}: {
  summary: Summary;
  publishingConfigured: boolean | null;
  canEdit: boolean;
  onJumpToFailed: () => void;
  onShowPublished?: () => void;
}) {
  const label = <TileLabel short="YouTube" long={canEdit ? "YouTube" : "On YouTube"} />;
  // Producers get the full row on phones, so "N failed" or "Not set up" is never cut short. Its
  // hint shows at every width (no <Hint>), so phones see the whole message too.
  const tile = cn(TILE, canEdit && "max-sm:col-span-2");
  if (publishingConfigured === null) return <StatTile className={tile} label={label} value="" loading />;
  if (publishingConfigured === false) {
    return (
      <StatTile
        className={tile}
        label={label}
        value={<Value>Not set up</Value>}
        mono={false}
        tone="muted"
        hint={
          <>
            <span className="sr-only">YouTube publishing is not configured yet. </span>
            Queue scheduling is still available.
          </>
        }
      />
    );
  }
  const { published, inFlight, failed } = summary.youtube;
  // Producers fix failures, so they lead; website managers can't act on them.
  if (canEdit && failed > 0) {
    return (
      <StatTile
        className={tile}
        label={label}
        tone="danger"
        value={
          <Value>
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {failed} failed
            </span>
          </Value>
        }
        hint={joined([`${published} on YouTube`, inFlightText(inFlight)])}
        onClick={onJumpToFailed}
      />
    );
  }
  return (
    <StatTile
      className={tile}
      label={label}
      value={<Value>{published}</Value>}
      hint={joined([canEdit ? "on YouTube" : "published packages", inFlightText(inFlight)])}
      onClick={published > 0 ? onShowPublished : undefined}
    />
  );
}

/**
 * The at-a-glance strip: next show, open shows (producers) and YouTube. Producers: one row from
 * sm; on phones Next and Open share a row and YouTube takes the next. Website managers: two tiles
 * in one row. Tiles jump to what they count.
 */
export function QueueSummary({
  summary,
  canEdit,
  publishingConfigured,
  onJumpToShow,
  onJumpToUnassigned,
  onJumpToFailed,
  onShowPublished
}: {
  summary: Summary;
  canEdit: boolean;
  publishingConfigured: boolean | null;
  onJumpToShow: (date: string) => void;
  onJumpToUnassigned: () => void;
  onJumpToFailed: () => void;
  /** Website managers: jump to the recently published list. */
  onShowPublished?: () => void;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:gap-4 *:h-full", canEdit && "sm:grid-cols-3")}>
      <NextShowTile next={summary.next} canEdit={canEdit} onJump={onJumpToShow} />
      {canEdit ? <OpenShowsTile summary={summary} onJump={onJumpToShow} onJumpUnassigned={onJumpToUnassigned} /> : null}
      <YoutubeTile
        summary={summary}
        publishingConfigured={publishingConfigured}
        canEdit={canEdit}
        onJumpToFailed={onJumpToFailed}
        onShowPublished={onShowPublished}
      />
    </div>
  );
}
