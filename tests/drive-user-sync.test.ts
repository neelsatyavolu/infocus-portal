import { afterEach, describe, expect, it, vi } from "vitest";
import { provisionNasUsers, revokeNasUsers } from "@/src/lib/drive-user-sync";

describe("provisionNasUsers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DRIVE_SERVICE_TOKEN;
    delete process.env.DRIVE_BASE_URL;
  });

  it("does nothing without a service token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await provisionNasUsers([{ email: "tw12345@pausd.us", name: "T" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts unique emails to Drive ensure-user", async () => {
    process.env.DRIVE_SERVICE_TOKEN = "secret-token";
    process.env.DRIVE_BASE_URL = "https://drive.infocuspaly.com";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await provisionNasUsers([
      { email: " tw12345@pausd.us ", name: "T" },
      { email: "not-an-email", name: "X" }
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://drive.infocuspaly.com/api/service/ensure-user");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(String(init.body))).toEqual({
      users: [{ email: "tw12345@pausd.us", name: "T" }]
    });
  });

  it("posts emails to Drive revoke-user", async () => {
    process.env.DRIVE_SERVICE_TOKEN = "secret-token";
    process.env.DRIVE_BASE_URL = "https://drive.infocuspaly.com";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await revokeNasUsers([" GoneKid@pausd.us ", "nope"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://drive.infocuspaly.com/api/service/revoke-user");
    expect(JSON.parse(String(init.body))).toEqual({
      users: [{ email: "gonekid@pausd.us" }]
    });
  });
});
