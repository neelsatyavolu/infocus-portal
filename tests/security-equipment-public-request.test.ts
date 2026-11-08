import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookupStudent: vi.fn(),
  studentUpdate: vi.fn(),
  itemFindMany: vi.fn(),
  requestCreate: vi.fn(),
  sendEmails: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    equipmentStudent: { update: mocks.studentUpdate },
    equipmentItem: { findMany: mocks.itemFindMany },
    equipmentRequest: { create: mocks.requestCreate }
  }
}));
vi.mock("@/src/server/equipment-students", () => ({ lookupEquipmentStudent: mocks.lookupStudent }));
vi.mock("@/src/server/equipment-mail", () => ({ sendEquipmentRequestEmails: mocks.sendEmails }));

import { POST } from "@/app/api/equipment/public/requests/route";

const student = {
  id: "stu_1",
  studentId: "95000001",
  name: "Otto Example",
  firstName: "Otto",
  lastName: "Example",
  email: "otto@example.edu"
};

function submit() {
  return POST(
    new Request("https://infocus.test/api/equipment/public/requests", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify({
        studentName: "Abby",
        studentId: "95000001",
        email: "abby@example.edu",
        barcodes: ["CAM-1"]
      })
    })
  );
}

describe("public equipment request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lookupStudent.mockResolvedValue(student);
    mocks.itemFindMany.mockResolvedValue([
      { id: "item_1", name: "Camera", barcode: "CAM-1", archivedAt: null, checkedOut: false, onHoldForStudentId: null }
    ]);
    // Even if the database handed back more, the route must only echo the acknowledgement.
    mocks.requestCreate.mockResolvedValue({ id: "req_1", status: "PENDING", student, email: "abby@example.edu" });
    mocks.sendEmails.mockResolvedValue(undefined);
  });

  it("answers with only the request id and status", async () => {
    const response = await submit();
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ data: { id: "req_1", status: "PENDING" } });
  });

  it("never loads the student relation into the created request", async () => {
    await submit();
    const args = mocks.requestCreate.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    expect(args.select).toEqual({ id: true, status: true });
  });
});
