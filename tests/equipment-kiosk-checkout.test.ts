import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStationToken } from "@/src/lib/equipment-kiosk";


const mocks = vi.hoisted(() => ({
  stationManager: vi.fn(),
  itemFindUnique: vi.fn(),
  itemFindMany: vi.fn(),
  resolveEquipmentStudentContact: vi.fn(),
  checkoutFindFirst: vi.fn(),
  checkoutUpdate: vi.fn(),
  checkoutCreate: vi.fn(),
  itemUpdateMany: vi.fn(),
  itemFindUniqueTx: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.stationManager },
    equipmentItem: {
      findUnique: mocks.itemFindUnique,
      findMany: mocks.itemFindMany
    },
    $transaction: mocks.transaction
  }
}));

vi.mock("@/src/lib/platform-admin", () => ({ getPlatformAccess: async () => ({ role: "ASSOCIATE_PRODUCER" }), isEmailAllowedToUsePlatform: async () => true }));
vi.mock("@/src/server/equipment-access", () => ({ requireEquipmentManagerAccess: async () => {} }));

vi.mock("@/src/server/equipment-students", () => ({
  resolveEquipmentStudentContact: mocks.resolveEquipmentStudentContact
}));

import { kioskCheckout, kioskCheckoutBatch, listKioskItems } from "@/src/server/equipment-kiosk";

const originalSecret = process.env.APP_AUTH_SECRET;

const student = { id: "stu_1", studentId: "95012345", name: "Ada" };
const item = {
  id: "item_1",
  barcode: "CAM-1",
  archivedAt: null,
  checkedOut: true,
  checkedOutById: student.id,
  onHoldForStudentId: null,
  checkedOutBy: { name: "Ada", studentId: "95012345" }
};

describe("kiosk checkout and return", () => {
  beforeEach(() => {
    process.env.APP_AUTH_SECRET = "test-equipment-station-secret";
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        equipmentCheckout: {
          findFirst: mocks.checkoutFindFirst,
          update: mocks.checkoutUpdate,
          create: mocks.checkoutCreate
        },
        equipmentItem: {
          updateMany: mocks.itemUpdateMany,
          findUnique: mocks.itemFindUniqueTx
        },
        equipmentAuditLog: {
          create: mocks.auditCreate
        }
      })
    );
    mocks.stationManager.mockResolvedValue({ id: "manager", email: "m@example.com", name: "Manager" });
    mocks.resolveEquipmentStudentContact.mockResolvedValue(student);
    mocks.itemFindUnique.mockResolvedValue(item);
    mocks.checkoutFindFirst.mockResolvedValue({ id: "co_1", status: "CHECKED_OUT" });
    mocks.checkoutUpdate.mockResolvedValue({ id: "co_1", status: "RETURNED" });
    mocks.itemUpdateMany.mockResolvedValue({ count: 1 });
    mocks.itemFindUniqueTx.mockResolvedValue({
      ...item,
      checkedOut: false,
      checkedOutById: null,
      checkedOutAt: null
    });
    mocks.auditCreate.mockResolvedValue({});
    mocks.checkoutCreate.mockResolvedValue({ id: "co_new" });
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.APP_AUTH_SECRET;
    } else {
      process.env.APP_AUTH_SECRET = originalSecret;
    }
  });

  it.each([undefined, "invalid-token"])("requires an unlocked station to list item codes (%s)", async (token) => {
    await expect(listKioskItems(token)).rejects.toThrow("UNAUTHORIZED");
    expect(mocks.itemFindMany).not.toHaveBeenCalled();
  });

  it("lists active inventory including out/held items without borrower details", async () => {
    const rows = [{ id: "item_1", name: "Camera", barcode: "CAM-1" }];
    mocks.itemFindMany.mockResolvedValue(rows);
    expect(await listKioskItems(createStationToken("manager"))).toEqual(rows);
    expect(mocks.itemFindMany).toHaveBeenCalledWith({
      where: { archivedAt: null },
      select: { id: true, name: true, barcode: true },
      orderBy: [{ name: "asc" }, { barcode: "asc" }]
    });
  });

  it("clears the item only if it is still out to that student", async () => {
    await kioskCheckout({
      stationToken: createStationToken("manager"),
      studentName: "Ada", studentEmail: "ada@pausd.us",
      barcode: "CAM-1"
    });

    expect(mocks.itemUpdateMany).toHaveBeenCalledWith({
      where: { id: "item_1", checkedOutById: student.id },
      data: { checkedOut: false, checkedOutById: null, checkedOutAt: null }
    });
  });

  it("throws CONFLICT when the item is no longer out to that student", async () => {
    mocks.itemUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      kioskCheckout({
        stationToken: createStationToken("manager"),
        studentName: "Ada", studentEmail: "ada@pausd.us",
        barcode: "CAM-1"
      })
    ).rejects.toThrow("CONFLICT");
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("checks out multiple items in one transaction and records one SD card declaration for the batch", async () => {
    mocks.itemFindUnique.mockImplementation(async ({ where }: { where: { barcode: string } }) => ({
      ...item, id: where.barcode, barcode: where.barcode, checkedOut: false, checkedOutById: null
    }));
    const result = await kioskCheckoutBatch({
      stationToken: createStationToken("manager"), studentName: "Ada", studentEmail: "ada@pausd.us",
      barcodes: ["CAM-1", "MIC-1"], tookSdCard: true
    });
    expect(result.results.map((entry) => entry.action)).toEqual(["checkout", "checkout"]);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.checkoutCreate).toHaveBeenCalledTimes(2);
    const metadata = mocks.checkoutCreate.mock.calls.map(([args]) => args.data.metadata);
    expect(metadata[0]).toEqual({ tookSdCard: true, batchId: expect.any(String) });
    expect(metadata[1]).toEqual(metadata[0]);
  });

  it("checks out distinct multiword codes sharing the first word", async () => {
    const inventory = [
      { ...item, id: "griffin", barcode: "peter griffin", checkedOut: false, checkedOutById: null },
      { ...item, id: "pan", barcode: "peter pan", checkedOut: false, checkedOutById: null }
    ];
    mocks.itemFindUnique.mockImplementation(async ({ where }) => inventory.find((entry) => entry.barcode === where.barcode) ?? null);
    const result = await kioskCheckoutBatch({
      stationToken: createStationToken("manager"), studentName: "Ada", studentEmail: "ada@pausd.us",
      barcodes: [" peter griffin ", "peter pan"]
    });
    expect(result.results.map((entry) => entry.action)).toEqual(["checkout", "checkout"]);
    expect(mocks.checkoutCreate.mock.calls.map(([args]) => args.data.itemId)).toEqual(["griffin", "pan"]);
  });

  it("defaults SD card to false", async () => {
    mocks.itemFindUnique.mockResolvedValue({ ...item, checkedOut: false, checkedOutById: null });
    await kioskCheckoutBatch({
      stationToken: createStationToken("manager"), studentName: "Ada", studentEmail: "ada@pausd.us", barcodes: ["CAM-1"]
    });
    expect(mocks.checkoutCreate.mock.calls[0][0].data.metadata.tookSdCard).toBe(false);
  });

  it("rejects duplicate codes without changing any items", async () => {
    await expect(kioskCheckoutBatch({
      stationToken: createStationToken("manager"), studentName: "Ada", studentEmail: "ada@pausd.us", barcodes: ["CAM-1", " CAM-1 "]
    })).rejects.toThrow("Each item code must be unique.");
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects the entire batch when one item is out to another student", async () => {
    mocks.itemFindUnique.mockResolvedValueOnce({ ...item, checkedOut: false, checkedOutById: null })
      .mockResolvedValueOnce({ ...item, id: "item_2", checkedOutById: "other" });
    await expect(kioskCheckoutBatch({
      stationToken: createStationToken("manager"), studentName: "Ada", studentEmail: "ada@pausd.us", barcodes: ["CAM-1", "MIC-1"]
    })).rejects.toThrow("Out to");
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("returns multiple items without overwriting their SD card history", async () => {
    const result = await kioskCheckoutBatch({
      stationToken: createStationToken("manager"), studentName: "Ada", studentEmail: "ada@pausd.us", barcodes: ["CAM-1", "MIC-1"]
    });
    expect(result.results.map((entry) => entry.action)).toEqual(["return", "return"]);
    expect(mocks.checkoutUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.checkoutUpdate.mock.calls[0][0].data).not.toHaveProperty("metadata");
  });

  it("does not silently discard an SD card declaration on a return-only batch", async () => {
    await expect(kioskCheckoutBatch({
      stationToken: createStationToken("manager"), studentName: "Ada", studentEmail: "ada@pausd.us",
      barcodes: ["CAM-1"], tookSdCard: true
    })).rejects.toThrow("Only select an SD card when checking out equipment.");
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects missing or held items before writing any part of a batch", async () => {
    for (const unavailable of [null, { ...item, checkedOut: false, onHoldForStudentId: "other" }]) {
      mocks.itemFindUnique.mockResolvedValueOnce({ ...item, checkedOut: false, checkedOutById: null })
        .mockResolvedValueOnce(unavailable);
      await expect(kioskCheckoutBatch({
        stationToken: createStationToken("manager"), studentName: "Ada", studentEmail: "ada@pausd.us", barcodes: ["CAM-1", "MIC-1"]
      })).rejects.toThrow();
      expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
    }
  });

  it("rejects an invalid station token before loading or changing equipment", async () => {
    await expect(kioskCheckoutBatch({
      stationToken: "invalid", studentName: "Ada", studentEmail: "ada@pausd.us", barcodes: ["CAM-1", "MIC-1"]
    })).rejects.toThrow("UNAUTHORIZED");
    expect(mocks.itemFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects the transaction when a later item is claimed concurrently", async () => {
    mocks.itemFindUnique.mockResolvedValue({ ...item, checkedOut: false, checkedOutById: null });
    mocks.itemUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(kioskCheckoutBatch({
      stationToken: createStationToken("manager"), studentName: "Ada", studentEmail: "ada@pausd.us", barcodes: ["CAM-1", "MIC-1"]
    })).rejects.toThrow("CONFLICT");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    await expect(mocks.transaction.mock.results[0].value).rejects.toThrow("CONFLICT");
  });

});
