import { describe, expect, it } from "vitest";
import { fitSignature, parseSignatureImage, SIGNATURE_MAX_LENGTH } from "@/src/lib/signature-image";

/** The first 24 bytes of a PNG (signature + IHDR width/height): all the parser reads. */
function pngHeader(width: number, height: number) {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

const dataUrl = (bytes: Buffer) => `data:image/png;base64,${bytes.toString("base64")}`;

describe("drawn signature images", () => {
  it("reads the PNG size from a data URL", () => {
    const src = dataUrl(pngHeader(880, 220));
    expect(parseSignatureImage(src)).toEqual({ src, width: 880, height: 220 });
  });

  it("rejects anything that isn't a reasonable PNG data URL", () => {
    expect(parseSignatureImage(`data:image/jpeg;base64,${pngHeader(10, 10).toString("base64")}`)).toBeNull();
    expect(parseSignatureImage("data:image/png;base64,not base64!")).toBeNull();
    expect(parseSignatureImage(dataUrl(Buffer.from("GIF89a-but-long-enough-to-check")))).toBeNull();
    expect(parseSignatureImage(dataUrl(pngHeader(0, 10)))).toBeNull();
    expect(parseSignatureImage(dataUrl(pngHeader(5000, 10)))).toBeNull();
    expect(parseSignatureImage(`data:image/png;base64,${"A".repeat(SIGNATURE_MAX_LENGTH)}`)).toBeNull();
  });

  it("fits a signature inside its box without stretching it", () => {
    const wide = { src: "", width: 880, height: 110 };
    const tall = { src: "", width: 200, height: 400 };
    expect(fitSignature(wide, { width: 440, height: 100 })).toEqual({ width: 440, height: 55 });
    expect(fitSignature(tall, { width: 440, height: 100 })).toEqual({ width: 50, height: 100 });
  });
});
