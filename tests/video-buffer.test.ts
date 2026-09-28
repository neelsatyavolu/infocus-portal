import { describe, expect, it } from "vitest";
import { bufferedSpans, isHlsPlaylistUrl, sameBufferedSpans } from "@/src/lib/video-buffer";

function ranges(pairs: Array<[number, number]>) {
  return {
    length: pairs.length,
    start: (index: number) => pairs[index][0],
    end: (index: number) => pairs[index][1]
  };
}

describe("isHlsPlaylistUrl", () => {
  it("treats Bunny playlist.m3u8 URLs as HLS", () => {
    expect(isHlsPlaylistUrl("https://zone.b-cdn.net/abc/playlist.m3u8?token=t&expires=1")).toBe(true);
  });

  it("treats Drive progressive MP4 URLs as direct playback", () => {
    expect(isHlsPlaylistUrl("https://drive.example.edu/api/service/file?path=a%2Fclip.mp4&token=t&web=1")).toBe(false);
  });

  it("returns false for unparseable input", () => {
    expect(isHlsPlaylistUrl("http://[bad")).toBe(false);
  });
});

describe("bufferedSpans", () => {
  it("converts buffered time ranges to track percentages", () => {
    expect(bufferedSpans(ranges([[0, 10], [50, 75]]), 100)).toEqual([
      { startPct: 0, endPct: 10 },
      { startPct: 50, endPct: 75 }
    ]);
  });

  it("clamps to the track and drops empty ranges", () => {
    expect(bufferedSpans(ranges([[-1, 0], [90, 120]]), 100)).toEqual([{ startPct: 90, endPct: 100 }]);
  });

  it("returns nothing until the duration is known", () => {
    expect(bufferedSpans(ranges([[0, 10]]), 0)).toEqual([]);
    expect(bufferedSpans(ranges([[0, 10]]), Number.NaN)).toEqual([]);
  });
});

describe("sameBufferedSpans", () => {
  it("ignores sub-pixel changes so the track does not re-render every tick", () => {
    expect(sameBufferedSpans([{ startPct: 0, endPct: 10 }], [{ startPct: 0, endPct: 10.05 }])).toBe(true);
    expect(sameBufferedSpans([{ startPct: 0, endPct: 10 }], [{ startPct: 0, endPct: 12 }])).toBe(false);
    expect(sameBufferedSpans([], [{ startPct: 0, endPct: 1 }])).toBe(false);
  });
});
