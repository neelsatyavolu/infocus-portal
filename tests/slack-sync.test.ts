import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  rateLimitBucket: { updateMany: vi.fn(), create: vi.fn() },
  packageProgressRow: { findMany: vi.fn() }
}));
const slack = vi.hoisted(() => ({ token: "xoxb-test" as string | null, publish: vi.fn(), announcements: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/slack-api", () => ({
  slackBotToken: () => slack.token,
  SLACK_PROOF_OF_CONTACT_CHANNEL_DEFAULT: "C0"
}));
vi.mock("@/src/server/slack-announcements", () => ({
  loadSlackAnnouncements: slack.announcements,
  loadSlackHistoryJoiningIfNeeded: vi.fn(async () => ({ ok: true, messages: [] }))
}));
vi.mock("@/src/server/proof-of-contact-slack", () => ({ publishProofOfContactToSlack: slack.publish }));

import { claimSlackSyncSlot, syncSlackOnStart } from "@/src/server/slack-sync";

beforeEach(() => {
  vi.clearAllMocks();
  slack.token = "xoxb-test";
  slack.announcements.mockResolvedValue({ items: [{}, {}] });
  slack.publish.mockResolvedValue({ ok: true });
  db.rateLimitBucket.updateMany.mockResolvedValue({ count: 1 });
});

describe("claimSlackSyncSlot", () => {
  it("claims an expired slot with a conditional update", async () => {
    await expect(claimSlackSyncSlot(new Date("2026-11-11T12:00:00Z"))).resolves.toBe(true);
    expect(db.rateLimitBucket.updateMany.mock.calls[0][0].where).toEqual({
      key: "slack-sync",
      resetAt: { lte: new Date("2026-11-11T12:00:00Z") }
    });
  });

  it("creates the row the first time and loses to a concurrent creator", async () => {
    db.rateLimitBucket.updateMany.mockResolvedValue({ count: 0 });
    db.rateLimitBucket.create.mockResolvedValueOnce({});
    await expect(claimSlackSyncSlot()).resolves.toBe(true);
    db.rateLimitBucket.create.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(claimSlackSyncSlot()).resolves.toBe(false);
  });
});

describe("syncSlackOnStart", () => {
  it("skips without touching Slack while another sync holds the slot", async () => {
    db.rateLimitBucket.updateMany.mockResolvedValue({ count: 0 });
    db.rateLimitBucket.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(syncSlackOnStart()).resolves.toMatchObject({ configured: true, skipped: true });
    expect(slack.announcements).not.toHaveBeenCalled();
  });

  it("posts at most five missing proof-of-contact packages per sync", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const rows = Array.from({ length: 9 }, (_, i) => ({
      id: `row${i}`,
      cycleNumber: 1,
      groupTopic: `Topic ${i}`,
      proofOfContacts: [{ updatedAt: old }],
      members: []
    }));
    db.packageProgressRow.findMany.mockImplementation(async (args: { where: { id?: { in: string[] } } }) =>
      args.where.id ? rows.filter((row) => args.where.id!.in.includes(row.id)) : rows
    );
    const result = await syncSlackOnStart();
    expect(slack.publish).toHaveBeenCalledTimes(5);
    expect(result).toEqual({ configured: true, proofPosted: 5, announcementCount: 2 });
  });
});
