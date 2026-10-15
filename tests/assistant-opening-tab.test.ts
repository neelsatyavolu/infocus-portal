import { describe, expect, it } from "vitest";
import { openingTab } from "@/components/assistant/opening-tab";

const idle = {
  busy: false,
  hasOpenApproval: false,
  unread: 0,
  declinedUnread: 0,
  assistantNews: false,
  remembered: () => "assistant" as const
};

describe("openingTab", () => {
  it("stays on Assistant while a reply or an approval is pending, even with unread messages", () => {
    expect(openingTab({ ...idle, busy: true, unread: 3 })).toBe("assistant");
    expect(openingTab({ ...idle, hasOpenApproval: true, unread: 3 })).toBe("assistant");
  });

  it("opens on Messages for unread beyond what the reader turned away from", () => {
    expect(openingTab({ ...idle, unread: 2 })).toBe("messages");
    expect(openingTab({ ...idle, unread: 2, declinedUnread: 2, remembered: () => "assistant" })).toBe("assistant");
    expect(openingTab({ ...idle, unread: 3, declinedUnread: 2 })).toBe("messages");
  });

  it("prefers new unread messages over an assistant reply that landed while closed", () => {
    expect(openingTab({ ...idle, unread: 1, assistantNews: true })).toBe("messages");
  });

  it("goes to a waiting assistant reply before the remembered tab", () => {
    expect(openingTab({ ...idle, assistantNews: true, remembered: () => "messages" })).toBe("assistant");
  });

  it("falls back to the remembered tab, reading it only then", () => {
    let reads = 0;
    const remembered = () => {
      reads += 1;
      return "messages" as const;
    };
    expect(openingTab({ ...idle, unread: 1, remembered })).toBe("messages");
    expect(reads).toBe(0);
    expect(openingTab({ ...idle, remembered })).toBe("messages");
    expect(reads).toBe(1);
  });
});
