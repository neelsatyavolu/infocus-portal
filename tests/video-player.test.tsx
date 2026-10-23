import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VideoPlayer } from "@/components/kit/video-player";
import { chapterAt, clampTime, playerKeyAction } from "@/src/lib/video-player";

const chapters = [
  { title: "Intro", start: 0 },
  { title: "Welcome", start: 12 },
  { title: "Sports", start: 90 }
];

describe("playerKeyAction", () => {
  it("maps YouTube's keys", () => {
    expect(playerKeyAction(" ")).toEqual({ kind: "toggle" });
    expect(playerKeyAction("K")).toEqual({ kind: "toggle" });
    expect(playerKeyAction("j")).toEqual({ kind: "seekBy", seconds: -10 });
    expect(playerKeyAction("ArrowRight")).toEqual({ kind: "seekBy", seconds: 5 });
    expect(playerKeyAction("ArrowDown")).toEqual({ kind: "volumeBy", delta: -0.1 });
    expect(playerKeyAction("m")).toEqual({ kind: "mute" });
    expect(playerKeyAction("f")).toEqual({ kind: "fullscreen" });
    expect(playerKeyAction("5")).toEqual({ kind: "seekToFraction", fraction: 0.5 });
  });

  it("lets other keys through", () => {
    expect(playerKeyAction("Tab")).toBeNull();
    expect(playerKeyAction("x")).toBeNull();
  });
});

describe("chapterAt", () => {
  it("finds the chapter playing at a time", () => {
    expect(chapterAt(chapters, 0)?.title).toBe("Intro");
    expect(chapterAt(chapters, 11.9)?.title).toBe("Intro");
    expect(chapterAt(chapters, 12)?.title).toBe("Welcome");
    expect(chapterAt(chapters, 500)?.title).toBe("Sports");
    expect(chapterAt([], 5)).toBeNull();
  });
});

describe("clampTime", () => {
  it("keeps a time inside the video", () => {
    expect(clampTime(-3, 60)).toBe(0);
    expect(clampTime(75, 60)).toBe(60);
    expect(clampTime(20, 60)).toBe(20);
    expect(clampTime(20, Number.NaN)).toBe(0);
  });
});

describe("VideoPlayer", () => {
  it("renders a native video without browser controls, plus its own labelled controls", () => {
    const markup = renderToStaticMarkup(<VideoPlayer src="https://example.edu/show.mp4" label="The edited show" chapters={chapters} />);
    expect(markup).toContain("<video");
    expect(markup).not.toMatch(/<video[^>]*\scontrols/);
    expect(markup).toContain('aria-label="The edited show"');
    expect(markup).toContain('aria-label="Play"');
    expect(markup).toContain('aria-label="Seek"');
    expect(markup).toContain('aria-label="Full screen"');
    expect(markup).toContain('aria-label="Playback speed"');
  });
});
