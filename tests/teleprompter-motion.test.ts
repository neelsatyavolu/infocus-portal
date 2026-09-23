import { describe, expect, it } from "vitest";
import {
  TELEPROMPTER_MAX_SPEED,
  TELEPROMPTER_PLAYHEAD_TOP_PX,
  TELEPROMPTER_SPEED_STEP,
  advanceTeleprompterPosition,
  nudgeTeleprompterSpeed,
  teleprompterArrowState,
  sectionIdAtPosition,
  teleprompterContentTransform,
  teleprompterMaxPosition,
  teleprompterSectionJumpPosition
} from "@/src/lib/teleprompter-motion";

describe("nudgeTeleprompterSpeed", () => {
  it("slows forward motion, stops at 0, then reverses", () => {
    let speed = TELEPROMPTER_SPEED_STEP * 2;

    speed = nudgeTeleprompterSpeed(speed, "down");
    expect(speed).toBe(TELEPROMPTER_SPEED_STEP);

    speed = nudgeTeleprompterSpeed(speed, "down");
    expect(speed).toBe(0);

    speed = nudgeTeleprompterSpeed(speed, "down");
    expect(speed).toBe(-TELEPROMPTER_SPEED_STEP);

    speed = nudgeTeleprompterSpeed(speed, "down");
    expect(speed).toBe(-TELEPROMPTER_SPEED_STEP * 2);
  });

  it("from reverse, up slows, stops, then goes forward", () => {
    let speed = -TELEPROMPTER_SPEED_STEP * 2;

    speed = nudgeTeleprompterSpeed(speed, "up");
    expect(speed).toBe(-TELEPROMPTER_SPEED_STEP);

    speed = nudgeTeleprompterSpeed(speed, "up");
    expect(speed).toBe(0);

    speed = nudgeTeleprompterSpeed(speed, "up");
    expect(speed).toBe(TELEPROMPTER_SPEED_STEP);
  });

  it("caps at plus and minus max speed", () => {
    expect(TELEPROMPTER_MAX_SPEED).toBe(640);
    expect(nudgeTeleprompterSpeed(TELEPROMPTER_MAX_SPEED, "up")).toBe(TELEPROMPTER_MAX_SPEED);
    expect(nudgeTeleprompterSpeed(-TELEPROMPTER_MAX_SPEED, "down")).toBe(-TELEPROMPTER_MAX_SPEED);
  });
});

describe("teleprompterArrowState", () => {
  it("resumes from zero when an arrow is pressed after pausing", () => {
    expect(teleprompterArrowState({ paused: true, speed: 144 }, "up")).toEqual({
      paused: false,
      speed: TELEPROMPTER_SPEED_STEP
    });
    expect(teleprompterArrowState({ paused: true, speed: 144 }, "down")).toEqual({
      paused: false,
      speed: -TELEPROMPTER_SPEED_STEP
    });
  });

  it("resets speed when Space pauses playback", () => {
    expect(teleprompterArrowState({ paused: false, speed: 144 }, "space")).toEqual({
      paused: true,
      speed: 0
    });
  });
});

describe("advanceTeleprompterPosition", () => {
  it("advances by signed px/s using the frame delta", () => {
    expect(advanceTeleprompterPosition(100, 72, 250, 4000)).toBe(118);
  });

  it("keeps subpixel motion so scrolling does not quantize to whole pixels", () => {
    expect(advanceTeleprompterPosition(10, 72, 1000 / 60, 4000)).toBeCloseTo(11.2, 5);
  });

  it("clamps at 0 and max", () => {
    expect(advanceTeleprompterPosition(8, -72, 250, 4000)).toBe(0);
    expect(advanceTeleprompterPosition(3990, 72, 250, 4000)).toBe(4000);
  });
});

describe("teleprompterMaxPosition", () => {
  it("stops at the end of the script instead of scrolling into empty stage", () => {
    expect(teleprompterMaxPosition(2400)).toBe(2400);
    expect(teleprompterMaxPosition(0)).toBe(0);
  });
});

describe("teleprompterContentTransform", () => {
  it("uses a 3d translate so the compositor can scroll without React rerenders", () => {
    expect(teleprompterContentTransform(40)).toBe(`translate3d(0, ${TELEPROMPTER_PLAYHEAD_TOP_PX - 40}px, 0)`);
  });
});

describe("teleprompterSectionJumpPosition", () => {
  it("returns the section top even when that section is already active", () => {
    expect(teleprompterSectionJumpPosition(640)).toBe(640);
    expect(teleprompterSectionJumpPosition(0)).toBe(0);
  });
});

describe("sectionIdAtPosition", () => {
  const sections = [
    { id: "a1", top: 0 },
    { id: "a2", top: 400 },
    { id: "a3", top: 900 }
  ];

  it("stays on the current section until the next section top", () => {
    expect(sectionIdAtPosition(sections, 12)).toBe("a1");
    expect(sectionIdAtPosition(sections, 400)).toBe("a2");
    expect(sectionIdAtPosition(sections, 901)).toBe("a3");
  });
});
