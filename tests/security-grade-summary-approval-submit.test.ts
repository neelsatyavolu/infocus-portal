import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  buildGradeSummary: vi.fn(),
  requireMediaAccess: vi.fn(),
  findProgressRowForMedia: vi.fn(),
  submitForReview: vi.fn(),
  loadApprovalView: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile
}));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/platform-admin")>();
  return { ...actual, getPlatformAccess: mocks.getPlatformAccess };
});
vi.mock("@/src/server/student-grade-summary", () => ({ buildGradeSummary: mocks.buildGradeSummary }));
vi.mock("@/src/server/memberships", () => ({ requireMediaAccess: mocks.requireMediaAccess }));
vi.mock("@/src/lib/rate-limit", () => ({
  getRequestKey: () => "key",
  limitByKey: () => ({ allowed: true })
}));
vi.mock("@/src/server/package-approval-service", () => ({
  findProgressRowForMedia: mocks.findProgressRowForMedia,
  submitForReview: mocks.submitForReview,
  loadApprovalView: mocks.loadApprovalView,
  approveAnyway: vi.fn(),
  recordDecision: vi.fn(),
  unapproveCut: vi.fn(),
  setControversial: vi.fn(),
  submitCutReview: vi.fn()
}));

import { GET as summaryGET } from "@/app/api/grades/summary/route";
import { POST as approvalPOST } from "@/app/api/media/[mediaId]/package-approval/route";

function signIn(role: string | null) {
  mocks.requireUserId.mockResolvedValue("u-otto");
  mocks.syncUserProfile.mockResolvedValue({ id: "u-otto", email: "otto@example.edu" });
  mocks.getPlatformAccess.mockResolvedValue({ role });
}

describe("GET /api/grades/summary for another student", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildGradeSummary.mockResolvedValue({ total: 90 });
  });

  it("refuses an associate producer", async () => {
    signIn("ASSOCIATE_PRODUCER");
    const response = await summaryGET(new Request("https://portal.example.edu/api/grades/summary?userId=u-abby"));
    expect(response.status).toBe(403);
    expect(mocks.buildGradeSummary).not.toHaveBeenCalled();
  });

  it("lets an executive producer read it", async () => {
    signIn("EXECUTIVE_PRODUCER");
    const response = await summaryGET(new Request("https://portal.example.edu/api/grades/summary?userId=u-abby"));
    expect(response.status).toBe(200);
    expect(mocks.buildGradeSummary).toHaveBeenCalledWith("u-abby");
  });

  it("still lets a student read their own", async () => {
    signIn(null);
    const response = await summaryGET(new Request("https://portal.example.edu/api/grades/summary"));
    expect(response.status).toBe(200);
    expect(mocks.buildGradeSummary).toHaveBeenCalledWith("u-otto");
  });
});

describe("POST /api/media/[mediaId]/package-approval SUBMIT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMediaAccess.mockResolvedValue({ role: "REVIEWER" });
    mocks.findProgressRowForMedia.mockResolvedValue({ id: "row-1" });
    mocks.loadApprovalView.mockResolvedValue({ stage: "ASSOCIATE_REVIEW" });
  });

  function submit() {
    return approvalPOST(
      new Request("https://portal.example.edu/api/media/media-1/package-approval", {
        method: "POST",
        body: JSON.stringify({ action: "SUBMIT" })
      }),
      { params: Promise.resolve({ mediaId: "media-1" }) }
    );
  }

  it("refuses a viewer who is not a producer", async () => {
    signIn(null);
    const response = await submit();
    expect(response.status).toBe(403);
    expect(mocks.submitForReview).not.toHaveBeenCalled();
  });

  it("lets an associate producer submit", async () => {
    signIn("ASSOCIATE_PRODUCER");
    const response = await submit();
    expect(response.status).toBe(200);
    expect(mocks.submitForReview).toHaveBeenCalledWith("row-1");
  });
});
