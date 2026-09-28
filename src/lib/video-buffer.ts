/** Downloaded stretch of a video, as percentages of the seek track. */
export type BufferedSpan = { startPct: number; endPct: number };

type TimeRangesLike = Pick<TimeRanges, "length" | "start" | "end">;

/** Bunny serves HLS playlists; Drive (NAS) serves progressive MP4 that the browser plays directly. */
export function isHlsPlaylistUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".m3u8");
  } catch {
    return false;
  }
}

export function bufferedSpans(ranges: TimeRangesLike, duration: number): BufferedSpan[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [];
  }

  const spans: BufferedSpan[] = [];
  for (let index = 0; index < ranges.length; index += 1) {
    const startPct = Math.max(0, Math.min(100, (ranges.start(index) / duration) * 100));
    const endPct = Math.max(0, Math.min(100, (ranges.end(index) / duration) * 100));
    if (endPct > startPct) {
      spans.push({ startPct, endPct });
    }
  }
  return spans;
}

const SPAN_EPSILON_PCT = 0.1;

export function sameBufferedSpans(a: BufferedSpan[], b: BufferedSpan[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (span, index) =>
        Math.abs(span.startPct - b[index].startPct) < SPAN_EPSILON_PCT &&
        Math.abs(span.endPct - b[index].endPct) < SPAN_EPSILON_PCT
    )
  );
}
