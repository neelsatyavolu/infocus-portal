import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ job: vi.fn(), publication: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: { showEditJob: { findFirst: mocks.job }, showPublication: { findUnique: mocks.publication } }
}));

import { showEditSummary } from "@/src/server/show-editor-summary";

describe("showEditSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads only the latest job's status and stage, and the publication status", async () => {
    mocks.job.mockResolvedValue({ status: "RUNNING", stage: "render" });
    mocks.publication.mockResolvedValue({ status: "DRAFT" });
    expect(await showEditSummary("2026-10-21")).toEqual({ status: "RUNNING", stage: "render", publicationStatus: "DRAFT" });
    expect(mocks.job).toHaveBeenCalledWith({
      where: { showDate: "2026-10-21" }, orderBy: { createdAt: "desc" }, select: { status: true, stage: true }
    });
    expect(mocks.publication).toHaveBeenCalledWith({ where: { showDate: "2026-10-21" }, select: { status: true } });
  });

  it("is all null when nothing was edited or uploaded", async () => {
    mocks.job.mockResolvedValue(null);
    mocks.publication.mockResolvedValue(null);
    expect(await showEditSummary("2026-10-21")).toEqual({ status: null, stage: null, publicationStatus: null });
  });
});
