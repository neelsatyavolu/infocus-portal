export const TELEPROMPTER_SPEED_STEP = 36;
export const TELEPROMPTER_MAX_SPEED = 640;
export const TELEPROMPTER_PLAYHEAD_TOP_PX = 128;

type TeleprompterPlaybackState = {
  paused: boolean;
  speed: number;
};

type TeleprompterArrow = "up" | "down" | "left" | "right" | "space";

/** Signed px/s. Positive scrolls forward, 0 is stopped, negative reverses. */
export function nudgeTeleprompterSpeed(speed: number, arrow: "up" | "down") {
  const delta = arrow === "up" ? TELEPROMPTER_SPEED_STEP : -TELEPROMPTER_SPEED_STEP;
  return Math.max(-TELEPROMPTER_MAX_SPEED, Math.min(TELEPROMPTER_MAX_SPEED, speed + delta));
}

export function teleprompterArrowState(
  state: TeleprompterPlaybackState,
  arrow: TeleprompterArrow
): TeleprompterPlaybackState {
  // Keep speed while paused so a second Space resumes; arrows below restart from 0.
  if (arrow === "space") {
    return { paused: !state.paused, speed: state.speed };
  }

  const speed = state.paused ? 0 : state.speed;
  if (arrow === "up" || arrow === "down") {
    return {
      paused: false,
      speed: nudgeTeleprompterSpeed(speed, arrow)
    };
  }

  return {
    paused: false,
    speed: arrow === "left" ? (speed === 0 ? 0 : -Math.abs(speed)) : Math.abs(speed)
  };
}

export function advanceTeleprompterPosition(
  current: number,
  speedPxPerSec: number,
  deltaMs: number,
  maxPosition: number
) {
  const next = current + speedPxPerSec * (deltaMs / 1000);
  if (next < 0) {
    return 0;
  }
  if (next > maxPosition) {
    return maxPosition;
  }
  return next;
}

export function teleprompterMaxPosition(contentHeight: number) {
  return Math.max(0, contentHeight);
}

export function teleprompterContentTransform(position: number) {
  return `translate3d(0, ${TELEPROMPTER_PLAYHEAD_TOP_PX - position}px, 0)`;
}

/** Always the section top — including when that section is already active. */
export function teleprompterSectionJumpPosition(sectionTop: number) {
  return Math.max(0, sectionTop);
}

export function sectionIdAtPosition(sections: Array<{ id: string; top: number }>, position: number) {
  const entries = [...sections].sort((left, right) => left.top - right.top);
  let nextId = entries[0]?.id ?? "";
  for (const entry of entries) {
    if (entry.top <= position + 12) {
      nextId = entry.id;
    }
  }
  return nextId;
}

/** How quickly follow-along closes the gap to its target: about 63% of the way every 350 ms. */
const FOLLOW_EASE_MS = 350;

/** Follow-along: glide toward the target line without overshooting, however text arrives. */
export function easeTowardPosition(current: number, target: number, deltaMs: number, maxPosition: number) {
  const goal = Math.min(Math.max(0, target), maxPosition);
  const next = current + (goal - current) * (1 - Math.exp(-deltaMs / FOLLOW_EASE_MS));
  return Math.abs(goal - next) < 0.5 ? goal : next;
}

/** Follow-along keeps a speed that closes the gap to the target over about this long… */
const FOLLOW_TRACK_MS = 800;
/** …and changes that speed gradually, so words arriving in bursts still read as one scroll. */
const FOLLOW_ACCEL_MS = 300;
/** Farther than this (a re-find, a click on a word), or any distance back: glide there instead. */
const FOLLOW_JUMP_PX = 360;
const FOLLOW_MAX_SPEED = 1200;

export type FollowScrollState = { position: number; velocity: number };

/**
 * One frame of follow-along scrolling. Holds a scroll speed that keeps pace with the reading
 * (the target moves a few px per word), slows smoothly to a stop when the words stop, and
 * never passes the target.
 */
export function followScrollStep(state: FollowScrollState, target: number, deltaMs: number, maxPosition: number): FollowScrollState {
  const goal = Math.min(Math.max(0, target), maxPosition);
  const gap = goal - state.position;
  if (gap < -1 || gap > FOLLOW_JUMP_PX) {
    return { position: easeTowardPosition(state.position, goal, deltaMs, maxPosition), velocity: 0 };
  }
  const wanted = Math.min(FOLLOW_MAX_SPEED, Math.max(0, gap) / (FOLLOW_TRACK_MS / 1000));
  const velocity = state.velocity + (wanted - state.velocity) * (1 - Math.exp(-deltaMs / FOLLOW_ACCEL_MS));
  const position = Math.max(0, Math.min(goal, state.position + (velocity * deltaMs) / 1000));
  return { position, velocity: position >= goal ? Math.min(velocity, wanted) : velocity };
}
