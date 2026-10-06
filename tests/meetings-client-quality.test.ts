import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEET_SETTINGS,
  MEET_SETTINGS_KEY,
  loadMeetSettings,
  saveMeetSettings
} from "@/src/lib/meetings/client/meet-settings";
import { MIC_ENCODINGS, SCREEN_ENCODINGS, cameraEncodings, estimateGbPerHour, ridForTileHeight } from "@/src/lib/meetings/client/quality";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

const byRid = (encodings: RTCRtpEncodingParameters[]) => Object.fromEntries(encodings.map((e) => [e.rid, e]));

describe("meet settings", () => {
  it("defaults, saves a patch and keeps the rest", () => {
    const storage = memoryStorage();
    expect(loadMeetSettings(storage)).toEqual(DEFAULT_MEET_SETTINGS);
    saveMeetSettings({ background: "blur", receiveQuality: "saver" }, storage);
    saveMeetSettings({ mirror: false }, storage);
    expect(loadMeetSettings(storage)).toEqual({ ...DEFAULT_MEET_SETTINGS, background: "blur", receiveQuality: "saver", mirror: false });
  });

  it("ignores bad values and broken storage", () => {
    const bad = memoryStorage({ [MEET_SETTINGS_KEY]: '{"background":"neon","mirror":"yes","sendQuality":"4k","chimes":false}' });
    expect(loadMeetSettings(bad)).toEqual({ ...DEFAULT_MEET_SETTINGS, chimes: false });
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(loadMeetSettings(broken)).toEqual(DEFAULT_MEET_SETTINGS);
    expect(saveMeetSettings({ chimes: false }, broken).chimes).toBe(false);
    expect(loadMeetSettings(memoryStorage({ [MEET_SETTINGS_KEY]: "{oops" }))).toEqual(DEFAULT_MEET_SETTINGS);
  });
});

describe("cameraEncodings", () => {
  it("auto: 1080p top layer at 1.8 Mbps with h/2 and q/4", () => {
    const e = byRid(cameraEncodings("auto", 1080));
    expect(e.f).toMatchObject({ scaleResolutionDownBy: 1, maxBitrate: 1_800_000, maxFramerate: 30 });
    expect(e.h).toMatchObject({ scaleResolutionDownBy: 2, maxBitrate: 500_000 });
    expect(e.q).toMatchObject({ scaleResolutionDownBy: 4, maxBitrate: 150_000 });
  });

  it("720p caps the top layer at 720 lines and 1.2 Mbps", () => {
    const e = byRid(cameraEncodings("720p", 1080));
    expect(e.f).toMatchObject({ scaleResolutionDownBy: 1.5, maxBitrate: 1_200_000 });
    expect(byRid(cameraEncodings("720p", 720)).f.scaleResolutionDownBy).toBe(1);
  });

  it("360p keeps every layer at or under 360 lines and ~300 kbps on top", () => {
    const e = byRid(cameraEncodings("360p", 1080));
    expect(e.f).toMatchObject({ scaleResolutionDownBy: 3, maxBitrate: 300_000 });
    expect(Object.keys(e).sort()).toEqual(["f", "h", "q"]);
  });

  it("never upscales a small camera", () => {
    expect(byRid(cameraEncodings("auto", 480)).f.scaleResolutionDownBy).toBe(1);
  });

  it("has the screen and mic presets", () => {
    expect(SCREEN_ENCODINGS).toEqual([{ maxBitrate: 1_500_000, maxFramerate: 15 }]);
    expect(MIC_ENCODINGS).toEqual([{ maxBitrate: 64_000, priority: "high", networkPriority: "high" }]);
  });
});

describe("ridForTileHeight", () => {
  it("pulls by on-screen size", () => {
    expect(ridForTileHeight(200, "auto", "grid")).toBe("q");
    expect(ridForTileHeight(500, "auto", "grid")).toBe("h");
    expect(ridForTileHeight(800, "auto", "main")).toBe("f");
  });

  it("data saver caps at h, and grid tiles at q", () => {
    expect(ridForTileHeight(900, "saver", "main")).toBe("h");
    expect(ridForTileHeight(200, "saver", "main")).toBe("q");
    expect(ridForTileHeight(500, "saver", "grid")).toBe("q");
    expect(ridForTileHeight(900, "saver", "strip")).toBe("q");
  });
});

describe("estimateGbPerHour", () => {
  it("is a rough figure that drops with data saver", () => {
    const auto = estimateGbPerHour(4, "auto");
    const saver = estimateGbPerHour(4, "saver");
    expect(auto).toBeGreaterThan(0);
    expect(saver).toBeLessThan(auto);
    // 6 people already pull the smallest layer in a grid.
    expect(estimateGbPerHour(6, "auto")).toBe(2.9);
    expect(estimateGbPerHour(1, "auto")).toBe(estimateGbPerHour(2, "auto"));
  });
});
