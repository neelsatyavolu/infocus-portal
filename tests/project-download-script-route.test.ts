import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildProjectDownloadScript: vi.fn(),
  getProjectDownloadErrorResponse: vi.fn(),
  refreshProjectDownloadReadiness: vi.fn(),
  requireProjectRole: vi.fn()
}));

vi.mock("@/src/server/memberships", () => ({
  requireProjectRole: mocks.requireProjectRole
}));

vi.mock("@/src/server/project-download", () => ({
  buildProjectDownloadScript: mocks.buildProjectDownloadScript,
  getProjectDownloadErrorResponse: mocks.getProjectDownloadErrorResponse
}));

vi.mock("@/src/server/project-download-readiness", () => ({
  refreshProjectDownloadReadiness: mocks.refreshProjectDownloadReadiness
}));

import { GET } from "@/app/api/projects/[projectId]/download/script/route";

describe("project download script route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProjectRole.mockResolvedValue({});
    mocks.refreshProjectDownloadReadiness.mockResolvedValue(undefined);
    mocks.buildProjectDownloadScript.mockResolvedValue("echo download\n");
  });

  it("refreshes media readiness before building the terminal script", async () => {
    const response = await GET(
      new Request("https://infocus.test/api/projects/project_1/download/script"),
      { params: Promise.resolve({ projectId: "project_1" }) }
    );

    await expect(response.text()).resolves.toBe("echo download\n");
    expect(mocks.requireProjectRole).toHaveBeenCalledWith("project_1", undefined, {
      allowVisibility: true
    });
    expect(mocks.refreshProjectDownloadReadiness).toHaveBeenCalledWith("project_1");
    expect(mocks.buildProjectDownloadScript).toHaveBeenCalledWith(
      "project_1",
      "https://infocus.test"
    );
    expect(
      mocks.refreshProjectDownloadReadiness.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.buildProjectDownloadScript.mock.invocationCallOrder[0]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });
});
