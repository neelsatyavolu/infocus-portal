import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcileProjectMediaStatuses: vi.fn()
}));

vi.mock("@/src/server/media-reconcile", () => ({
  reconcileProjectMediaStatuses: mocks.reconcileProjectMediaStatuses
}));

import { refreshProjectDownloadReadiness } from "@/src/server/project-download-readiness";

describe("refreshProjectDownloadReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reconciles project media statuses before download validation", async () => {
    mocks.reconcileProjectMediaStatuses.mockResolvedValue(undefined);

    await refreshProjectDownloadReadiness("project_1");

    expect(mocks.reconcileProjectMediaStatuses).toHaveBeenCalledWith("project_1");
  });

  it("does not block downloads when reconciliation fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.reconcileProjectMediaStatuses.mockRejectedValue(new Error("Bunny timeout"));

    await expect(refreshProjectDownloadReadiness("project_1")).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "Project download status reconciliation failed",
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });
});
