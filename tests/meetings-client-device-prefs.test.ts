import { describe, expect, it } from "vitest";
import {
  DEVICE_PREFS_KEY,
  hasLabels,
  loadDevicePrefs,
  matchSavedDevice,
  saveDevicePref
} from "@/src/lib/meetings/client/device-prefs";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value)
  };
}

const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  }
};

const devices = [
  { deviceId: "a1", label: "MacBook Pro Microphone" },
  { deviceId: "b2", label: "Studio Mic (USB)" }
];

describe("device prefs storage", () => {
  it("saves each kind and keeps the others", () => {
    const storage = memoryStorage();
    saveDevicePref("mic", devices[1], storage);
    saveDevicePref("speaker", { deviceId: "s1", label: "Headphones" }, storage);
    expect(loadDevicePrefs(storage)).toEqual({
      mic: { deviceId: "b2", label: "Studio Mic (USB)" },
      speaker: { deviceId: "s1", label: "Headphones" }
    });
    expect(JSON.parse(storage.getItem(DEVICE_PREFS_KEY) ?? "{}")).not.toHaveProperty("camera");
  });

  it("never throws and ignores malformed data", () => {
    expect(loadDevicePrefs(broken)).toEqual({});
    expect(() => saveDevicePref("mic", devices[0], broken)).not.toThrow();
    expect(loadDevicePrefs(memoryStorage({ [DEVICE_PREFS_KEY]: "{not json" }))).toEqual({});
    expect(loadDevicePrefs(memoryStorage({ [DEVICE_PREFS_KEY]: '{"mic":{"deviceId":3},"camera":{"deviceId":"c","label":"Cam"}}' }))).toEqual({
      camera: { deviceId: "c", label: "Cam" }
    });
    expect(loadDevicePrefs(null)).toEqual({});
  });
});

describe("matchSavedDevice", () => {
  it("matches by id first", () => {
    expect(matchSavedDevice({ deviceId: "b2", label: "Old name" }, devices)).toBe(devices[1]);
  });

  it("falls back to the label when the id rotated", () => {
    expect(matchSavedDevice({ deviceId: "zz", label: "Studio Mic (USB)" }, devices)).toBe(devices[1]);
  });

  it("returns null (use the default) when nothing matches or nothing is saved", () => {
    expect(matchSavedDevice({ deviceId: "zz", label: "Gone" }, devices)).toBeNull();
    expect(matchSavedDevice({ deviceId: "zz", label: "" }, devices)).toBeNull();
    expect(matchSavedDevice(undefined, devices)).toBeNull();
  });

  it("knows when labels are available", () => {
    expect(hasLabels([{ deviceId: "x", label: "" }])).toBe(false);
    expect(hasLabels(devices)).toBe(true);
  });
});
