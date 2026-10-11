import { describe, expect, it } from "vitest";
import { IDEA_FEEDS, parseFeed, type IdeaFeed } from "@/src/lib/idea-feeds";

const feed: IdeaFeed = { name: "Example Daily", url: "https://news.example.com/feed/", kind: "news" };

function rss(items: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Example</title>${items}</channel></rss>`;
}

describe("the feed list", () => {
  it("is https only, with no feed listed twice", () => {
    expect(IDEA_FEEDS.length).toBeGreaterThan(10);
    expect(IDEA_FEEDS.every((entry) => entry.url.startsWith("https://"))).toBe(true);
    expect(new Set(IDEA_FEEDS.map((entry) => entry.url)).size).toBe(IDEA_FEEDS.length);
    expect(new Set(IDEA_FEEDS.map((entry) => entry.name)).size).toBe(IDEA_FEEDS.length);
    expect(IDEA_FEEDS.some((entry) => entry.kind === "events")).toBe(true);
  });
});

describe("parseFeed", () => {
  it("reads title, link, summary and date from plain and CDATA items", () => {
    const items = parseFeed(rss(`
      <item>
        <title>City council votes on bike lanes</title>
        <link>https://news.example.com/bike-lanes</link>
        <description>The council meets Monday.</description>
        <pubDate>Fri, 09 Oct 2026 21:07:30 +0000</pubDate>
      </item>
      <item>
        <title><![CDATA[Library&#8217;s new teen room opens ]]>
        </title>
        <link><![CDATA[https://news.example.com/teen-room]]>
        </link>
        <description><![CDATA[ <p>Students helped <b>design</b> the space &amp; pick the books.</p> ]]></description>
        <pubDate><![CDATA[Sat, 10 Oct 2026 15:00:00 +0000]]>
        </pubDate>
      </item>`), feed);

    expect(items).toEqual([
      {
        outlet: "Example Daily",
        kind: "news",
        title: "City council votes on bike lanes",
        summary: "The council meets Monday.",
        url: "https://news.example.com/bike-lanes",
        publishedAt: "2026-10-09T21:07:30.000Z"
      },
      {
        outlet: "Example Daily",
        kind: "news",
        title: "Library’s new teen room opens",
        summary: "Students helped design the space & pick the books.",
        url: "https://news.example.com/teen-room",
        publishedAt: "2026-10-10T15:00:00.000Z"
      }
    ]);
  });

  it("handles a feed with a single item and a UT time zone", () => {
    const items = parseFeed(rss(`
      <item>
        <title>Only story</title>
        <link>https://news.example.com/only</link>
        <pubDate>Fri, 9 Oct 2026 23:20:27 UT</pubDate>
      </item>`), feed);
    expect(items).toHaveLength(1);
    expect(items[0].publishedAt).toBe("2026-10-09T23:20:27.000Z");
    expect(items[0].summary).toBe("");
  });

  it("skips items with no title, an unsafe link, or no readable date", () => {
    const items = parseFeed(rss(`
      <item><title></title><link>https://news.example.com/a</link><pubDate>Fri, 09 Oct 2026 21:00:00 +0000</pubDate></item>
      <item><title>Script link</title><link>javascript:alert(1)</link><pubDate>Fri, 09 Oct 2026 21:00:00 +0000</pubDate></item>
      <item><title>No date</title><link>https://news.example.com/c</link></item>
      <item><title>Bad date</title><link>https://news.example.com/d</link><pubDate>someday</pubDate></item>
      <item><title>Kept</title><link>https://news.example.com/e</link><pubDate>Fri, 09 Oct 2026 21:00:00 +0000</pubDate></item>`), feed);
    expect(items.map((item) => item.title)).toEqual(["Kept"]);
  });

  it("shortens long summaries and drops the WordPress footer line", () => {
    const long = "Students gathered downtown. ".repeat(30);
    const [first, second] = parseFeed(rss(`
      <item><title>Long</title><link>https://news.example.com/long</link><description>${long}</description><pubDate>Fri, 09 Oct 2026 21:00:00 +0000</pubDate></item>
      <item><title>Footer</title><link>https://news.example.com/footer</link><description><![CDATA[<p>A short summary.</p><p>The post Footer appeared first on Example Daily.</p>]]></description><pubDate>Fri, 09 Oct 2026 21:00:00 +0000</pubDate></item>`), feed);
    expect(first.summary.length).toBeLessThanOrEqual(220);
    expect(first.summary.endsWith("…")).toBe(true);
    expect(second.summary).toBe("A short summary.");
  });

  it("cleans an enormous field quickly instead of scanning all of it", () => {
    const hostile = "&lt;".repeat(300_000);
    const started = Date.now();
    const [parsed] = parseFeed(rss(`
      <item><title>Huge</title><link>https://news.example.com/huge</link><description>${hostile}</description><pubDate>Fri, 09 Oct 2026 21:00:00 +0000</pubDate></item>`), feed);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(parsed.title).toBe("Huge");
    expect(parsed.summary.length).toBeLessThanOrEqual(220);
  });

  it("returns nothing for a page that is not a feed", () => {
    expect(parseFeed("<html><body>Blocked</body></html>", feed)).toEqual([]);
    expect(parseFeed("", feed)).toEqual([]);
  });
});
