import { describe, expect, it } from "vitest";
import { birthdayGifFrames } from "@/src/lib/birthday-slack";
import { BIRTHDAY_GIF_SIZE, renderBirthdayGif } from "@/src/server/birthday-slack-gif";

describe("renderBirthdayGif", () => {
  it("renders a looping GIF at the card size with every frame", async () => {
    const bytes = await renderBirthdayGif("Abby & Otto");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe("GIF89a");
    expect([view.getUint16(6, true), view.getUint16(8, true)]).toEqual([BIRTHDAY_GIF_SIZE.width, BIRTHDAY_GIF_SIZE.height]);
    // One image descriptor (0x2C after a graphic control block) per frame.
    let frames = 0;
    for (let i = 0; i < bytes.length - 8; i += 1) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04 && bytes[i + 8] === 0x2c) frames += 1;
    }
    expect(frames).toBe(birthdayGifFrames().length);
    expect(bytes.byteLength).toBeLessThan(2_000_000);
  }, 120_000);
});
