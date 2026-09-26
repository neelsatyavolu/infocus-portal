import { ImageResponse } from "next/og";
import { describe, expect, it } from "vitest";
import { THUMBNAIL_FORMATS, THUMBNAIL_SIZES, THUMBNAIL_TEMPLATES, thumbnailQuerySchema } from "@/src/lib/live/thumbnail";
import { loadThumbnailAssets, renderThumbnail } from "@/src/server/live-thumbnail";

describe("live thumbnail rendering", () => {
  for (const template of THUMBNAIL_TEMPLATES) {
    for (const format of THUMBNAIL_FORMATS) {
      it(`renders ${template} as a ${format} PNG`, async () => {
        const query = thumbnailQuerySchema.parse({
          template,
          format,
          away: "Sacred Heart Prep",
          line: "Varsity Boys Basketball",
          title: "Spring Musical: Into the Woods",
          location: "Paly Gym",
          date: "2026-10-02",
          time: "19:00"
        });
        const size = THUMBNAIL_SIZES[format];
        const response = new ImageResponse(renderThumbnail(query, await loadThumbnailAssets()), size);
        const bytes = new Uint8Array(await response.arrayBuffer());
        expect(Array.from(bytes.slice(1, 4)).map((byte) => String.fromCharCode(byte)).join("")).toBe("PNG");
        const view = new DataView(bytes.buffer);
        expect([view.getUint32(16), view.getUint32(20)]).toEqual([size.width, size.height]);
      }, 30_000);
    }
  }
});
