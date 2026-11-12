import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  reviewComment: { createManyAndReturn: vi.fn() },
  activityEvent: { create: vi.fn() },
  auditLog: { create: vi.fn() }
}));
const csv = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/rate-limit", () => ({
  getRequestKey: vi.fn(() => "test"),
  limitByKey: vi.fn(() => ({ allowed: true }))
}));
vi.mock("@/src/lib/comment-import-csv", () => ({ parseImportedCommentsCsv: csv.parse }));
vi.mock("@/src/server/comment-access", () => ({
  requireCommentActor: vi.fn(async () => ({
    role: "EDITOR",
    actorType: "member",
    actorId: "user-abby",
    workspaceId: "ws",
    projectId: "proj",
    mediaVersion: { id: "ver", mediaItemId: "item", sourceType: "VIDEO" }
  }))
}));

import { POST } from "@/app/api/comments/import/route";

const MAX_IMPORTED_COMMENTS = 1000;

function request() {
  return new Request("http://localhost/api/comments/import", {
    method: "POST",
    body: JSON.stringify({ mediaVersionId: "cjld2cjxh0000qzrmn831i7rn", csvText: "x" })
  });
}

function comments(count: number, createdAt = new Date("2026-01-01T00:00:00Z")) {
  return Array.from({ length: count }, (_, i) => ({ body: `note ${i}`, frameNumber: i, timeSeconds: i / 30, createdAt }));
}

beforeEach(() => {
  vi.clearAllMocks();
  db.reviewComment.createManyAndReturn.mockImplementation(({ data }) => data.map((row: object, i: number) => ({ id: `c${i}`, ...row })));
  db.$transaction.mockImplementation(async (operations: unknown[]) => Promise.all(operations));
});

describe("POST /api/comments/import", () => {
  it("creates every comment in one createMany inside a batch transaction", async () => {
    csv.parse.mockReturnValue({ comments: comments(3), skippedCount: 1, totalRows: 4 });
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(db.reviewComment.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(db.reviewComment.createManyAndReturn.mock.calls[0][0].data).toHaveLength(3);
    expect(body.data).toMatchObject({ importedCount: 3, skippedCount: 1, totalRows: 4 });
    expect(body.data.comments).toHaveLength(3);
  });

  it("rejects more than the row cap with a clear 400", async () => {
    csv.parse.mockReturnValue({ comments: comments(MAX_IMPORTED_COMMENTS + 1), skippedCount: 0, totalRows: 1001 });
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(JSON.stringify(body)).toContain(`at most ${MAX_IMPORTED_COMMENTS}`);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("clamps a future Commented At to now", async () => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    csv.parse.mockReturnValue({ comments: comments(1, future), skippedCount: 0, totalRows: 1 });
    await POST(request());
    const createdAt: Date = db.reviewComment.createManyAndReturn.mock.calls[0][0].data[0].createdAt;
    expect(createdAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
