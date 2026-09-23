import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ groups: vi.fn(), save: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ requireUserId: async () => "student" }));
vi.mock("@/src/server/producer-feedback", () => ({
  loadProducerFeedbackGroups: m.groups,
  saveProducerFeedback: m.save
}));

import { GET, POST } from "@/app/api/producer-feedback/route";

beforeEach(() => vi.clearAllMocks());

describe("temporarily paused producer feedback", () => {
  it("blocks form loading without reading group data", async () => {
    const response = await GET();
    expect(response.status).toBe(403);
    expect(m.groups).not.toHaveBeenCalled();
  });

  it("rejects submissions from an already-open form without saving", async () => {
    const response = await POST(new Request("http://localhost/api/producer-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId: "g", helpfulness: 4, communication: 3, support: 5, body: "Helpful feedback on our story." })
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toBe("Producer feedback is temporarily unavailable.");
    expect(m.save).not.toHaveBeenCalled();
  });
});
