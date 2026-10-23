import { describe, expect, it } from "vitest";
import {
  TELEPROMPTER_MAX_SPEED,
  TELEPROMPTER_PLAYHEAD_TOP_PX,
  TELEPROMPTER_SPEED_STEP,
  advanceTeleprompterPosition,
  easeTowardPosition,
  followScrollStep,
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

  it("resumes at the prior speed when Space is pressed twice", () => {
    const paused = teleprompterArrowState({ paused: false, speed: 144 }, "space");
    expect(paused.paused).toBe(true);
    expect(teleprompterArrowState(paused, "space")).toEqual({ paused: false, speed: 144 });
  });

  it("restarts arrows from zero after a Space pause", () => {
    const paused = teleprompterArrowState({ paused: false, speed: 144 }, "space");
    expect(teleprompterArrowState(paused, "up")).toEqual({
      paused: false,
      speed: TELEPROMPTER_SPEED_STEP
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

describe("easeTowardPosition", () => {
  it("glides toward the target and lands on it without overshooting", () => {
    let position = 0;
    const trace: number[] = [];
    for (let frame = 0; frame < 200; frame += 1) {
      position = easeTowardPosition(position, 600, 16, 5000);
      trace.push(position);
    }
    expect(trace).toEqual([...trace].sort((left, right) => left - right));
    expect(Math.max(...trace)).toBeLessThanOrEqual(600);
    expect(trace.at(-1)).toBe(600);
  });

  it("stays inside the script", () => {
    expect(easeTowardPosition(100, -50, 2000, 5000)).toBe(0);
    expect(easeTowardPosition(4990, 9000, 2000, 5000)).toBe(5000);
  });

  it("doesn't move when it's already there", () => {
    expect(easeTowardPosition(300, 300, 16, 5000)).toBe(300);
  });
});

describe("followScrollStep", () => {
  /** Words arrive in bursts (3 words every 450 ms), each word 14 px further down the script. */
  function readAloud(seconds: number) {
    let state = { position: 0, velocity: 0 };
    let target = 0;
    const speeds: number[] = [];
    const gaps: number[] = [];
    for (let frame = 0; frame * 16 < seconds * 1000; frame += 1) {
      const now = frame * 16;
      if (now % 450 < 16) target += 3 * 14;
      state = followScrollStep(state, target, 16, 100_000);
      speeds.push(state.velocity);
      gaps.push(target - state.position);
    }
    return { speeds, gaps, state, target };
  }

  it("scrolls at a steady speed while words keep arriving in bursts", () => {
    const { speeds } = readAloud(12);
    const settled = speeds.slice(Math.round(4000 / 16));
    const average = settled.reduce((sum, speed) => sum + speed, 0) / settled.length;
    expect(average).toBeGreaterThan(80);
    // Never stops or lurches between bursts: within ±35% of the average speed.
    expect(Math.min(...settled)).toBeGreaterThan(average * 0.65);
    expect(Math.max(...settled)).toBeLessThan(average * 1.35);
  });

  it("keeps up: the line being read stays within about a line of the arrow", () => {
    const { gaps } = readAloud(12);
    expect(Math.max(...gaps.slice(Math.round(4000 / 16)))).toBeLessThan(140);
  });

  it("glides across the gap to the next announcement without stalling or lurching", () => {
    for (const gap of [250, 450, 700]) {
      let state = { position: 0, velocity: 0 };
      let target = 0;
      let previous = 0;
      let worstChange = 0;
      let slowest = Infinity;
      for (let frame = 0; frame * 16 < 14_000; frame += 1) {
        const now = frame * 16;
        if (now % 450 < 16) target += 3 * 14;
        // Reading on into the next announcement: its first line sits `gap` px further down.
        if (now >= 6000 && now - 16 < 6000) target += gap;
        state = followScrollStep(state, target, 16, 100_000);
        if (now > 4000) {
          worstChange = Math.max(worstChange, Math.abs(state.velocity - previous));
          slowest = Math.min(slowest, state.velocity);
        }
        previous = state.velocity;
      }
      // Speed never changes by more than 50 px/s in one frame, and never drops to a stall.
      expect(worstChange).toBeLessThan(50);
      expect(slowest).toBeGreaterThan(40);
    }
  });

  it("slows to a stop when the words stop, without passing the target", () => {
    let state = { position: 0, velocity: 120 };
    const trace: number[] = [];
    for (let frame = 0; frame < 300; frame += 1) {
      state = followScrollStep(state, 100, 16, 100_000);
      trace.push(state.position);
    }
    expect(Math.max(...trace)).toBeLessThanOrEqual(100);
    expect(trace).toEqual([...trace].sort((left, right) => left - right));
    expect(state.velocity).toBeLessThan(1);
    expect(trace.at(-1)).toBeGreaterThan(99);
  });

  it("glides quickly to a far target or back to an earlier one", () => {
    let state = { position: 0, velocity: 0 };
    for (let frame = 0; frame < 300; frame += 1) state = followScrollStep(state, 3000, 16, 100_000);
    expect(state.position).toBeGreaterThan(2990);
    for (let frame = 0; frame < 120; frame += 1) state = followScrollStep(state, 2500, 16, 100_000);
    expect(state.position).toBeLessThan(2510);
    expect(state.velocity).toBe(0);
  });

  it("stays inside the script", () => {
    expect(followScrollStep({ position: 10, velocity: 0 }, 9000, 2000, 500).position).toBeLessThanOrEqual(500);
    expect(followScrollStep({ position: 10, velocity: 0 }, -50, 2000, 500).position).toBe(0);
  });
});
