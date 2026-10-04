import { describe, expect, it } from "vitest";
import { buildCommentsCsv } from "@/src/lib/comment-export-csv";
import { parseImportedCommentsCsv } from "@/src/lib/comment-import-csv";
import type { ReviewCommentDto } from "@/src/lib/types";

function comment(overrides: Partial<ReviewCommentDto>): ReviewCommentDto {
  return {
    id: "c1",
    mediaVersionId: "v1",
    body: "Trim the intro",
    authorId: "u1",
    authorName: "Abby",
    timeSeconds: 2,
    frameNumber: 60,
    xPct: null,
    yPct: null,
    targetType: "TIMECODE",
    createdAt: new Date(2026, 9, 4, 14, 5, 9).toISOString(),
    resolvedAt: null,
    parentCommentId: null,
    ...overrides
  };
}

describe("buildCommentsCsv", () => {
  it("writes a header and puts replies under their parent", () => {
    const csv = buildCommentsCsv([
      comment({ id: "late", body: "Color pass", timeSeconds: 10, frameNumber: 300 }),
      comment({ id: "reply", body: "Done", authorName: "Otto", parentCommentId: "early" }),
      comment({ id: "early", body: "Trim the intro", resolvedAt: new Date().toISOString() })
    ]);
    const lines = csv.trimEnd().split("\r\n");

    expect(lines[0]).toBe("#,Commenter,Comment,Timecode,Frame,Commented At,Reply,Resolved");
    expect(lines[1]).toBe("1,Abby,Trim the intro,00:00:02:00,60,2026-10-04 2:05:09 PM,No,Yes");
    expect(lines[2]).toMatch(/^1,Otto,Done,/);
    expect(lines[2]).toMatch(/,Yes,Yes$/);
    expect(lines[3]).toMatch(/^2,Abby,Color pass,00:00:10:00,300,/);
  });

  it("lists general comments without a timecode", () => {
    const csv = buildCommentsCsv([comment({ targetType: "GENERAL", timeSeconds: 0, frameNumber: null, body: "Great cut" })]);

    expect(csv.split("\r\n")[1]).toBe("1,Abby,Great cut,,,2026-10-04 2:05:09 PM,No,No");
  });

  it("quotes commas, quotes and newlines, and defuses formulas", () => {
    const csv = buildCommentsCsv([comment({ body: "Say \"hi\", then\nwave" }), comment({ id: "c2", body: "=HYPERLINK(1)" })]);

    expect(csv).toContain("\"Say \"\"hi\"\", then\nwave\"");
    expect(csv).toContain(",'=HYPERLINK(1),");
  });

  it("round-trips through the CSV importer", () => {
    const csv = buildCommentsCsv([
      comment({ body: "Trim, please" }),
      comment({ id: "r", body: "ok", parentCommentId: "c1" })
    ]);
    const parsed = parseImportedCommentsCsv(csv);

    expect(parsed.comments).toHaveLength(1);
    expect(parsed.comments[0]).toMatchObject({ body: "Trim, please", frameNumber: 60 });
    expect(parsed.comments[0].createdAt.getTime()).toBe(new Date(2026, 9, 4, 14, 5, 9).getTime());
  });
});
