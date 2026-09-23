import { describe, expect, it } from "vitest";
import { commentPayloadSchema, extractMentionUserIds } from "@/src/lib/comments";

describe("Comment payload validation", () => {
  const base = {
    mediaVersionId: "ckx1234567890123456789012",
    targetType: "TIMECODE" as const,
    timeSeconds: 10,
    body: "Looks good"
  };

  it("accepts timecode comments", () => {
    const parsed = commentPayloadSchema.parse(base);
    expect(parsed.targetType).toBe("TIMECODE");
  });

  it("requires frame fields for frame pin comments", () => {
    expect(() =>
      commentPayloadSchema.parse({
        ...base,
        targetType: "FRAME_PIN"
      })
    ).toThrow();

    const parsed = commentPayloadSchema.parse({
      ...base,
      targetType: "FRAME_PIN",
      frameNumber: 10,
      xPct: 25,
      yPct: 40
    });

    expect(parsed.frameNumber).toBe(10);
  });

  it("accepts general review comments without timeSeconds", () => {
    const parsed = commentPayloadSchema.parse({
      mediaVersionId: "ckx1234567890123456789012",
      targetType: "GENERAL",
      body: "Overall the edit looks great"
    });
    expect(parsed.targetType).toBe("GENERAL");
    expect(parsed.timeSeconds).toBeUndefined();
  });

  it("rejects timecode comments without timeSeconds", () => {
    expect(() =>
      commentPayloadSchema.parse({
        mediaVersionId: "ckx1234567890123456789012",
        targetType: "TIMECODE",
        body: "Missing time"
      })
    ).toThrow();
  });

  it("extracts mention ids from mention token format", () => {
    expect(extractMentionUserIds("Please review @[user_123|Ari] and @[user_456|Sam]")).toEqual([
      "user_123",
      "user_456"
    ]);
  });
});
