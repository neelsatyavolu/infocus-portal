import { beforeEach, describe, expect, it, vi } from "vitest";
import { HUB_CHAT_THREAD_MAX } from "@/src/lib/hub-chat";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  hubChat: { findUnique: vi.fn() },
  hubChatMember: { createMany: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  hubChatMessage: { findMany: vi.fn(), groupBy: vi.fn() },
  packageProgressRow: { findMany: vi.fn() },
  $queryRaw: vi.fn()
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/src/lib/platform-admin")>(),
  getPlatformRoleForEmail: vi.fn().mockResolvedValue(null)
}));
import { getHubChatThread, listHubInbox } from "@/src/server/hub-chat";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Portal chat history", () => {
  it("returns the newest window in chronological order, including messages beyond the limit", async () => {
    const user = { id: "reader", name: "Reader", nickname: null, email: null };
    db.user.findUnique.mockResolvedValue(user);
    db.hubChat.findUnique.mockResolvedValue({
      id: "chat", kind: "DIRECT", packageRowId: null,
      members: [{ userId: user.id, user }]
    });
    const messages = Array.from({ length: HUB_CHAT_THREAD_MAX + 2 }, (_, index) => ({
      id: String(index), body: `Message ${index}`, authorId: user.id, author: user,
      createdAt: new Date(Date.UTC(2026, 8, 8, 0, 0, index))
    }));
    db.hubChatMessage.findMany.mockImplementation(async ({ orderBy, take }) => {
      const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
      const descending = orders.some((order: { createdAt?: string }) => order.createdAt === "desc");
      return (descending ? [...messages].reverse() : [...messages]).slice(0, take);
    });

    const thread = await getHubChatThread(user.id, "chat");
    expect(thread.messages.map((message) => message.id)).toEqual(messages.slice(2).map((message) => message.id));
  });

  const reader = { id: "reader", name: "Reader", nickname: null, email: null };
  const peer = { id: "peer", name: "Peer", nickname: null, email: null };
  const at = (second: number) => new Date(Date.UTC(2026, 8, 8, 0, 0, second));

  function mockDirectChat(lastReadAt: Date | null, newest: Date | null) {
    db.hubChat.findUnique.mockResolvedValue({
      id: "chat", kind: "DIRECT", packageRowId: null, packageRow: null,
      members: [
        { userId: reader.id, lastReadAt, user: reader },
        { userId: peer.id, lastReadAt: null, user: peer }
      ]
    });
    db.hubChatMessage.findMany.mockResolvedValue(
      newest ? [{ id: "m", body: "Hi", authorId: peer.id, author: peer, createdAt: newest }] : []
    );
  }

  it("polls without writes or a second chat read when nothing changed", async () => {
    mockDirectChat(at(10), at(5));
    const thread = await getHubChatThread(reader.id, "chat", reader);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.hubChatMember.createMany).not.toHaveBeenCalled();
    expect(db.hubChatMember.updateMany).not.toHaveBeenCalled();
    expect(db.hubChat.findUnique).toHaveBeenCalledTimes(1);
    expect(thread.chat).toEqual({
      id: "chat", kind: "DIRECT", title: "Peer", subtitle: "Direct", packageRowId: null,
      peer: { id: "peer", name: "Peer" }
    });
    expect(thread.me).toEqual({ id: "reader", name: "Reader" });
  });

  it("marks read when a message is newer than lastReadAt, or it was never read", async () => {
    mockDirectChat(at(1), at(5));
    await getHubChatThread(reader.id, "chat", reader);
    expect(db.hubChatMember.updateMany).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mockDirectChat(null, null);
    await getHubChatThread(reader.id, "chat", reader);
    expect(db.hubChatMember.updateMany).toHaveBeenCalledTimes(1);
  });

  it("adds missing group participants, then re-reads the chat as before", async () => {
    const row = {
      id: "row", cycleNumber: 1, groupTopic: "Topic", groupType: "", category: null,
      assignedProducerUserId: "ap", assignedExecutiveProducerUserId: null,
      members: [{ userId: reader.id, user: reader }]
    };
    db.hubChat.findUnique.mockResolvedValue({
      id: "chat", kind: "GROUP", packageRowId: "row", packageRow: row,
      members: [{ userId: reader.id, lastReadAt: at(10), user: reader }]
    });
    db.hubChatMessage.findMany.mockResolvedValue([]);
    await getHubChatThread(reader.id, "chat", reader);
    expect(db.hubChatMember.createMany).toHaveBeenCalledWith({
      data: [{ chatId: "chat", userId: "ap" }],
      skipDuplicates: true
    });
    expect(db.hubChat.findUnique).toHaveBeenCalledTimes(2);
    expect(db.hubChatMember.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("Portal inbox lite polls", () => {
  it("lists only joined chats, skips the class roster, and matches the full unread count", async () => {
    const reader = { id: "reader", name: "Reader", nickname: null, email: null };
    db.hubChatMember.findMany.mockResolvedValue([
      {
        lastReadAt: null,
        chat: { id: "chat", kind: "GROUP", packageRowId: "row", updatedAt: new Date(), members: [] }
      }
    ]);
    db.packageProgressRow.findMany.mockResolvedValue([
      {
        id: "row", cycleNumber: 1, groupTopic: "Topic", groupType: "", category: null,
        assignedProducerUserId: null, assignedExecutiveProducerUserId: null,
        members: [{ userId: reader.id, user: reader }]
      }
    ]);
    db.hubChatMessage.groupBy.mockResolvedValue([{ chatId: "chat", _count: { _all: 3 } }]);
    db.$queryRaw.mockResolvedValue([]);

    const inbox = await listHubInbox(reader.id, { knownUser: reader, lite: true });

    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.packageProgressRow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { members: { some: { userId: "reader" } } },
            { hubChats: { some: { members: { some: { userId: "reader" } } } } }
          ]
        }
      })
    );
    expect(inbox.lite).toBe(true);
    expect(inbox.members).toEqual([]);
    expect(inbox.unreadCount).toBe(3);
    expect(inbox.chats.map((chat) => chat.id)).toEqual(["chat"]);
  });
});
