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
  if (arrow === "space") {
    return {
      paused: !state.paused,
      speed: state.paused ? state.speed : 0
    };
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
