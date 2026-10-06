import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  workspace: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() }
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
import {
  getCanonicalWorkspace,
  getCanonicalWorkspaceId,
  resetCanonicalWorkspaceMemo
} from "@/src/lib/canonical-workspace";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  resetCanonicalWorkspaceMemo();
});

describe("canonical workspace id", () => {
  it("resolves once and reuses the id for later calls", async () => {
    db.workspace.findUnique.mockResolvedValue({ id: "ws" });
    expect(await getCanonicalWorkspaceId()).toBe("ws");
    expect(await getCanonicalWorkspaceId()).toBe("ws");
    expect(db.workspace.findUnique).toHaveBeenCalledTimes(1);
  });

  it("remembers the created workspace when the database was empty", async () => {
    db.workspace.findUnique.mockResolvedValue(null);
    db.workspace.findFirst.mockResolvedValue(null);
    db.workspace.create.mockResolvedValue({ id: "new" });
    expect(await getCanonicalWorkspaceId()).toBe("new");
    expect(await getCanonicalWorkspaceId()).toBe("new");
    expect(db.workspace.create).toHaveBeenCalledTimes(1);
  });

  it("re-resolves after the TTL, and the full row is always read fresh", async () => {
    vi.useFakeTimers();
    db.workspace.findUnique.mockResolvedValue({ id: "ws", name: "InFocus News" });
    await getCanonicalWorkspaceId();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await getCanonicalWorkspaceId();
    expect(db.workspace.findUnique).toHaveBeenCalledTimes(2);
    await getCanonicalWorkspace();
    expect(db.workspace.findUnique).toHaveBeenCalledTimes(3);
  });
});
