/** Background blur performance guard and segmentation-failure tracking (pure). */

/** Budget per frame for segmentation + compositing at 30 fps (leaves room for the encoder). */
export const BLUR_FRAME_BUDGET_MS = 28;
const PERF_WINDOW_FRAMES = 30;
/** Step back up only when comfortably under budget (a reduced level costs about half). */
const STEP_UP_FRACTION = 0.6;
/** ...for this many consecutive windows (~10 s at 30 fps). */
export const STEP_UP_WINDOWS = 10;
export const SEGMENT_MAX_WIDTH = 640;
export const SEGMENT_MAX_HEIGHT = 360;

/** 0 = full, 1 = segment every other frame (reuse the last mask), 2 = also segment at ≤640×360. */
export type BlurPerfState = { level: 0 | 1 | 2; totalMs: number; frames: number; notified: boolean; goodWindows: number };
export const INITIAL_BLUR_PERF: BlurPerfState = { level: 0, totalMs: 0, frames: 0, notified: false, goodWindows: 0 };

/**
 * Feeds one frame's processing time. Every 30 frames, if the window's average is over budget,
 * steps down one level (and measures afresh). After 10 windows in a row comfortably under budget
 * it steps back up one level. A single slow frame never trips it. `notify` is true exactly once,
 * on the first step down.
 */
export function nextBlurPerf(state: BlurPerfState, durationMs: number): { state: BlurPerfState; notify: boolean } {
  const totalMs = state.totalMs + durationMs;
  const frames = state.frames + 1;
  if (frames < PERF_WINDOW_FRAMES) return { state: { ...state, totalMs, frames }, notify: false };
  const average = totalMs / frames;
  const fresh = { totalMs: 0, frames: 0 };
  if (average > BLUR_FRAME_BUDGET_MS) {
    if (state.level === 2) return { state: { ...state, ...fresh, goodWindows: 0 }, notify: false };
    const level = (state.level + 1) as 1 | 2;
    return { state: { level, ...fresh, notified: true, goodWindows: 0 }, notify: !state.notified };
  }
  if (state.level > 0 && average < BLUR_FRAME_BUDGET_MS * STEP_UP_FRACTION) {
    const goodWindows = state.goodWindows + 1;
    if (goodWindows >= STEP_UP_WINDOWS) {
      return { state: { ...state, ...fresh, level: (state.level - 1) as 0 | 1, goodWindows: 0 }, notify: false };
    }
    return { state: { ...state, ...fresh, goodWindows }, notify: false };
  }
  return { state: { ...state, ...fresh, goodWindows: 0 }, notify: false };
}

export function shouldSegmentFrame(level: BlurPerfState["level"], frameIndex: number) {
  return level === 0 || frameIndex % 2 === 0;
}

/** After this many failed or empty segmentations in a row the model is treated as broken. */
export const SEGMENT_FAILURE_LIMIT = 15;

export type SegmentHealth = { failures: number };

/**
 * One segmentation result: ok resets the streak; a failure (throw or empty mask) extends it.
 * `broken` is true exactly when the streak reaches the limit: drop the stale mask (whole-frame
 * blur, never an out-of-date cutout) and rebuild the segmenter.
 */
export function nextSegmentHealth(state: SegmentHealth, ok: boolean): { state: SegmentHealth; broken: boolean } {
  if (ok) return { state: state.failures === 0 ? state : { failures: 0 }, broken: false };
  const failures = state.failures + 1;
  return { state: { failures: failures >= SEGMENT_FAILURE_LIMIT ? 0 : failures }, broken: failures >= SEGMENT_FAILURE_LIMIT };
}
