/**
 * Per-device Meetings preferences (localStorage, one key). Voice isolation and device choices
 * have their own keys. Mic/camera on/off is never stored: both start off at pre-join.
 */

export const MEET_SETTINGS_KEY = "infocus.meet.settings.v1";

export type BackgroundMode = "off" | "slight" | "blur";
export type SendQuality = "auto" | "720p" | "360p";
export type ReceiveQuality = "auto" | "saver";

export type MeetSettings = {
  background: BackgroundMode;
  /** Mirror my own video (self view only; others always see it unmirrored). */
  mirror: boolean;
  sendQuality: SendQuality;
  receiveQuality: ReceiveQuality;
  /** Soft chimes when someone joins or leaves. */
  chimes: boolean;
};

export const DEFAULT_MEET_SETTINGS: MeetSettings = {
  background: "off",
  mirror: true,
  sendQuality: "auto",
  receiveQuality: "auto",
  chimes: true
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** Never throws; anything unknown falls back to the default for that field. */
export function loadMeetSettings(storage: StorageLike | null = defaultStorage()): MeetSettings {
  try {
    const raw = storage?.getItem(MEET_SETTINGS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const d = DEFAULT_MEET_SETTINGS;
    return {
      background: pick(parsed.background, ["off", "slight", "blur"], d.background),
      mirror: bool(parsed.mirror, d.mirror),
      sendQuality: pick(parsed.sendQuality, ["auto", "720p", "360p"], d.sendQuality),
      receiveQuality: pick(parsed.receiveQuality, ["auto", "saver"], d.receiveQuality),
      chimes: bool(parsed.chimes, d.chimes)
    };
  } catch {
    return DEFAULT_MEET_SETTINGS;
  }
}

/** Returns the new settings; storage failures just mean it isn't remembered. */
export function saveMeetSettings(
  patch: Partial<MeetSettings>,
  storage: StorageLike | null = defaultStorage()
): MeetSettings {
  const next = { ...loadMeetSettings(storage), ...patch };
  try {
    storage?.setItem(MEET_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage.
  }
  return next;
}
