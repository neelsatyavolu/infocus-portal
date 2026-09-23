import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), manager: vi.fn(), row: vi.fn() }));
vi.mock("@/src/lib/current-app-user", () => ({ getCurrentAppUser: mocks.currentUser }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  publishingManager: { findUnique: mocks.manager }, packageProgressRow: { findUnique: mocks.row }
} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
  notFound: () => { throw new Error("NOT_FOUND"); }
}));
import PublicationPage from "@/app/(app)/publishing-queue/[rowId]/page";

function iframeProps(node: React.ReactNode): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(iframeProps);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  if (node.type === "iframe") return [node.props];
  return iframeProps(node.props.children);
}

describe("publication page access and data boundary", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", React);
    mocks.currentUser.mockResolvedValue({ userId: "viewer", platformRole: null });
    mocks.manager.mockResolvedValue({ id: "appointment" });
    mocks.row.mockResolvedValue({ groupTopic: "Story", queuedForShowDate: "2026-09-23", youtubePublication: null });
  });

  it("blocks unappointed viewers before reading publication data", async () => {
    mocks.manager.mockResolvedValue(null);
    await expect(PublicationPage({ params: Promise.resolve({ rowId: "row" }) })).rejects.toThrow("REDIRECT:/access-denied");
    expect(mocks.row).not.toHaveBeenCalled();
  });

  it("selects only safe publication fields", async () => {
    await PublicationPage({ params: Promise.resolve({ rowId: "row" }) });
    expect(mocks.row).toHaveBeenCalledWith({ where: { id: "row" }, select: {
      groupTopic: true, queuedForShowDate: true,
      youtubePublication: { select: { title: true, showDate: true, status: true, videoId: true, publishedAt: true } }
    } });
  });

  it.each(["UPLOADING", "PROCESSING", "FAILED", "PUBLISHED"])("only embeds a published video (%s)", async (status) => {
    mocks.row.mockResolvedValue({ groupTopic: "Story", youtubePublication: { title: "Story", showDate: "2026-09-23", status, videoId: "abcdefghijk" } });
    const embeds = iframeProps(await PublicationPage({ params: Promise.resolve({ rowId: "row" }) }));
    expect(embeds).toHaveLength(status === "PUBLISHED" ? 1 : 0);
    if (status === "PUBLISHED") expect(embeds[0].src).toBe("https://www.youtube.com/embed/abcdefghijk");
  });

  it("does not embed an invalid video id", async () => {
    mocks.row.mockResolvedValue({ groupTopic: "Story", youtubePublication: { title: "Story", showDate: "2026-09-23", status: "PUBLISHED", videoId: "invalid?x=1" } });
    expect(iframeProps(await PublicationPage({ params: Promise.resolve({ rowId: "row" }) }))).toHaveLength(0);
  });
});
