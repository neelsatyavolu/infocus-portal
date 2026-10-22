import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), profile: vi.fn(), access: vi.fn(),
  state: vi.fn(), start: vi.fn(), cancel: vi.fn(), redo: vi.fn(), fix: vi.fn(), pair: vi.fn(),
  unlink: vi.fn(), activate: vi.fn(), decide: vi.fn(), describe: vi.fn(), command: vi.fn(), settings: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.user, syncUserProfile: mocks.profile }));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformAccess: mocks.access,
  hasPlatformRole: (role: string | null, minimum: string) =>
    minimum === "ASSOCIATE_PRODUCER" && ["ASSOCIATE_PRODUCER", "EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"].includes(role ?? "")
}));
vi.mock("@/src/server/show-editor", async (original) => ({
  ...await original<typeof import("@/src/server/show-editor")>(),
  showEditState: mocks.state, startShowEdit: mocks.start, cancelShowEdit: mocks.cancel,
  redoShowEdit: mocks.redo, requestShowFix: mocks.fix, unlinkEditorDevice: mocks.unlink
}));
vi.mock("@/src/server/show-editor-link", () => ({
  activateEditorDevice: mocks.activate, decideEditorLink: mocks.decide, describeEditorLink: mocks.describe
}));
vi.mock("@/src/server/show-editor-commands", () => ({ queueEditorCommand: mocks.command }));
vi.mock("@/src/server/show-editor-settings", () => ({ saveEditorSettings: mocks.settings }));

vi.mock("@/src/server/show-editor-pairing", () => ({ createPairing: mocks.pair }));

import { GET, POST } from "@/app/api/show-roles/edits/route";
import { ShowEditError } from "@/src/server/show-editor";

function post(body: unknown) {
  return new Request("https://portal.example.edu/api/show-roles/edits", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
}

describe("show edits route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue("u1");
    mocks.profile.mockResolvedValue({ email: "producer@example.edu" });
    mocks.access.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
  });

  it("non-producer gets 403", async () => {
    mocks.access.mockResolvedValue({ role: null });
    expect((await GET(new Request("https://portal.example.edu/api/show-roles/edits?date=2026-10-21"))).status).toBe(403);
    expect((await POST(post({ action: "start", date: "2026-10-21", sourcePaths: ["Shows/a.mov"] }))).status).toBe(403);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("GET needs a valid date and returns the state", async () => {
    expect((await GET(new Request("https://portal.example.edu/api/show-roles/edits?date=tomorrow"))).status).toBe(400);
    mocks.state.mockResolvedValue({ job: null });
    const response = await GET(new Request("https://portal.example.edu/api/show-roles/edits?date=2026-10-21"));
    expect(await response.json()).toEqual({ data: { job: null } });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("start passes each file and its role through in order", async () => {
    mocks.start.mockResolvedValue({ id: "job1" });
    const sources = [{ path: "Shows/ISO/b.mov", role: "M" }, { path: "Shows/a.mov", role: "auto" }, { path: "Shows/c.mov", role: "ignore" }];
    await POST(post({ action: "start", date: "2026-10-21", sources }));
    expect(mocks.start).toHaveBeenCalledWith({ userId: "u1", showDate: "2026-10-21", sources });
  });

  it("start still takes a plain path list from an older page, as files on Auto", async () => {
    mocks.start.mockResolvedValue({ id: "job1" });
    await POST(post({ action: "start", date: "2026-10-21", sourcePaths: ["Shows/a.mov", "Shows/b.mov"] }));
    expect(mocks.start).toHaveBeenCalledWith({
      userId: "u1", showDate: "2026-10-21", sources: [{ path: "Shows/a.mov", role: "auto" }, { path: "Shows/b.mov", role: "auto" }]
    });
  });

  it("start takes 1–12 distinct recordings under Shows/ with known roles, and says what's wrong", async () => {
    const thirteen = Array.from({ length: 13 }, (_, index) => ({ path: `Shows/${index}.mov`, role: "auto" }));
    const cases: [unknown[], string | null][] = [
      [[], "Pick at least one recording."],
      [thirteen, "Pick at most 12 files."],
      [[{ path: "Package Storage/x.mov", role: "auto" }], "Pick recordings from the Shows folder."],
      [[{ path: "Shows/../secret.mov", role: "auto" }], "Pick recordings from the Shows folder."],
      [[{ path: "Shows/a.mov", role: "auto" }, { path: "Shows/a.mov", role: "M" }], "Pick each recording once."],
      [[{ path: "Shows/a.mov", role: "camera-4" }], null],
      [[{ path: "Shows/a.mov", role: "ignore" }], "Every file is set to Ignore. Use at least one."]
    ];
    for (const [sources, message] of cases) {
      const response = await POST(post({ action: "start", date: "2026-10-21", sources }));
      expect(response.status).toBe(400);
      if (message) expect((await response.json()).error.message).toBe(message);
    }
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("redo requires a note", async () => {
    expect((await POST(post({ action: "redo", id: "job1", note: "  " }))).status).toBe(400);
    mocks.redo.mockResolvedValue({ id: "job2" });
    await POST(post({ action: "redo", id: "job1", note: "Use the later take." }));
    expect(mocks.redo).toHaveBeenCalledWith({ userId: "u1", id: "job1", note: "Use the later take." });
  });

  it("fix requires text and passes remember through", async () => {
    expect((await POST(post({ action: "fix", id: "job1", text: "", remember: false }))).status).toBe(400);
    expect((await POST(post({ action: "fix", id: "job1", text: "x".repeat(1001), remember: false }))).status).toBe(400);
    mocks.fix.mockResolvedValue({ id: "job1" });
    await POST(post({ action: "fix", id: "job1", text: "At 1:12 the card is cut off.", remember: true }));
    expect(mocks.fix).toHaveBeenCalledWith({ userId: "u1", id: "job1", text: "At 1:12 the card is cut off.", remember: true });
  });

  it("cancel passes the id and refusals keep their status", async () => {
    mocks.cancel.mockRejectedValue(new ShowEditError("Only a waiting or running edit can be cancelled.", 409));
    const response = await POST(post({ action: "cancel", id: "job1" }));
    expect(response.status).toBe(409);
    expect(mocks.cancel).toHaveBeenCalledWith({ id: "job1" });
  });
  it("pair gets 403 for non-producers", async () => {
    mocks.access.mockResolvedValue({ role: null });
    expect((await POST(post({ action: "pair", backend: "claude" }))).status).toBe(403);
    expect(mocks.pair).not.toHaveBeenCalled();
  });

  it("pair takes a known backend and returns the code and command", async () => {
    expect((await POST(post({ action: "pair", backend: "gemini" }))).status).toBe(400);
    const pairing = { code: "ABCD-2345", expiresAt: "2026-10-20T22:10:00.000Z", command: "uvx --from git+https://example.org/editor infocus-editor connect codex --code ABCD-2345 --portal https://portal.example.edu" };
    mocks.pair.mockResolvedValue(pairing);
    const response = await POST(post({ action: "pair", backend: "codex" }));
    expect(await response.json()).toEqual({ data: pairing });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.pair).toHaveBeenCalledWith({ userId: "u1", backend: "codex", deviceId: undefined });
    await POST(post({ action: "pair", backend: "claude", deviceId: "team-mac" }));
    expect(mocks.pair).toHaveBeenLastCalledWith({ userId: "u1", backend: "claude", deviceId: "team-mac" });
  });
  it("link, activate, unlink, settings and command all get 403 for non-producers", async () => {
    mocks.access.mockResolvedValue({ role: null });
    for (const body of [
      { action: "link", userCode: "ABCD-2345" }, { action: "activate", deviceId: "d1" }, { action: "unlink", deviceId: "d1" },
      { action: "settings", autoStart: true }, { action: "command", deviceId: "d1", kind: "logs" }
    ]) {
      expect((await POST(post(body))).status).toBe(403);
    }
    expect((await GET(new Request("https://portal.example.edu/api/show-roles/edits?link=ABCD-2345"))).status).toBe(403);
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it("GET ?link= returns the waiting machine for the confirm screen", async () => {
    mocks.describe.mockResolvedValue({ userCode: "ABCD-2345", deviceName: "Studio MacBook Pro", expiresAt: "x" });
    const response = await GET(new Request("https://portal.example.edu/api/show-roles/edits?link=ABCD-2345"));
    expect(await response.json()).toEqual({ data: { link: { userCode: "ABCD-2345", deviceName: "Studio MacBook Pro", expiresAt: "x" } } });
    expect(mocks.describe).toHaveBeenCalledWith("ABCD-2345");
  });

  it("link approves by default and makes the machine active unless told not to", async () => {
    mocks.decide.mockResolvedValue({ linked: true });
    await POST(post({ action: "link", userCode: "ABCD-2345" }));
    expect(mocks.decide).toHaveBeenLastCalledWith({ userId: "u1", userCode: "ABCD-2345", approve: true, activate: true });
    await POST(post({ action: "link", userCode: "ABCD-2345", approve: true, activate: false }));
    expect(mocks.decide).toHaveBeenLastCalledWith({ userId: "u1", userCode: "ABCD-2345", approve: true, activate: false });
    await POST(post({ action: "link", userCode: "ABCD-2345", approve: false }));
    expect(mocks.decide).toHaveBeenLastCalledWith(expect.objectContaining({ approve: false }));
  });

  it("activate and unlink take a machine", async () => {
    mocks.activate.mockResolvedValue({ active: "d2" });
    mocks.unlink.mockResolvedValue({ revoked: "d1" });
    await POST(post({ action: "activate", deviceId: "d2" }));
    expect(mocks.activate).toHaveBeenCalledWith("d2");
    await POST(post({ action: "unlink", deviceId: "d1" }));
    expect(mocks.unlink).toHaveBeenCalledWith("d1");
    expect((await POST(post({ action: "unlink" }))).status).toBe(400);
  });

  it("settings are validated", async () => {
    mocks.settings.mockResolvedValue({});
    const bad = [
      { agentOrder: [] }, { agentOrder: ["claude", "claude"] }, { agentOrder: ["gemini"] },
      { targetVersion: "0.3.1" }, { targetVersion: "v0.3" }, { targetVersion: "latest" },
      { houseRules: "x".repeat(20_001) }, { autoStart: "yes" }
    ];
    for (const fields of bad) expect((await POST(post({ action: "settings", ...fields }))).status).toBe(400);
    expect(mocks.settings).not.toHaveBeenCalled();
    await POST(post({ action: "settings", autoStart: true, autoPublish: null, targetVersion: "v0.3.1", agentOrder: ["codex", "claude"], houseRules: "1. Rule" }));
    expect(mocks.settings).toHaveBeenLastCalledWith(
      { autoStart: true, autoPublish: null, targetVersion: "v0.3.1", agentOrder: ["codex", "claude"], houseRules: "1. Rule" }, "u1"
    );
    await POST(post({ action: "settings", targetVersion: null, houseRules: "   " }));
    expect(mocks.settings).toHaveBeenLastCalledWith({ targetVersion: null, houseRules: null }, "u1");
  });

  it("command queues a known command for a machine", async () => {
    mocks.command.mockResolvedValue({ id: "c1" });
    expect((await POST(post({ action: "command", deviceId: "d1", kind: "format-disk" }))).status).toBe(400);
    await POST(post({ action: "command", deviceId: "d1", kind: "repair" }));
    expect(mocks.command).toHaveBeenCalledWith({ userId: "u1", deviceId: "d1", kind: "repair" });
  });
});
