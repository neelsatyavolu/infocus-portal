import { describe, expect, it } from "vitest";
import { MIC_TEST_MUTED_LABEL, micTestLabel, shouldMonitorMic } from "@/src/lib/meetings/client/mic-monitor";

describe("shouldMonitorMic", () => {
  it("always monitors in pre-join, muted or not", () => {
    expect(shouldMonitorMic({ screen: "prejoin", settingsOpen: false, audioOn: false })).toBe(true);
    expect(shouldMonitorMic({ screen: "prejoin", settingsOpen: false, audioOn: true })).toBe(true);
  });

  it("in the call: while settings are open (even muted) or while unmuted", () => {
    expect(shouldMonitorMic({ screen: "call", settingsOpen: true, audioOn: false })).toBe(true);
    expect(shouldMonitorMic({ screen: "call", settingsOpen: false, audioOn: true })).toBe(true);
  });

  it("releases the mic in the call when muted with settings closed", () => {
    expect(shouldMonitorMic({ screen: "call", settingsOpen: false, audioOn: false })).toBe(false);
    expect(shouldMonitorMic({ screen: "call", settingsOpen: false, audioOn: false, prewarm: false })).toBe(false);
  });

  it("opens the mic early while pre-warming an unmute", () => {
    expect(shouldMonitorMic({ screen: "call", settingsOpen: false, audioOn: false, prewarm: true })).toBe(true);
  });

  it("labels the muted mic test", () => {
    expect(micTestLabel(false)).toBe(MIC_TEST_MUTED_LABEL);
    expect(MIC_TEST_MUTED_LABEL).toBe("Mic test: speak to see the meter (you're muted, nobody hears you)");
  });
});
