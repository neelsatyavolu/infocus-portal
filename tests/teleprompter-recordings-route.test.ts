import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  docAccess: vi.fn(),
  enabled: vi.fn(),
  mint: vi.fn()
}));

vi.mock("@/src/server/teleprompter-access", () => ({
  requireTeleprompterActor: mocks.actor,
  requireTeleprompterDocAccess: mocks.docAccess
}));
vi.mock("@/src/lib/nas-storage", async (original) => ({
  ...(await original<typeof import("@/src/lib/nas-storage")>()),
  isNasStorageEnabled: mocks.enabled,
  nasMintUploadSession: mocks.mint
}));

import { POST } from "@/app/api/teleprompter/recordings/route";

function post(body: unknown) {
  return POST(new Request("https://example.test/api/teleprompter/recordings", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T16:12:00.000Z"));
  mocks.actor.mockResolvedValue({ userId: "user", email: "abby@example.edu" });
  mocks.docAccess.mockResolvedValue({});
  mocks.enabled.mockReturnValue(true);
  mocks.mint.mockImplementation(async (path: string) => ({
    provider: "NAS",
    path,
    token: "token",
    expiresAt: 1,
    uploadUrl: "https://drive.example.test/api/service/upload",
    downloadUrl: "https://drive.example.test/file",
    videoId: "nas_x",
    libraryId: "nas",
    signature: "sig"
  }));
});

describe("POST /api/teleprompter/recordings", () => {
  it("gives an upload slot in the day's Teleprompter Recordings folder", async () => {
    const response = await post({ docId: "doc1", recordingId: "0912-abc123", kind: "audio" });
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.path).toMatch(/^Package Storage\/Teleprompter Recordings\/2026-10-29\/0912-abc123-[0-9a-f]{10}\.wav$/);
    expect(data.upload).toEqual({
      provider: "NAS",
      uploadUrl: "https://drive.example.test/api/service/upload",
      path: data.path,
      token: "token",
      expiresAt: 1
    });
    expect(mocks.docAccess).toHaveBeenCalledWith({ docId: "doc1", userId: "user", email: "abby@example.edu" });
    const log = await post({ docId: "doc1", recordingId: "0912-abc123", kind: "log" });
    expect((await log.json()).data.path).toBe(data.path.replace(/\.wav$/, ".json"));
  });

  it("names the files after who asked, so nobody gets a slot on someone else's recording", async () => {
    const mine = (await (await post({ docId: "doc1", recordingId: "0912-abc123", kind: "audio" })).json()).data.path;
    mocks.actor.mockResolvedValue({ userId: "someone-else", email: "otto@example.edu" });
    const theirs = (await (await post({ docId: "doc1", recordingId: "0912-abc123", kind: "audio" })).json()).data.path;
    expect(theirs).not.toBe(mine);
  });

  it("refuses names that could leave the folder, and other kinds", async () => {
    for (const body of [
      { docId: "doc1", recordingId: "../../x", kind: "audio" },
      { docId: "doc1", recordingId: "0912-abc123", kind: "video" },
      { recordingId: "0912-abc123", kind: "audio" }
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it("checks script access before handing out a slot", async () => {
    mocks.docAccess.mockRejectedValue(new Error("FORBIDDEN"));
    expect((await post({ docId: "doc1", recordingId: "0912-abc123", kind: "audio" })).status).toBe(403);
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it("says so plainly when Drive is off or doesn't answer", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await post({ docId: "doc1", recordingId: "0912-abc123", kind: "audio" })).status).toBe(503);
    mocks.enabled.mockReturnValue(true);
    mocks.mint.mockRejectedValue(new Error("NAS mint-token failed: 500 internal detail"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await post({ docId: "doc1", recordingId: "0912-abc123", kind: "audio" });
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("internal detail");
  });
});
