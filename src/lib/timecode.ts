export const DEFAULT_REVIEW_FPS = 30;

export function formatTimecode(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  return [hours, minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":");
}

export function frameNumberFromSeconds(totalSeconds: number, fps = DEFAULT_REVIEW_FPS) {
  if (!Number.isFinite(totalSeconds) || !Number.isFinite(fps) || fps <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(totalSeconds * fps));
}

export function timeSecondsFromFrameNumber(frameNumber: number, fps = DEFAULT_REVIEW_FPS) {
  if (!Number.isFinite(frameNumber) || !Number.isFinite(fps) || fps <= 0) {
    return 0;
  }

  return Math.max(0, frameNumber / fps);
}

export function formatFrameAccurateTimecode(
  totalSeconds: number,
  frameNumber?: number | null,
  fps = DEFAULT_REVIEW_FPS
) {
  const effectiveFps = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_REVIEW_FPS;
  const totalFrames =
    frameNumber !== null && frameNumber !== undefined ? Math.max(0, Math.floor(frameNumber)) : frameNumberFromSeconds(totalSeconds, effectiveFps);

  const wholeSeconds = Math.floor(totalFrames / effectiveFps);
  const frames = totalFrames % effectiveFps;
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;

  return [hours, minutes, seconds, frames].map((value) => String(value).padStart(2, "0")).join(":");
}

export function parseFrameAccurateTimecode(value: string, fps = DEFAULT_REVIEW_FPS) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(":").map((part) => part.trim());
  if (parts.length === 4) {
    const [hours, minutes, seconds, frames] = parts.map((part) => Number.parseInt(part, 10));
    if ([hours, minutes, seconds, frames].some((part) => Number.isNaN(part))) {
      return null;
    }

    const frameNumber =
      ((Math.max(0, hours) * 60 * 60 + Math.max(0, minutes) * 60 + Math.max(0, seconds)) * fps) + Math.max(0, frames);

    return {
      frameNumber,
      timeSeconds: timeSecondsFromFrameNumber(frameNumber, fps)
    };
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts.map((part) => Number.parseInt(part, 10));
    if ([hours, minutes, seconds].some((part) => Number.isNaN(part))) {
      return null;
    }

    const timeSeconds = Math.max(0, hours) * 60 * 60 + Math.max(0, minutes) * 60 + Math.max(0, seconds);
    return {
      frameNumber: frameNumberFromSeconds(timeSeconds, fps),
      timeSeconds
    };
  }

  return null;
}
