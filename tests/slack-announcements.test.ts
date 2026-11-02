import { describe, expect, it } from "vitest";
import {
  formatSlackTimestamp,
  groupSlackAnnouncements,
  isSlackAnnouncementMessage,
  serializeSlackAnnouncement,
  slackFileAttachments,
  slackMrkdwnParts,
  slackMrkdwnToPlain,
  slackPermalink,
  type SlackAnnouncementItem
} from "@/src/lib/slack-announcements";

describe("slack announcement copy", () => {
  it("converts Slack markup to plain text", () => {
    expect(
      slackMrkdwnToPlain("<!channel> See <https://example.com|the form> and <@U123|Alex>.", {
        U123: "Alex Lee"
      })
    ).toBe("@channel See the form and @Alex.");
  });

  it("skips join noise and keeps class posts", () => {
    expect(isSlackAnnouncementMessage({ ts: "1", subtype: "channel_join", text: "joined" })).toBe(false);
    expect(
      isSlackAnnouncementMessage({ ts: "1", text: "<!channel> Manager applications are due Tuesday." })
    ).toBe(true);
  });

  it("builds permalinks and date groups", () => {
    expect(slackPermalink("C0BEQV4DUCR", "1756500000.123456")).toBe(
      "https://infocusnews.slack.com/archives/C0BEQV4DUCR/p1756500000123456"
    );
    const stamped = formatSlackTimestamp("1756501200.000000");
    const item: SlackAnnouncementItem = {
      id: "1",
      ts: "1756501200.000000",
      authorName: "Alex Lee",
      authorImageUrl: null,
      text: "Hello",
      parts: [{ type: "text", value: "Hello" }],
      attachments: [],
      permalink: "https://example.com",
      ...stamped
    };
    expect(groupSlackAnnouncements([item, { ...item, id: "2" }])).toHaveLength(1);
    expect(groupSlackAnnouncements([item, { ...item, id: "3", dateLabel: "Other" }])).toHaveLength(2);
  });

  it("keeps Slack links as clickable parts", () => {
    const parts = slackMrkdwnParts(
      "Fill out <https://forms.gle/abc|https://forms.gle/abc> today."
    );
    expect(parts).toEqual([
      { type: "text", value: "Fill out " },
      { type: "link", href: "https://forms.gle/abc", label: "https://forms.gle/abc" },
      { type: "text", value: " today." }
    ]);
  });

  it("serializes decoded file attachments separately", () => {
    expect(
      slackFileAttachments([
        {
          id: "F123",
          name: "InFocus Course Guide & Rules - 2026-27.pdf",
          title: "InFocus Course Guide &amp; Rules - 2026-27.pdf",
          pretty_type: "PDF"
        }
      ])
    ).toEqual([
      { id: "F123", title: "InFocus Course Guide & Rules - 2026-27.pdf", prettyType: "PDF" }
    ]);

    const item = serializeSlackAnnouncement(
      {
        ts: "1756501200.000000",
        user: "U1",
        text: "<!channel> Fill this out.",
        files: [{ id: "F123", name: "manager-form.pdf", title: "manager-form.pdf", pretty_type: "PDF" }]
      },
      "C0BEQV4DUCR",
      { U1: { name: "Alex Lee", imageUrl: "https://example.com/a.png" } }
    );
    expect(item?.authorName).toBe("Alex Lee");
    expect(item?.text).toBe("@channel Fill this out.");
    expect(item?.attachments).toEqual([{ id: "F123", title: "manager-form.pdf", prettyType: "PDF" }]);
  });

  it("turns Slack emoji shortcodes into emoji", () => {
    expect(slackMrkdwnToPlain("Done :white_check_mark: :birthday: Happy birthday")).toBe(
      "Done \u2705\uFE0F \u{1F382}\uFE0F Happy birthday"
    );
    expect(slackMrkdwnToPlain(":+1::skin-tone-3: thanks :smiling_face_with_3_hearts:")).toBe(
      "\u{1F44D}\u{1F3FC} thanks \u{1F970}\uFE0F"
    );
  });

  it("leaves custom emoji, times and links alone", () => {
    expect(slackMrkdwnToPlain("Meet at 6:17 :party-parrot:")).toBe("Meet at 6:17 :party-parrot:");
    expect(slackMrkdwnParts("See https://example.com/:smile:/x")).toEqual([
      { type: "text", value: "See " },
      { type: "link", href: "https://example.com/:smile:/x", label: "https://example.com/:smile:/x" }
    ]);
  });

  it("marks image attachments with their size", () => {
    expect(
      slackFileAttachments([
        { id: "F9", name: "happy-birthday.gif", mimetype: "image/gif", pretty_type: "GIF", original_w: 480, original_h: 270 },
        { id: "F8", name: "logo.svg", mimetype: "image/svg+xml", pretty_type: "SVG", original_w: 10, original_h: 10 },
        { id: "F7", name: "photo.png", mimetype: "image/png", pretty_type: "PNG" }
      ])
    ).toEqual([
      { id: "F9", title: "happy-birthday.gif", prettyType: "GIF", image: { width: 480, height: 270 } },
      { id: "F8", title: "logo.svg", prettyType: "SVG" },
      { id: "F7", title: "photo.png", prettyType: "PNG" }
    ]);
  });
});
