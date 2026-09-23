import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), create: vi.fn(), update: vi.fn(), claim: vi.fn(), workspace: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { auditLog: { findUnique: m.find, create: m.create, update: m.update, updateMany: m.claim } } }));
vi.mock("@/src/lib/canonical-workspace", () => ({ getCanonicalWorkspaceId: m.workspace }));
import { getAssociateFeedbackQuality } from "@/src/server/associate-feedback-quality";
const input = { associateId: "ap", cycleNumber: 1, eligibleReviews: 1, names: ["Iris"], notes: [
  { id: "note", rowId: "group", topic: "Private topic", stage: "a-roll", body: "Iris: tighten the framing to emphasize the subject.", createdAt: "2026-09-01" }
] };
const result = { items: [{ ref: "F1", specificity: 4, actionability: 4, reasoning: 4, constructiveness: 4, quote: "tighten the framing", reason: "Specific useful direction." }] };
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("GEMINI_API_KEY_CHAT", "test-only-placeholder"); vi.stubGlobal("fetch", fetchMock);
  m.find.mockResolvedValue(null); m.create.mockResolvedValue({}); m.update.mockResolvedValue({}); m.claim.mockResolvedValue({ count: 1 }); m.workspace.mockResolvedValue("ws");
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(result) } }] }), { status: 200 }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Gemini feedback scoring", () => {
  it("does not spend API quota during normal reads", async () => {
    expect((await getAssociateFeedbackQuality(input)).status).toBe("not_scored");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses a fixed model and prompt, omits identity metadata, and reuses saved results", async () => {
    const first = await getAssociateFeedbackQuality(input, true);
    expect(first.score).toBe(100);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.model).toBe("gemini-3.1-flash-lite");
    expect(request.temperature).toBe(0);
    expect(fetchMock.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-only-placeholder");
    expect(request.response_format.type).toBe("json_schema");
    expect(request).not.toHaveProperty("seed");
    expect(request.messages[1].content).not.toMatch(/Iris|Private topic|group|note/);
    const saved = m.update.mock.calls[0][0].data;
    m.find.mockResolvedValue({ metadata: saved.metadata, createdAt: saved.createdAt });
    expect((await getAssociateFeedbackQuality(input, true)).score).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not invent a zero when the provider is rate limited", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    expect(await getAssociateFeedbackQuality(input, true)).toMatchObject({ status: "unavailable", score: null });
  });
  it("does not send duplicate calls while another evaluation owns the claim", async () => {
    m.create.mockRejectedValueOnce({ code: "P2002" });
    expect((await getAssociateFeedbackQuality(input, true)).status).toBe("pending");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("handles missing configuration and distinguishes no feedback from no eligible work", async () => {
    vi.stubEnv("GEMINI_API_KEY_CHAT", "");
    expect(await getAssociateFeedbackQuality(input, true)).toMatchObject({ status: "unavailable", score: null });
    expect((await getAssociateFeedbackQuality({ ...input, notes: [] })).score).toBe(0);
    expect((await getAssociateFeedbackQuality({ ...input, notes: [], eligibleReviews: 0 })).score).toBeNull();
  });
  it("rejects unsupported evidence rather than persisting a successful score", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ items: [{ ...result.items[0], quote: "fabricated" }] }) } }] })));
    expect(await getAssociateFeedbackQuality(input, true)).toMatchObject({ status: "unavailable", score: null });
    expect(m.update.mock.calls[0][0].data.metadata.status).toBe("unavailable");
  });
});

it("refreshes unchanged evidence once per scheduled day and keeps the prior score on failure", async () => {
  const oldDate = new Date("2026-09-11T08:00:00Z");
  m.find.mockResolvedValue({ createdAt: oldDate, metadata: { status: "ready", result, refreshedDay: "2026-09-11" } });
  const refreshed = await getAssociateFeedbackQuality(input, true, "2026-09-12");
  expect(refreshed.score).toBe(100);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const saved = m.update.mock.calls[0][0].data;
  expect(saved.metadata.refreshedDay).toBe("2026-09-12");
  m.find.mockResolvedValue({ metadata: saved.metadata, createdAt: saved.createdAt });
  await getAssociateFeedbackQuality(input, true, "2026-09-12");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockResolvedValue(new Response("", { status: 429 }));
  const failed = await getAssociateFeedbackQuality(input, true, "2026-09-13");
  expect(failed).toMatchObject({ status: "ready", score: 100, evaluatedAt: refreshed.evaluatedAt });
  expect(failed.message).toContain("last saved");
  const failedSaved = m.update.mock.calls[1][0].data;
  m.find.mockResolvedValue({ metadata: failedSaved.metadata, createdAt: failedSaved.createdAt });
  expect(await getAssociateFeedbackQuality(input)).toMatchObject({ status: "ready", score: 100, evaluatedAt: refreshed.evaluatedAt });
});
