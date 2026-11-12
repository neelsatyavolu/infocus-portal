import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  portfolioUpsert: vi.fn(),
  portfolioFindMany: vi.fn(),
  listProducerMembers: vi.fn(),
  isEquipmentManager: vi.fn(),
  itemFindMany: vi.fn(),
  checkoutFindMany: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile
}));
vi.mock("@/src/lib/platform-admin", async () => {
  const roles = await vi.importActual<typeof import("@/src/lib/platform-roles")>("@/src/lib/platform-roles");
  return { ...roles, getPlatformAccess: mocks.getPlatformAccess };
});
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    portfolioGrade: { upsert: mocks.portfolioUpsert, findMany: mocks.portfolioFindMany },
    equipmentItem: { findMany: mocks.itemFindMany },
    equipmentCheckout: { findMany: mocks.checkoutFindMany },
    equipmentManager: { findUnique: (...args: unknown[]) => mocks.isEquipmentManager(...args) }
  }
}));
vi.mock("@/src/server/member-notes", () => ({ listProducerMembers: mocks.listProducerMembers }));

import { GET as portfolioGET, POST as portfolioPOST, PUT as portfolioPUT } from "@/app/api/grades/portfolio/route";
import { GET as membersExport } from "@/app/api/members/export/route";
import { GET as equipmentExport } from "@/app/api/equipment/manage/export/route";
import { currentPortfolioSemester } from "@/src/lib/portfolio";

function asRole(role: string | null) {
  mocks.getPlatformAccess.mockResolvedValue({ role });
}

function jsonRequest(method: string, body: unknown) {
  return new Request("https://portal.test/api/grades/portfolio", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("user_abby");
  mocks.syncUserProfile.mockResolvedValue({ id: "user_abby", email: "abby@example.edu" });
  mocks.portfolioUpsert.mockImplementation(async ({ create }) => create);
  mocks.isEquipmentManager.mockResolvedValue(null);
});

describe("portfolio API", () => {
  it("lets a student save their own https link for the current semester without grading it", async () => {
    asRole(null);
    const response = await portfolioPUT(jsonRequest("PUT", { link: "https://example.edu/abby" }));
    expect(response.status).toBe(200);
    const call = mocks.portfolioUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId_semester: { userId: "user_abby", semester: currentPortfolioSemester() } });
    expect(call.update).toEqual({ link: "https://example.edu/abby" });
    expect(call.create.points).toBe(null);
  });

  it("rejects a non-https link", async () => {
    asRole(null);
    const response = await portfolioPUT(jsonRequest("PUT", { link: "http://example.edu/abby" }));
    expect(response.status).toBe(400);
    expect(mocks.portfolioUpsert).not.toHaveBeenCalled();
  });

  it("keeps grading to executive producers and up", async () => {
    asRole("ASSOCIATE_PRODUCER");
    const response = await portfolioPOST(jsonRequest("POST", { userId: "user_otto", points: 90 }));
    expect(response.status).toBe(403);
  });

  it("saves a score for the given semester and keeps existing feedback when none is sent", async () => {
    asRole("EXECUTIVE_PRODUCER");
    const response = await portfolioPOST(jsonRequest("POST", { userId: "user_otto", semester: "2026-27 S1", points: 90 }));
    expect(response.status).toBe(200);
    const call = mocks.portfolioUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId_semester: { userId: "user_otto", semester: "2026-27 S1" } });
    expect(call.update).toEqual({ points: 90 });
  });

  it("clears a score back to ungraded with null", async () => {
    asRole("ADVISER");
    await portfolioPOST(jsonRequest("POST", { userId: "user_otto", points: null }));
    expect(mocks.portfolioUpsert.mock.calls[0][0].update).toEqual({ points: null });
  });

  it("lists one semester with links, reporting the marker as ungraded", async () => {
    asRole("SUPER_ADMIN");
    mocks.portfolioFindMany.mockResolvedValue([
      { userId: "user_otto", points: null, feedback: "", link: "https://example.edu/otto", user: null }
    ]);
    const response = await portfolioGET(new Request("https://portal.test/api/grades/portfolio?semester=2026-27%20S2"));
    const body = await response.json();
    expect(mocks.portfolioFindMany.mock.calls[0][0].where).toEqual({ semester: "2026-27 S2" });
    expect(body.data.grades[0]).toMatchObject({ points: null, link: "https://example.edu/otto" });
  });
});

describe("CSV exports", () => {
  it("members export is producers only", async () => {
    asRole(null);
    expect((await membersExport()).status).toBe(403);
  });

  it("members export returns a CSV download", async () => {
    asRole("ASSOCIATE_PRODUCER");
    mocks.listProducerMembers.mockResolvedValue({
      cycles: [{ cycleNumber: 1, focus: "" }],
      members: [{ id: "u1", name: "Sage", email: "sage@example.edu", notesByCycle: { "0": "Strong", "1": "On time" } }]
    });
    const response = await membersExport();
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="members-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(await response.text()).toBe("Name,Email,General notes,Cycle 1 notes\nSage,sage@example.edu,Strong,On time");
  });

  it("equipment export needs equipment manager access", async () => {
    asRole(null);
    const response = await equipmentExport(new Request("https://portal.test/api/equipment/manage/export"));
    expect(response.status).toBe(403);
  });

  it("equipment export serves checkout history", async () => {
    asRole("ASSOCIATE_PRODUCER");
    mocks.checkoutFindMany.mockResolvedValue([
      {
        status: "RETURNED",
        checkoutAt: new Date("2026-11-02T18:00:00.000Z"),
        dueAt: null,
        returnAt: new Date("2026-11-03T18:00:00.000Z"),
        item: { name: "Camera", barcode: "CAM-1" },
        student: { name: "Otto", email: "otto@example.edu", studentId: "1" }
      }
    ]);
    const response = await equipmentExport(new Request("https://portal.test/api/equipment/manage/export?kind=checkouts"));
    const text = await response.text();
    expect(text.split("\n")[1]).toBe(
      "2026-11-02T18:00:00.000Z,Camera,CAM-1,Otto,otto@example.edu,RETURNED,,2026-11-03T18:00:00.000Z"
    );
  });
});
