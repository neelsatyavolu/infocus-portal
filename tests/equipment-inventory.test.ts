import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  itemFindUnique: vi.fn(),
  itemCreate: vi.fn(),
  itemUpdate: vi.fn(),
  checkoutFindFirst: vi.fn(),
  checkoutUpdate: vi.fn(),
  itemUpdateMany: vi.fn(),
  itemFindUniqueTx: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    equipmentItem: {
      update: mocks.itemUpdate,
      create: mocks.itemCreate,
      findUnique: mocks.itemFindUnique
    },
    equipmentAuditLog: { create: mocks.auditCreate },
    $transaction: mocks.transaction
  }
}));

import { archiveItem, createItem, updateItem, forceReturn } from "@/src/server/equipment-inventory";

const item = {
  id: "item_1",
  barcode: "CAM-1",
  checkedOut: true,
  checkedOutById: "stu_1",
  checkedOutAt: new Date("2026-09-01T00:00:00.000Z")
};

describe("forceReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        equipmentCheckout: {
          findFirst: mocks.checkoutFindFirst,
          update: mocks.checkoutUpdate
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
  });

  it("clears the item only if it is still checked out", async () => {
    await forceReturn("item_1");

    expect(mocks.itemUpdateMany).toHaveBeenCalledWith({
      where: { id: "item_1", checkedOut: true },
      data: { checkedOut: false, checkedOutById: null, checkedOutAt: null }
    });
  });

  it("throws CONFLICT when the item is no longer out", async () => {
    mocks.itemUpdateMany.mockResolvedValue({ count: 0 });

    await expect(forceReturn("item_1")).rejects.toThrow("CONFLICT");
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});


describe("multiword inventory codes", () => {
  beforeEach(() => {
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback({
      equipmentItem: { findUnique: mocks.itemFindUnique, create: mocks.itemCreate },
      equipmentAuditLog: { create: mocks.auditCreate }
    }));
  });
  it.each(["Camera", "Microphone"])("allows shared code prefixes with item name %s but rejects duplicate codes", async (secondName) => {
    vi.clearAllMocks();
    const inventory = new Map<string, { id: string; name: string; barcode: string }>();
    mocks.itemFindUnique.mockImplementation(async ({ where }) => inventory.get(where.barcode) ?? null);
    mocks.itemCreate.mockImplementation(async ({ data }) => {
      const created = { id: String(inventory.size + 1), ...data };
      inventory.set(data.barcode, created);
      return created;
    });
    await createItem({ name: "Camera", barcode: "peter griffin" });
    await createItem({ name: secondName, barcode: "peter pan" });
    expect([...inventory.keys()]).toEqual(["peter griffin", "peter pan"]);
    expect([...inventory.values()].map((entry) => entry.name)).toEqual(["Camera", secondName]);
    await expect(createItem({ name: "Other", barcode: " peter griffin " })).rejects.toThrow("CONFLICT");
    expect(mocks.itemCreate).toHaveBeenCalledTimes(2);
  });
});


describe("reusing archived codes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback({
      equipmentItem: { findUnique: mocks.itemFindUnique, create: mocks.itemCreate, update: mocks.itemUpdate },
      equipmentAuditLog: { create: mocks.auditCreate }
    }));
    mocks.itemUpdate.mockResolvedValue({ id: "archived" });
    mocks.itemCreate.mockResolvedValue({ id: "new" });
  });

  it("releases the code when archiving an available item", async () => {
    mocks.itemFindUnique.mockResolvedValue({ id: "old", barcode: "Peter Griffin", archivedAt: null, checkedOut: false, onHoldForStudentId: null });
    await archiveItem("old");
    expect(mocks.itemUpdate).toHaveBeenCalledWith({
      where: { id: "old" },
      data: { archivedAt: expect.any(Date), barcode: expect.stringMatching(/^Peter Griffin \[archived .+\]$/) }
    });
    expect(mocks.auditCreate.mock.calls[0][0].data.metadata.barcode).toBe("Peter Griffin");
  });

  it.each(["create", "edit"])("releases a legacy archived code on %s", async (action) => {
    if (action === "edit") mocks.itemFindUnique.mockResolvedValueOnce({ id: "current", barcode: "Mulan" });
    mocks.itemFindUnique.mockResolvedValueOnce({ id: "old", barcode: "Peter Griffin", archivedAt: new Date() });
    if (action === "create") await createItem({ name: "T8i", barcode: "Peter Griffin" });
    else await updateItem({ id: "current", barcode: "Peter Griffin" });
    expect(mocks.itemUpdate).toHaveBeenCalledWith({
      where: { id: "old" }, data: { barcode: expect.stringMatching(/^Peter Griffin \[archived .+\]$/) }
    });
    if (action === "create") expect(mocks.itemCreate).toHaveBeenCalledWith({ data: { name: "T8i", barcode: "Peter Griffin" } });
    else expect(mocks.itemUpdate).toHaveBeenCalledWith({ where: { id: "current" }, data: { barcode: "Peter Griffin" } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("still rejects editing to another active item's code", async () => {
    mocks.itemFindUnique.mockResolvedValueOnce({ id: "current", barcode: "Mulan" })
      .mockResolvedValueOnce({ id: "other", barcode: "Peter Griffin", archivedAt: null });
    await expect(updateItem({ id: "current", barcode: "Peter Griffin" })).rejects.toThrow("CONFLICT");
    expect(mocks.itemUpdate).not.toHaveBeenCalled();
  });
});
