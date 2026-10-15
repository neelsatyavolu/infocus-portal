import { CountBadge } from "@/components/kit/status-tag";
import { formatCount } from "@/components/kit/tone";

/**
 * Counts in the call say what they mean by tone: green = unread chat, amber = people waiting to
 * be let in, neutral = a plain total. The amber one is a solid fixed hex (with Ink text) so it
 * reads on the bars, in the panel tabs and on corners in both themes.
 */
export function CallCount({
  count,
  tone,
  srLabel,
  showZero = false
}: {
  count: number;
  tone: "brand" | "warn" | "neutral";
  srLabel?: string;
  showZero?: boolean;
}) {
  if (tone !== "warn") return <CountBadge count={count} tone={tone} srLabel={srLabel} showZero={showZero} />;
  if (!showZero && !(count >= 1)) return null;
  return (
    <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-sm bg-[#F2A516] px-1 font-mono-broadcast text-[11px] font-medium leading-none tabular-nums text-[#0F110F]">
      <span aria-hidden={srLabel ? true : undefined}>{formatCount(count)}</span>
      {srLabel ? <span className="sr-only">{srLabel}</span> : null}
    </span>
  );
}
