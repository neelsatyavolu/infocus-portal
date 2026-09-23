import { describe, expect, it, vi } from "vitest";
import { HUB_CHAT_THREAD_MAX } from "@/src/lib/hub-chat";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  hubChat: { findUnique: vi.fn() },
  hubChatMember: { createMany: vi.fn(), updateMany: vi.fn() },
  hubChatMessage: { findMany: vi.fn() }
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/platform-admin", () => ({ getPlatformRoleForEmail: vi.fn().mockResolvedValue(null) }));
import { getHubChatThread } from "@/src/server/hub-chat";

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
});
