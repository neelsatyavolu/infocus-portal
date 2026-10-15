import { describe, expect, it } from "vitest";
import { callStatusItems, limitStatusItems, phoneStatusItems, statusAnnouncement } from "@/components/meetings/call/call-status-model";
import { startsChatGroup } from "@/components/meetings/call/chat-groups";
import { callToastOffsets } from "@/components/meetings/call/call-toast-offset";
import { CALL_SHORTCUTS, matchCallShortcut } from "@/components/meetings/call/shortcut";

const quiet = {
  reconnecting: false,
  waitingCount: 0,
  selfHand: undefined,
  handsTotal: 0,
  presenting: false,
  notesOn: false,
  quality: "good" as const
};

const kinds = (items: ReturnType<typeof callStatusItems>) => items.map((item) => item.kind);

describe("callStatusItems", () => {
  it("shows only the connection when nothing is happening, icon-only when it's good", () => {
    const items = callStatusItems(quiet);
    expect(kinds(items)).toEqual(["quality"]);
    expect(items[0]).toMatchObject({ label: "Good", quiet: true, signal: "good" });
  });

  it("words a connection that isn't good, and keeps the word on wide screens", () => {
    const [fair] = callStatusItems({ ...quiet, quality: "fair" });
    expect(fair).toMatchObject({ tone: "warning", label: "Unstable", quiet: false });
    const [poor] = callStatusItems({ ...quiet, quality: "poor" });
    expect(poor).toMatchObject({ tone: "danger", label: "Poor" });
  });

  it("orders statuses by priority with the connection last", () => {
    const items = callStatusItems({
      reconnecting: true,
      waitingCount: 2,
      selfHand: undefined,
      handsTotal: 3,
      presenting: true,
      notesOn: true,
      quality: "unknown"
    });
    expect(kinds(items)).toEqual(["reconnecting", "waiting", "hands", "presenting", "notes", "quality"]);
  });

  it("gives phones short labels and opens People from waiting and hands", () => {
    const items = callStatusItems({ ...quiet, waitingCount: 1, handsTotal: 2 });
    const waiting = items.find((item) => item.kind === "waiting");
    const hands = items.find((item) => item.kind === "hands");
    expect(waiting).toMatchObject({ label: "1 waiting", short: "1", opensPeople: true, description: "1 person waiting to join." });
    expect(hands).toMatchObject({ label: "2 hands", short: "2", opensPeople: true });
  });

  it("shows your own place in line instead of the hand count", () => {
    const [hand] = callStatusItems({ ...quiet, selfHand: 2, handsTotal: 3 });
    expect(hand).toMatchObject({ kind: "hands", tone: "warning", label: "Your hand · 2nd of 3", short: "2nd" });
  });
});

describe("limitStatusItems", () => {
  const all = callStatusItems({
    reconnecting: true,
    waitingCount: 2,
    selfHand: undefined,
    handsTotal: 3,
    presenting: true,
    notesOn: true,
    quality: "poor"
  });

  it("keeps the first statuses in order and never drops notes or the connection", () => {
    expect(kinds(limitStatusItems(all, 2))).toEqual(["reconnecting", "waiting", "notes", "quality"]);
    expect(kinds(limitStatusItems(all, 1))).toEqual(["reconnecting", "notes", "quality"]);
    expect(kinds(limitStatusItems(all, 0))).toEqual(["notes", "quality"]);
  });

  it("returns everything when there is room", () => {
    expect(limitStatusItems(all, 10)).toEqual(all);
  });
});

describe("phoneStatusItems", () => {
  const all = callStatusItems({
    reconnecting: true,
    waitingCount: 2,
    selfHand: undefined,
    handsTotal: 3,
    presenting: true,
    notesOn: true,
    quality: "poor"
  });

  it("leaves Reconnecting to the stage notice, so it doesn't take a bar slot", () => {
    expect(kinds(phoneStatusItems(all, 2))).toEqual(["waiting", "hands", "notes", "quality"]);
    expect(kinds(phoneStatusItems(all, 1))).toEqual(["waiting", "notes", "quality"]);
  });

  it("is limitStatusItems when the connection is fine", () => {
    const steady = callStatusItems({ ...quiet, waitingCount: 1, notesOn: true });
    expect(phoneStatusItems(steady, 2)).toEqual(limitStatusItems(steady, 2));
  });
});

describe("statusAnnouncement", () => {
  it("reads out only the statuses worth announcing", () => {
    const items = callStatusItems({ ...quiet, reconnecting: true, waitingCount: 1, presenting: true, notesOn: true });
    expect(statusAnnouncement(items)).toBe("Reconnecting to the call. 1 person waiting to join.");
  });
});

describe("startsChatGroup", () => {
  const at = Date.parse("2026-10-14T21:15:05-07:00");

  it("starts a group for the first message and for a new sender", () => {
    expect(startsChatGroup(undefined, { uid: "a", own: false, at })).toBe(true);
    expect(startsChatGroup({ uid: "a", own: false, at }, { uid: "b", own: false, at: at + 1_000 })).toBe(true);
    expect(startsChatGroup({ uid: "a", own: false, at }, { uid: "a", own: true, at: at + 1_000 })).toBe(true);
  });

  it("joins the same sender within the same Pacific minute", () => {
    expect(startsChatGroup({ uid: "a", own: false, at }, { uid: "a", own: false, at: at + 30_000 })).toBe(false);
  });

  it("starts a new group when the minute changes, even a second later", () => {
    const end = Date.parse("2026-10-14T21:15:59-07:00");
    expect(startsChatGroup({ uid: "a", own: false, at: end }, { uid: "a", own: false, at: end + 2_000 })).toBe(true);
    expect(startsChatGroup({ uid: "a", own: false, at }, { uid: "a", own: false, at: at + 60_000 })).toBe(true);
  });
});

describe("callToastOffsets", () => {
  it("lifts toasts above the bottom bar, beside the rail, and clear of an open panel", () => {
    expect(callToastOffsets("desktop", false)).toEqual({ bottom: "calc(88px + env(safe-area-inset-bottom))", right: "24px" });
    expect(callToastOffsets("desktop", true).right).toBe("384px");
    expect(callToastOffsets("phone", false).bottom).toBe("calc(80px + env(safe-area-inset-bottom))");
    expect(callToastOffsets("rail", false)).toEqual({ bottom: "16px", right: "calc(88px + env(safe-area-inset-right))" });
  });
});

describe("matchCallShortcut", () => {
  const key = (code: string, mods: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) => ({
    code,
    metaKey: Boolean(mods.meta),
    ctrlKey: Boolean(mods.ctrl),
    altKey: Boolean(mods.alt),
    shiftKey: Boolean(mods.shift)
  });

  it("binds exactly the combos the tooltips and legend show", () => {
    expect(CALL_SHORTCUTS).toEqual({ mic: "mod+d", camera: "mod+e", hand: "mod+alt+h", chat: "mod+alt+c" });
    expect(matchCallShortcut(key("KeyD", { meta: true }))).toBe("mic");
    expect(matchCallShortcut(key("KeyE", { ctrl: true }))).toBe("camera");
    expect(matchCallShortcut(key("KeyH", { meta: true, alt: true }))).toBe("hand");
    expect(matchCallShortcut(key("KeyC", { ctrl: true, alt: true }))).toBe("chat");
  });

  it("ignores other keys, missing or extra modifiers, and Shift", () => {
    expect(matchCallShortcut(key("KeyD"))).toBeNull();
    expect(matchCallShortcut(key("KeyD", { meta: true, alt: true }))).toBeNull();
    expect(matchCallShortcut(key("KeyH", { meta: true }))).toBeNull();
    expect(matchCallShortcut(key("KeyD", { meta: true, shift: true }))).toBeNull();
    expect(matchCallShortcut(key("KeyX", { meta: true }))).toBeNull();
  });
});
