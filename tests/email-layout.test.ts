import { describe, expect, it } from "vitest";
import { EMAIL_BRAND, escapeHtml, renderBrandedEmail } from "@/src/lib/email-layout";

describe("branded email layout", () => {
  it("wraps copy in the InFocus dark shell", () => {
    const { html, text } = renderBrandedEmail({
      heading: "Ready for adviser review",
      paragraphs: ["Lee-Patel (Cycle 1) is ready for adviser review."],
      ctaLabel: "Open in Groups",
      ctaUrl: "https://infocuspaly.com/groups/row_1/initial-cut",
      preview: "Ready for adviser review"
    });

    expect(html).toContain(EMAIL_BRAND.green);
    expect(html).toContain(EMAIL_BRAND.ink);
    expect(html).toContain("infocus-wordmark.png");
    expect(html).toContain("Ready for adviser review");
    expect(html).toContain("Open in Groups");
    expect(html).toContain("https://infocuspaly.com/groups/row_1/initial-cut");
    expect(html).toContain("Notification settings");
    expect(html).toContain("InFocus Portal");
    expect(html).toContain('alt="InFocus Portal"');
    expect(text).toContain("Ready for adviser review");
    expect(text).toContain("Open in Groups: https://infocuspaly.com/groups/row_1/initial-cut");
  });

  it("escapes user-provided HTML", () => {
    expect(escapeHtml(`A <b>cut</b> & "notes"`)).toBe("A &lt;b&gt;cut&lt;/b&gt; &amp; &quot;notes&quot;");
    const { html } = renderBrandedEmail({
      heading: `<script>alert(1)</script>`,
      paragraphs: [`Hello <img src=x onerror=alert(1)>`],
      ctaLabel: "Open",
      ctaUrl: "https://infocuspaly.com/initial-cut"
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
  });
});
