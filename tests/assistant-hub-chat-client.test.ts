import { describe, expect, it } from "vitest";
import {
  chatKey,
  directChatFor,
  inboxRowLines,
  matchesQuery,
  mergeLiteInbox,
  type InboxChat,
  type InboxPayload
} from "@/components/assistant/hub-chat-client";

const me = { id: "me", name: "Sage" };

function chat(overrides: Partial<InboxChat>): InboxChat {
  return {
    id: "c1",
    kind: "GROUP",
    title: "Abby, Otto",
    subtitle: "Lunch prices",
    preview: null,
    updatedAt: null,
    unreadCount: 0,
    ...overrides
  };
}

function payload(overrides: Partial<InboxPayload>): InboxPayload {
  return { me, canStartDirect: true, unreadCount: 0, chats: [], members: [], ...overrides };
}

describe("inboxRowLines", () => {
  it("shows a group's members over its package and the latest message", () => {
    expect(inboxRowLines(chat({ preview: "See you at 3" }))).toEqual({
      primary: "Abby, Otto",
      secondary: "Lunch prices · See you at 3"
    });
  });

  it("shows just the package under a group nobody has written in", () => {
    expect(inboxRowLines(chat({ preview: null }))).toEqual({ primary: "Abby, Otto", secondary: "Lunch prices" });
    expect(inboxRowLines(chat({ preview: "", subtitle: "Cycle 2" }))).toEqual({
      primary: "Abby, Otto",
      secondary: "Cycle 2"
    });
  });

  it("shows a direct chat's person over the latest message, or Direct before any", () => {
    const direct = chat({ kind: "DIRECT", title: "Otto", subtitle: "Direct", preview: "Got it" });
    expect(inboxRowLines(direct)).toEqual({ primary: "Otto", secondary: "Got it" });
    expect(inboxRowLines({ ...direct, preview: null })).toEqual({ primary: "Otto", secondary: "Direct" });
  });
});

describe("matchesQuery", () => {
  it("matches any field, ignoring case and outer spaces", () => {
    expect(matchesQuery("  abby ", "Abby, Otto", "Lunch prices")).toBe(true);
    expect(matchesQuery("LUNCH", "Abby, Otto", "Lunch prices")).toBe(true);
    expect(matchesQuery("sage", "Abby, Otto", "Lunch prices")).toBe(false);
  });

  it("matches everything for an empty query", () => {
    expect(matchesQuery("   ", "Abby")).toBe(true);
  });
});

describe("chatKey and directChatFor", () => {
  it("keys by chat, then package row, then person", () => {
    expect(chatKey(chat({ id: "c9" }))).toBe("c9");
    expect(chatKey(chat({ id: null, packageRowId: "row-1" }))).toBe("row-1");
    expect(chatKey(directChatFor({ id: "u2", name: "Otto" }))).toBe("u2");
  });

  it("builds an unopened direct chat for a person", () => {
    expect(directChatFor({ id: "u2", name: "Otto" })).toMatchObject({
      id: null,
      kind: "DIRECT",
      title: "Otto",
      subtitle: "Direct",
      unreadCount: 0,
      peer: { id: "u2", name: "Otto" }
    });
  });
});

describe("mergeLiteInbox", () => {
  it("uses the lite payload as is when nothing was loaded before", () => {
    const lite = payload({ lite: true, chats: [chat({})] });
    expect(mergeLiteInbox(null, lite)).toBe(lite);
  });

  it("keeps never-opened groups and the roster from the last full load, newest first", () => {
    const previous = payload({
      chats: [
        chat({ id: null, packageRowId: "row-2", title: "Sage", subtitle: "Cycle 2" }),
        chat({ id: null, packageRowId: "row-3", title: "Abby", subtitle: "Bike lanes" })
      ],
      members: [
        { id: "u1", name: "Abby" },
        { id: "u2", name: "Otto" }
      ]
    });
    const lite = payload({
      lite: true,
      unreadCount: 2,
      chats: [
        chat({ id: "c-old", packageRowId: "row-1", updatedAt: "2026-10-14T10:00:00.000Z" }),
        // row-3's group was opened since the full load, so its placeholder goes.
        chat({ id: "c-new", packageRowId: "row-3", updatedAt: "2026-10-15T10:00:00.000Z", unreadCount: 2 }),
        chat({ id: "d1", kind: "DIRECT", title: "Otto", peer: { id: "u2", name: "Otto" }, updatedAt: "2026-10-13T10:00:00.000Z" })
      ],
      members: []
    });

    const merged = mergeLiteInbox(previous, lite);

    expect(merged.lite).toBeUndefined();
    expect(merged.unreadCount).toBe(2);
    expect(merged.chats.map(chatKey)).toEqual(["c-new", "c-old", "d1", "row-2"]);
    // Otto has a direct chat now, so only Abby is still offered under Start a chat.
    expect(merged.members).toEqual([{ id: "u1", name: "Abby" }]);
  });

  it("does not change either payload", () => {
    const previous = payload({ chats: [chat({ id: null, packageRowId: "row-2" })], members: [{ id: "u1", name: "Abby" }] });
    const lite = payload({ lite: true, chats: [chat({ id: "c1", updatedAt: "2026-10-15T10:00:00.000Z" })] });
    const before = structuredClone({ previous, lite });
    mergeLiteInbox(previous, lite);
    expect({ previous, lite }).toEqual(before);
  });
});
