import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  hubChatMember: { findMany: vi.fn() },
  hubChatMessage: { groupBy: vi.fn() }
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/src/lib/platform-admin")>(),
  getPlatformRoleForEmail: vi.fn().mockResolvedValue(null)
}));
import { unreadHubChatCount } from "@/src/server/hub-chat";

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: "reader", name: "Reader", nickname: null, email: null });
  db.hubChatMessage.groupBy.mockImplementation(async ({ where }) =>
    where.OR.map(({ chatId }: { chatId: string }) => ({ chatId, _count: { _all: 1 } }))
  );
});

describe("Portal unread badge", () => {
  it("excludes former groups, empty groups and custom queue entries while retaining current chats", async () => {
    const group = { id: "row", groupTopic: "Topic", cycleNumber: 1, groupType: "", members: [{ userId: "reader" }] };
    db.hubChatMember.findMany.mockResolvedValue([
      { chatId: "direct", lastReadAt: null, chat: { kind: "DIRECT", packageRow: null } },
      { chatId: "current", lastReadAt: null, chat: { kind: "GROUP", packageRow: group } },
      { chatId: "former", lastReadAt: null, chat: { kind: "GROUP", packageRow: { ...group, members: [{ userId: "other" }] } } },
      { chatId: "empty", lastReadAt: null, chat: { kind: "GROUP", packageRow: { ...group, groupTopic: "", members: [] } } },
      { chatId: "custom", lastReadAt: null, chat: { kind: "GROUP", packageRow: { ...group, groupType: "CUSTOM_QUEUE" } } },
      { chatId: "deleted", lastReadAt: null, chat: { kind: "GROUP", packageRow: null } }
    ]);
    expect(await unreadHubChatCount("reader")).toBe(2);
  });

  it("does not query messages when no memberships remain visible", async () => {
    db.hubChatMember.findMany.mockResolvedValue([
      { chatId: "deleted", lastReadAt: null, chat: { kind: "GROUP", packageRow: null } }
    ]);
    expect(await unreadHubChatCount("reader")).toBe(0);
    expect(db.hubChatMessage.groupBy).not.toHaveBeenCalled();
  });
});
