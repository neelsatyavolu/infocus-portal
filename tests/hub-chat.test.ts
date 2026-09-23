import { describe, expect, it } from "vitest";
import {
  canStartDirectChat,
  directChatKey,
  formatGroupChatSubtitle,
  formatGroupChatTitle,
  groupChatParticipantIds,
  isHubChatGroup,
  sanitizeHubChatBody,
  sortHubInbox,
  unreadCountForChat,
  visibleChatGroups
} from "@/src/lib/hub-chat";

const groups = [
  {
    id: "mine",
    assignedProducerUserId: "ap-1",
    assignedExecutiveProducerUserId: "ep-1",
    category: "NEWS" as const,
    members: [{ userId: "ada" }, { userId: "lo" }]
  },
  {
    id: "other",
    assignedProducerUserId: "ap-2",
    assignedExecutiveProducerUserId: "ep-2",
    category: "FEATURE" as const,
    members: [{ userId: "sam" }]
  },
  {
    id: "ap-as-member",
    assignedProducerUserId: "ap-2",
    assignedExecutiveProducerUserId: "ep-2",
    category: "FEATURE" as const,
    members: [{ userId: "ap-1" }]
  }
];

describe("canStartDirectChat", () => {
  it("is producer-only", () => {
    expect(canStartDirectChat(null)).toBe(false);
    expect(canStartDirectChat("ASSOCIATE_PRODUCER")).toBe(true);
    expect(canStartDirectChat("EXECUTIVE_PRODUCER")).toBe(true);
    expect(canStartDirectChat("ADVISER")).toBe(true);
    expect(canStartDirectChat("SUPER_ADMIN")).toBe(true);
  });
});

describe("visibleChatGroups", () => {
  it("lets reporters see only packages they are on", () => {
    const visible = visibleChatGroups(groups, {
      platformRole: null,
      currentUserId: "ada",
      producerCategory: null
    });
    expect(visible.map((row) => row.id)).toEqual(["mine"]);
  });

  it("lets associates see assigned groups plus packages they are on", () => {
    const visible = visibleChatGroups(groups, {
      platformRole: "ASSOCIATE_PRODUCER",
      currentUserId: "ap-1",
      producerCategory: "NEWS"
    });
    expect(visible.map((row) => row.id)).toEqual(["mine", "ap-as-member"]);
  });

  it("lets executives see every filled group", () => {
    const visible = visibleChatGroups(groups, {
      platformRole: "EXECUTIVE_PRODUCER",
      currentUserId: "ep-1",
      producerCategory: null
    });
    expect(visible.map((row) => row.id)).toEqual(["mine", "other", "ap-as-member"]);
  });
});

describe("groupChatParticipantIds", () => {
  it("includes roster plus assigned producers", () => {
    expect(groupChatParticipantIds(groups[0]!).sort()).toEqual(["ada", "ap-1", "ep-1", "lo"]);
  });
});

describe("unreadCountForChat", () => {
  const messages = [
    { authorId: "ada", createdAt: new Date("2026-09-05T10:00:00.000Z") },
    { authorId: "ap-1", createdAt: new Date("2026-09-05T11:00:00.000Z") },
    { authorId: "lo", createdAt: new Date("2026-09-05T12:00:00.000Z") }
  ];

  it("counts other people's messages after lastReadAt", () => {
    expect(
      unreadCountForChat({
        userId: "ada",
        lastReadAt: new Date("2026-09-05T10:30:00.000Z"),
        messages
      })
    ).toBe(2);
  });

  it("does not count your own messages", () => {
    expect(
      unreadCountForChat({
        userId: "ap-1",
        lastReadAt: null,
        messages
      })
    ).toBe(2);
  });
});

describe("directChatKey", () => {
  it("is order-independent", () => {
    expect(directChatKey("a", "b")).toBe(directChatKey("b", "a"));
  });
});

describe("sanitizeHubChatBody", () => {
  it("trims and rejects empty", () => {
    expect(sanitizeHubChatBody("  hello  ")).toBe("hello");
    expect(() => sanitizeHubChatBody("   ")).toThrow("BAD_REQUEST");
  });
});

describe("isHubChatGroup", () => {
  it("skips custom publishing-queue packages", () => {
    expect(
      isHubChatGroup({
        groupTopic: "Gas Prices",
        members: [],
        cycleNumber: 0,
        groupType: ""
      })
    ).toBe(false);
    expect(
      isHubChatGroup({
        groupTopic: "Cold open",
        members: [{ userId: "ada" }],
        cycleNumber: 1,
        groupType: "CUSTOM_QUEUE"
      })
    ).toBe(false);
    expect(
      isHubChatGroup({
        groupTopic: "Flock Cameras",
        members: [{ userId: "ada" }],
        cycleNumber: 1,
        groupType: ""
      })
    ).toBe(true);
  });
});

describe("formatGroupChatTitle", () => {
  it("joins unique member names in A–Z order", () => {
    expect(formatGroupChatTitle(["Lo", "Ada", "Lo"])).toBe("Ada, Lo");
  });

  it("is empty when there are no names", () => {
    expect(formatGroupChatTitle(["", "  "])).toBe("");
  });
});

describe("formatGroupChatSubtitle", () => {
  it("uses the package topic, or cycle when untitled", () => {
    expect(formatGroupChatSubtitle("Gas Prices", 1)).toBe("Gas Prices");
    expect(formatGroupChatSubtitle("  ", 0)).toBe("Cycle 0");
  });
});

describe("sortHubInbox", () => {
  it("puts chats with recent messages first, then title", () => {
    const sorted = sortHubInbox([
      { title: "Zeta", updatedAt: null },
      { title: "Alpha", updatedAt: null },
      { title: "Lunch", updatedAt: "2026-09-05T12:00:00.000Z" },
      { title: "Older", updatedAt: "2026-09-04T12:00:00.000Z" }
    ]);
    expect(sorted.map((row) => row.title)).toEqual(["Lunch", "Older", "Alpha", "Zeta"]);
  });
});
