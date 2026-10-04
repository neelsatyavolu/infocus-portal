/**
 * Remembered microphone, camera and speaker for Meetings, per device (localStorage).
 * On/off state is deliberately not stored: mic and camera always start off at pre-join.
 */

export const DEVICE_PREFS_KEY = "infocus.meet.devices.v1";

export type DeviceKind = "mic" | "camera" | "speaker";
export type SavedDevice = { deviceId: string; label: string };
export type DevicePrefs = Partial<Record<DeviceKind, SavedDevice>>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type DeviceLike = Pick<MediaDeviceInfo, "deviceId" | "label">;

const KINDS: readonly DeviceKind[] = ["mic", "camera", "speaker"];

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isSavedDevice(value: unknown): value is SavedDevice {
  const v = value as Partial<SavedDevice> | null;
  return Boolean(v) && typeof v?.deviceId === "string" && typeof v?.label === "string";
}

/** Never throws; ignores anything malformed. */
export function loadDevicePrefs(storage: StorageLike | null = defaultStorage()): DevicePrefs {
  try {
    const raw = storage?.getItem(DEVICE_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      KINDS.filter((kind) => isSavedDevice(parsed?.[kind])).map((kind) => {
        const { deviceId, label } = parsed[kind] as SavedDevice;
        return [kind, { deviceId, label }];
      })
    );
  } catch {
    return {};
  }
}

/** Saves one choice, keeping the others. Never throws. */
export function saveDevicePref(kind: DeviceKind, device: DeviceLike, storage: StorageLike | null = defaultStorage()) {
  try {
    const next: DevicePrefs = { ...loadDevicePrefs(storage), [kind]: { deviceId: device.deviceId, label: device.label } };
    storage?.setItem(DEVICE_PREFS_KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: the choice just won't be remembered.
  }
}

/**
 * The current device for a saved choice: same id first, then the same label (browsers rotate
 * ids), else null (use the default). Labels are empty until permission is granted.
 */
export function matchSavedDevice<D extends DeviceLike>(saved: SavedDevice | undefined, devices: readonly D[]): D | null {
  if (!saved) return null;
  const byId = saved.deviceId ? devices.find((d) => d.deviceId === saved.deviceId) : undefined;
  if (byId) return byId;
  const label = saved.label.trim();
  if (!label) return null;
  return devices.find((d) => d.label.trim() === label) ?? null;
}

/** True once the list has real labels (permission granted), so label matching means something. */
export function hasLabels(devices: readonly DeviceLike[]) {
  return devices.some((d) => d.label.trim().length > 0);
}
