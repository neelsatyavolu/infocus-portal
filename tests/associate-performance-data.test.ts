import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rows: vi.fn(), history: vi.fn(), producers: vi.fn(), cycle: vi.fn(), reviews: vi.fn(), quality: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { packageProgressRow: { findMany: mocks.rows }, auditLog: { findMany: mocks.history }, packageCycle: { findUnique: mocks.cycle } } }));
vi.mock("@/src/server/package-progress-data", () => ({ loadAssignableProducers: mocks.producers }));
vi.mock("@/src/server/producer-feedback", () => ({ loadProducerFeedback: mocks.reviews }));
vi.mock("@/src/server/associate-feedback-quality", () => ({ getAssociateFeedbackQuality: mocks.quality }));
import { loadAssociatePerformance } from "@/src/server/associate-performance";

const submitted = new Date("2026-09-01T12:00:00Z");
const response = new Date("2026-09-02T12:00:00Z");
const row = () => ({
  id: "row", groupTopic: "Story", assignedProducerUserId: "ap", members: [],
  brainstormDocUrl: "", proofOfContact: false, aRollBRoll: false, proofOfContacts: [],
  pitching: false, initialCut: false, finalCut: false, extension: false, extensionRequests: [],
  stageComments: [], stageMedia: [{ mediaItem: { versions: [{ id: "v1", versionNumber: 1, createdAt: submitted, comments: [], approvalEvents: [] }] } }],
  initialCutMediaItem: null, approval: null
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
  mocks.producers.mockResolvedValue([{ userId: "ap", name: "Alex" }]);
  mocks.history.mockResolvedValue([]);
  mocks.cycle.mockResolvedValue(null);
  mocks.reviews.mockResolvedValue([]);
  mocks.quality.mockResolvedValue({ score: null, status: "not_scored" });
  mocks.rows.mockResolvedValue([row()]);
});
afterEach(() => vi.useRealTimers());
describe("associate performance data", () => {
  it("does not give credit for another associate's feedback", async () => {
    mocks.rows.mockResolvedValue([{ ...row(), stageComments: [{ id: "c", authorId: "other", stage: "a-roll", body: "Fix this", createdAt: response }] }]);
    const a = (await loadAssociatePerformance(1)).associates[0];
    expect(a.metrics.score).toBe(0);
    expect(a.feedback).toEqual([]);
  });
  it("does not count groups in which the associate is a student", async () => {
    mocks.rows.mockResolvedValue([{ ...row(), members: [{ userId: "ap" }] }]);
    expect((await loadAssociatePerformance(1)).associates[0]).toMatchObject({ assignedGroups: 0, metrics: { score: null } });
  });
  it("uses comments as response evidence but excludes automated review notices from feedback credit", async () => {
    mocks.rows.mockResolvedValue([{ ...row(), stageComments: [{ id: "c", authorId: "ap", stage: "a-roll", body: "Alex submitted a review", createdAt: response }] }]);
    expect((await loadAssociatePerformance(1)).associates[0].metrics.score).toBe(88);
  });
  it("excludes approvals whose actor and time are missing", async () => {
    mocks.rows.mockResolvedValue([{ ...row(), aRollBRoll: true }]);
    expect((await loadAssociatePerformance(1)).associates[0].metrics).toMatchObject({ score: null, unknown: 1 });
  });
  it("keeps a durable decision as evidence when signoffs have been cleared", async () => {
    mocks.history.mockResolvedValue([{ id: "audit", targetId: "row", actorId: "ap", createdAt: response,
      metadata: { stage: "a-roll", kind: "review", assignedProducerUserId: "ap", note: "Tighten the framing" } }]);
    const a = (await loadAssociatePerformance(1)).associates[0];
    expect(a.metrics.score).toBe(100);
    expect(a.feedback[0].body).toBe("Tighten the framing");
  });
  it("does not move the first-submission clock to a later upload", async () => {
    mocks.history.mockResolvedValue([{ id: "audit", targetId: "row", actorId: "student", createdAt: response,
      metadata: { stage: "a-roll", kind: "ready", assignedProducerUserId: "ap", mediaVersionId: "v2" } }]);
    expect((await loadAssociatePerformance(1)).associates[0].samples[0].submittedAt).toBe(submitted.toISOString());
  });
});

it("retains historical brainstorming feedback when readiness was never logged", async () => {
  mocks.rows.mockResolvedValue([{ ...row(), stageMedia: [], proofOfContact: true,
    stageComments: [{ id: "c", authorId: "ap", stage: "brainstorming", body: "Explain the impact on students", createdAt: response }] }]);
  const a = (await loadAssociatePerformance(1)).associates[0];
  expect(a.samples[0]).toMatchObject({ respondedAt: response.toISOString(), submittedAt: null, hasFeedback: true });
  expect(a.metrics).toMatchObject({ reviewed: 1, reviewCoverage: 100, feedbackCoverage: 100, score: 100, provisional: true });
});

it("uses approved extension days for final progress and ignores future milestones", async () => {
  mocks.cycle.mockResolvedValue({ finalCutDate: new Date("2026-09-10T12:00:00Z") });
  mocks.rows.mockResolvedValue([{ ...row(), extension: true, extensionRequests: [{ requestedDays: 5 }] }]);
  const a = (await loadAssociatePerformance(1)).associates[0];
  expect(a.progress.score).toBeNull();
  expect(a.progress.groups[0].milestones[4].dueAt).toBe("2026-09-15T12:00:00.000Z");
});


it("does not load private group responses without explicit executive access", async () => {
  mocks.reviews.mockResolvedValue([{ rowId: "row", producerId: "ap", groupTopic: "Story", cycleNumber: 1,
    helpfulness: 5, communication: 4, support: 5, body: "Private group concern", updatedAt: "2026-09-12" }]);
  const restricted = await loadAssociatePerformance(1, { includeGroupFeedback: false });
  expect(mocks.reviews).not.toHaveBeenCalled();
  expect(restricted.associates[0].groupFeedback).toEqual({ visible: false, score: null, reviews: [] });
  expect(JSON.stringify(restricted)).not.toContain("Private group concern");
  const executive = await loadAssociatePerformance(1, { includeGroupFeedback: true });
  expect(executive.associates[0].groupFeedback.reviews[0].body).toBe("Private group concern");
});
