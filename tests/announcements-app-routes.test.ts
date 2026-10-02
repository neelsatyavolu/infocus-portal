import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  profile: vi.fn(),
  access: vi.fn(),
  slack: vi.fn(),
  submitted: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.user, syncUserProfile: mocks.profile }));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformAccess: mocks.access,
  hasPlatformRole: (role: string | null) => ["ASSOCIATE_PRODUCER", "EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"].includes(role ?? ""),
  isExecutiveProducer: (role: string | null) => role === "EXECUTIVE_PRODUCER" || role === "SUPER_ADMIN"
}));
vi.mock("@/src/server/slack-announcements", () => ({ loadSlackAnnouncements: mocks.slack }));
vi.mock("@/src/server/announcement-submissions", () => ({ fetchSubmittedAnnouncements: mocks.submitted }));

import { GET as getSlack } from "@/app/api/announcements/slack/route";
import { GET as getGrouped } from "@/app/api/announcements/submitted/grouped/route";

function entry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    timestamp: "2026-09-01T10:00:00.000Z",
    timestampIso: "2026-09-01T10:00:00.000Z",
    name: "Abby Example",
    email: "abby@example.edu",
    category: "",
    submitterKind: "PALY_STUDENT",
    runOn: "INFOCUS_ONLY",
    announcement: `  Announcement ${id}  `,
    startDate: "2026-09-01",
    startDateIso: "2026-09-01",
    endDate: "2026-09-02",
    endDateIso: "2026-09-02",
    mediaLink: "",
    moreInfo: "",
    source: "native",
    ...overrides
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue("user");
  mocks.profile.mockResolvedValue({ email: "producer@example.edu" });
  mocks.access.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
});

describe("Slack announcements feed", () => {
  it("needs a signed-in member and returns what the page shows", async () => {
    mocks.slack.mockResolvedValue({ configured: true, items: [{ id: "1", text: "Hi" }], error: null });
    expect(await (await getSlack()).json()).toEqual({ data: { configured: true, items: [{ id: "1", text: "Hi" }], error: null } });
    mocks.user.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await getSlack()).status).toBe(401);
  });
});

describe("grouped submitted announcements", () => {
  it("groups entries with the page's labels and copy text", async () => {
    mocks.submitted.mockResolvedValue({
      announcements: [entry("a", { isPermanent: true }), entry("b", { runOn: "SCHOOLOGY_ONLY" })],
      meta: { retrievedAt: "2026-09-01T12:00:00.000Z" }
    });
    const { data } = await (await getGrouped()).json();
    expect(data).toMatchObject({ canDelete: true, canInvite: false, total: 2 });
    expect(data.buckets.map((bucket: { id: string }) => bucket.id)).toEqual(["permanent", "schoology"]);
    expect(data.buckets[0]).toMatchObject({ title: "Permanent", defaultOpen: true, copyText: "Announcement a" });
    expect(data.buckets[0].entries[0]).toMatchObject({
      copyText: "Announcement a",
      destination: "InFocus only",
      submitterRole: "PALY Student",
      startDate: "2026-09-01"
    });
  });

  it("lets only executives invite and producers delete", async () => {
    mocks.submitted.mockResolvedValue({ announcements: [], meta: { retrievedAt: "" } });
    mocks.access.mockResolvedValue({ role: "EXECUTIVE_PRODUCER" });
    expect((await (await getGrouped()).json()).data).toMatchObject({ canDelete: true, canInvite: true });
    mocks.access.mockResolvedValue({ role: null });
    expect((await (await getGrouped()).json()).data).toMatchObject({ canDelete: false, canInvite: false });
  });
});
