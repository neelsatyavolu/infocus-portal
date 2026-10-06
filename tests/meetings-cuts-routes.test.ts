import { beforeEach, describe, expect, it, vi } from "vitest";

type Version = { id: string; versionNumber: number; durationSeconds: number | null; approvalStatus: string; createdAt: Date };
type Item = { id: string; deletedAt: Date | null; versions: Version[] };
type Row = {
  id: string;
  cycleNumber: number;
  rowOrder: number;
  groupTopic: string;
  members: Array<{ user: { name: string | null; nickname: string | null; email: string | null } }>;
  initialCutMediaItemId: string | null;
  finalCutMediaItemId: string | null;
  initialCutMediaItem: Item | null;
  finalCutMediaItem: Item | null;
};

const mocks = vi.hoisted(() => ({
  role: "ASSOCIATE_PRODUCER" as string | null,
  rows: [] as Row[],
  versions: {} as Record<string, { id: string; versionNumber: number; durationSeconds: number | null; status: string; sourceType: string; bunnyVideoId: string; storageProvider: string; nasPath: string | null; mediaItem: { id: string; deletedAt: Date | null } }>
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => "u-abby"),
  syncUserProfile: vi.fn(async () => ({ id: "u-abby", email: "abby@example.edu", name: "Abby", nickname: null }))
}));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/platform-admin")>()),
  getPlatformAccess: vi.fn(async () => ({ role: mocks.role }))
}));
vi.mock("@/src/lib/media-playback", () => ({
  resolvePlaybackUrl: vi.fn(async (version: { nasPath: string | null }) => (version.nasPath ? `https://drive.example.edu/${version.nasPath}` : null))
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressRow: {
      findMany: vi.fn(async ({ where, distinct }: { where: { cycleNumber: number | { gt: number } }; distinct?: string[] }) => {
        const withCuts = mocks.rows.filter((r) => r.cycleNumber > 0 && (r.initialCutMediaItemId || r.finalCutMediaItemId));
        if (distinct) {
          return [...new Set(withCuts.map((r) => r.cycleNumber))].sort((a, b) => b - a).map((cycleNumber) => ({ cycleNumber }));
        }
        return withCuts
          .filter((r) => r.cycleNumber === where.cycleNumber)
          .sort((a, b) => a.rowOrder - b.rowOrder);
      }),
      findFirst: vi.fn(async ({ where }: { where: { OR: Array<{ initialCutMediaItemId?: string; finalCutMediaItemId?: string }> } }) => {
        const mediaId = where.OR[0]?.initialCutMediaItemId;
        return mocks.rows.find((r) => r.cycleNumber > 0 && (r.initialCutMediaItemId === mediaId || r.finalCutMediaItemId === mediaId)) ?? null;
      })
    },
    mediaVersion: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => mocks.versions[where.id] ?? null) }
  }
}));

import { GET as cutsGet } from "@/app/api/meetings/cuts/route";
import { GET as cutGet } from "@/app/api/meetings/cuts/[versionId]/route";

const version = (id: string, versionNumber: number, approvalStatus = "IN_REVIEW"): Version => ({
  id,
  versionNumber,
  durationSeconds: 120 + versionNumber,
  approvalStatus,
  createdAt: new Date(Date.UTC(2026, 9, versionNumber))
});

function row(overrides: Partial<Row> & Pick<Row, "id" | "cycleNumber">): Row {
  return {
    rowOrder: 0,
    groupTopic: "Homecoming Week",
    members: [{ user: { name: "Abby Example", nickname: "Abby", email: null } }, { user: { name: "Otto Example", nickname: null, email: null } }],
    initialCutMediaItemId: null,
    finalCutMediaItemId: null,
    initialCutMediaItem: null,
    finalCutMediaItem: null,
    ...overrides
  };
}

const list = async (query = "") => {
  const res = await cutsGet(new Request(`https://portal.example.edu/api/meetings/cuts${query}`));
  return { status: res.status, body: (await res.json()) as { data: { cycles: number[]; cycle: number | null; groups: Array<Record<string, unknown>> } } };
};
const one = async (versionId: string) => {
  const res = await cutGet(new Request(`https://portal.example.edu/api/meetings/cuts/${versionId}`), { params: Promise.resolve({ versionId }) });
  return { status: res.status, body: (await res.json()) as { data: Record<string, unknown> } };
};

beforeEach(() => {
  mocks.role = "ASSOCIATE_PRODUCER";
  mocks.rows = [
    row({
      id: "r1",
      cycleNumber: 2,
      initialCutMediaItemId: "mi1",
      finalCutMediaItemId: "mf1",
      initialCutMediaItem: { id: "mi1", deletedAt: null, versions: [version("vi1", 1), version("vi2", 2)] },
      finalCutMediaItem: { id: "mf1", deletedAt: null, versions: [version("vf1", 1, "APPROVED")] }
    }),
    row({
      id: "r2",
      cycleNumber: 2,
      rowOrder: 1,
      groupTopic: "  ",
      members: [],
      initialCutMediaItemId: "mi2",
      initialCutMediaItem: { id: "mi2", deletedAt: new Date(), versions: [version("vx", 1)] }
    }),
    row({ id: "r3", cycleNumber: 1, initialCutMediaItemId: "mi3", initialCutMediaItem: { id: "mi3", deletedAt: null, versions: [version("vo", 1)] } }),
    row({ id: "r0", cycleNumber: 0, finalCutMediaItemId: "mq", finalCutMediaItem: { id: "mq", deletedAt: null, versions: [version("vq", 1)] } })
  ];
  mocks.versions = {
    vf1: { id: "vf1", versionNumber: 1, durationSeconds: 148, status: "READY", sourceType: "VIDEO", bunnyVideoId: "nas:1", storageProvider: "NAS", nasPath: "Final Cut/v1.mp4", mediaItem: { id: "mf1", deletedAt: null } },
    vq: { id: "vq", versionNumber: 1, durationSeconds: 60, status: "READY", sourceType: "VIDEO", bunnyVideoId: "nas:2", storageProvider: "NAS", nasPath: "q.mp4", mediaItem: { id: "mq", deletedAt: null } },
    vbusy: { id: "vbusy", versionNumber: 2, durationSeconds: null, status: "PROCESSING", sourceType: "VIDEO", bunnyVideoId: "nas:3", storageProvider: "NAS", nasPath: "p.mp4", mediaItem: { id: "mf1", deletedAt: null } }
  };
});

describe("GET /api/meetings/cuts", () => {
  it("lists the newest cycle's groups with their cut versions", async () => {
    const { status, body } = await list();
    expect(status).toBe(200);
    expect(body.data.cycles).toEqual([2, 1]);
    expect(body.data.cycle).toBe(2);
    expect(body.data.groups).toEqual([
      {
        rowId: "r1",
        topic: "Homecoming Week",
        members: ["Abby", "Otto Example"],
        initial: [
          { versionId: "vi1", mediaId: "mi1", versionNumber: 1, durationSeconds: 121, approved: false, uploadedAt: "2026-10-01T00:00:00.000Z" },
          { versionId: "vi2", mediaId: "mi1", versionNumber: 2, durationSeconds: 122, approved: false, uploadedAt: "2026-10-02T00:00:00.000Z" }
        ],
        final: [{ versionId: "vf1", mediaId: "mf1", versionNumber: 1, durationSeconds: 121, approved: true, uploadedAt: "2026-10-01T00:00:00.000Z" }]
      }
    ]);
  });

  it("lists an older cycle on request, and falls back to the newest for an unknown one", async () => {
    expect((await list("?cycle=1")).body.data.groups.map((g) => g.rowId)).toEqual(["r3"]);
    expect((await list("?cycle=9")).body.data.cycle).toBe(2);
  });

  it("is producers only", async () => {
    mocks.role = null;
    expect((await list()).status).toBe(403);
  });
});

describe("GET /api/meetings/cuts/<versionId>", () => {
  it("returns the label and a playback URL", async () => {
    const { status, body } = await one("vf1");
    expect(status).toBe(200);
    expect(body.data).toEqual({
      versionId: "vf1",
      mediaId: "mf1",
      kind: "final",
      versionNumber: 1,
      cycleNumber: 2,
      topic: "Homecoming Week",
      label: "Final Cut v1",
      durationSeconds: 148,
      playbackUrl: "https://drive.example.edu/Final Cut/v1.mp4"
    });
  });

  it("refuses media that isn't a cycle cut, unfinished versions and unknown ids", async () => {
    expect((await one("vq")).status).toBe(404);
    expect((await one("vbusy")).status).toBe(404);
    expect((await one("missing")).status).toBe(404);
  });

  it("is producers only", async () => {
    mocks.role = null;
    expect((await one("vf1")).status).toBe(403);
  });
});
