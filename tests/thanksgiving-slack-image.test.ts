import { describe, expect, it } from "vitest";
import { EMPTY_HARVEST, type RankedEntry } from "@/src/lib/thanksgiving-board";
import { HARVEST_IMAGE_SIZE, renderHarvestSlackImage } from "@/src/server/thanksgiving-slack-image";

function row(name: string, rank: number, counts: Partial<RankedEntry>): RankedEntry {
  return { ...EMPTY_HARVEST, bonus: 0, userId: name, name, rank, total: 0, ...counts };
}

describe("renderHarvestSlackImage", () => {
  it("renders the top five as a PNG at the image size", async () => {
    const bytes = await renderHarvestSlackImage({
      rows: [
        row("Abby", 1, { leaves: 212, goldenLeaves: 3, pies: 18, bonus: 40, total: 285 }),
        row("Otto", 2, { leaves: 190, pies: 30, pardons: 2, total: 222 }),
        row("Sage", 3, { leaves: 120, wishbones: 1, giantTurkeys: 1, total: 122 }),
        row("Player Four", 4, { leaves: 80, total: 80 }),
        row("Player Five", 5, { pies: 12, total: 12 })
      ],
      title: "Top 5",
      stamp: "THU NOV 5 · 6:00 PM",
      footer: "First at 11:59 PM Thu, Nov 5 wins 2 extension days for their whole package group."
    });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect([...bytes.slice(1, 4)].map((code) => String.fromCharCode(code)).join("")).toBe("PNG");
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([HARVEST_IMAGE_SIZE.width, HARVEST_IMAGE_SIZE.height]);
  }, 60_000);
});
