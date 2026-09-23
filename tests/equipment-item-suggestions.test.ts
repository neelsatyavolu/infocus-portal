import { describe, expect, it } from "vitest";
import { matchingEquipmentItems } from "@/src/lib/equipment-item-suggestions";
const items = [
  { id: "1", name: "Peter's camera", barcode: "CAM-01" },
  { id: "2", name: "Microphone", barcode: "MIC-02" },
  { id: "3", name: "Camera", barcode: "CAM-03" }
];
describe("equipment code suggestions", () => {
  it("matches partial codes without case sensitivity", () => {
    expect(matchingEquipmentItems(items, " cam-0 ", []).map((item) => item.barcode)).toEqual(["CAM-01", "CAM-03"]);
  });
  it("matches names and returns the actual inventory code", () => {
    expect(matchingEquipmentItems(items, "peter", [])[0]?.barcode).toBe("CAM-01");
  });
  it("excludes codes already added", () => {
    expect(matchingEquipmentItems(items, "cam", ["CAM-01"]).map((item) => item.barcode)).toEqual(["CAM-03"]);
  });
  it("does not show suggestions for an empty query or an unknown code", () => {
    expect(matchingEquipmentItems(items, " ", [])).toEqual([]);
    expect(matchingEquipmentItems(items, "unknown", [])).toEqual([]);
  });
});


it("keeps multiword codes distinct when they share a first word", () => {
  const items = [
    { id: "1", name: "Camera", barcode: "peter griffin" },
    { id: "2", name: "Microphone", barcode: "peter pan" }
  ];
  expect(matchingEquipmentItems(items, "peter", [])).toEqual(items);
  expect(matchingEquipmentItems(items, "peter pan", [])).toEqual([items[1]]);
  expect(matchingEquipmentItems(items, "peter", ["peter griffin"])).toEqual([items[1]]);
});
