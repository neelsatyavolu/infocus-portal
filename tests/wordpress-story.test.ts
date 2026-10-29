import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(), categories: vi.fn(), upload: vi.fn(), draft: vi.fn(), schedule: vi.fn(), find: vi.fn(), chat: vi.fn(), ai: vi.fn(),
  staffNames: vi.fn(), createStaffName: vi.fn(), users: vi.fn()
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: { youtubePublication: { update: mocks.update }, user: { findMany: mocks.users } } }));
vi.mock("@/src/server/workers-ai", () => ({ workersAiConfig: mocks.ai, workersAiJsonChat: mocks.chat }));
vi.mock("@/src/server/wordpress-client", async (original) => ({
  ...await original<typeof import("@/src/server/wordpress-client")>(),
  listWordpressCategories: mocks.categories, uploadWordpressImage: mocks.upload, createWordpressDraft: mocks.draft,
  scheduleWordpressPost: mocks.schedule, findWordpressPostByVideo: mocks.find,
  listWordpressStaffNames: mocks.staffNames, createWordpressStaffName: mocks.createStaffName
}));
import { buildCategoryMessages, findStaffName, parseCategoryReply, tossReporterNames, pickableCategories, storyMeta, storySchedule, youtubeThumbnailUrls } from "@/src/lib/wordpress-story";
import { youtubeEmbedCode } from "@/src/lib/youtube-publication";
import { advanceWordpressStory } from "@/src/server/wordpress-story";
import { wordpressConfig } from "@/src/server/wordpress-client";

const CATEGORIES = [
  { id: 1, name: "Uncategorized", slug: "uncategorized" }, { id: 6, name: "Features", slug: "features" },
  { id: 7, name: "News", slug: "news" }, { id: 147, name: "Featured Stories", slug: "featured-stories" },
  { id: 123, name: "PSA &amp; Others", slug: "psa-abd-others" }
];
const VIDEO = "abcdefgh_12";

describe("story helpers", () => {
  it("goes live at 9:05 AM Pacific on the show date, across daylight saving", () => {
    expect(storySchedule("2026-10-27", new Date("2026-10-26T12:00:00Z"))).toEqual({ status: "future", at: new Date("2026-10-27T16:05:00Z") });
    expect(storySchedule("2026-11-03", new Date("2026-11-01T12:00:00Z")).at).toEqual(new Date("2026-11-03T17:05:00Z"));
  });
  it("publishes right away once 9:05 has passed", () => {
    const now = new Date("2026-10-27T17:30:00Z");
    expect(storySchedule("2026-10-27", now)).toEqual({ status: "publish", at: now });
  });
  it("embeds the video above the story and hides the thumbnail on the story page", () => {
    expect(storyMeta(VIDEO, ["Abby Lane", "Otto Reyes"])).toEqual({ video: youtubeEmbedCode(VIDEO), videolocation: "Above Story",
      featureimage: "Do Not Display", writer: ["Abby Lane", "Otto Reyes"] });
    expect(storyMeta(VIDEO).writer).toEqual([]);
    expect(youtubeThumbnailUrls(VIDEO)[0]).toBe(`https://i.ytimg.com/vi/${VIDEO}/maxresdefault.jpg`);
    expect(() => youtubeThumbnailUrls("../bad")).toThrow();
  });
  it("only offers real story categories, and only accepts one of them", () => {
    const pickable = pickableCategories(CATEGORIES);
    expect(pickable.map((category) => category.id)).toEqual([6, 7, 123]);
    expect(buildCategoryMessages({ title: "Downtown Game Shop", topic: "Card shop", toss: "", showDate: "2026-10-27" }, pickable).user)
      .toContain("- 123: PSA & Others");
    expect(parseCategoryReply('{"categoryId": 6}', pickable)).toBe(6);
    expect(parseCategoryReply('{"categoryId": 147}', pickable)).toBeNull();
    expect(parseCategoryReply("not json", pickable)).toBeNull();
  });
  it("matches a member to the site's byline by full name, or by first and last name", () => {
    const staff = [{ id: 1, name: "Abby Lane" }, { id: 2, name: "Otto Q. Reyes" }, { id: 3, name: "S&amp;ge Ruiz" }];
    expect(findStaffName("  abby   LANE ", staff)?.id).toBe(1);
    expect(findStaffName("Otto Reyes", staff)?.id).toBe(2);
    expect(findStaffName("Abby Marie Lane", staff)?.id).toBe(1);
    expect(findStaffName("Abby Stone", staff)).toBeNull();
    expect(findStaffName("", staff)).toBeNull();
  });
  it("reads the reporters the toss names", () => {
    expect(tossReporterNames("Nobody knew. InFocus reporters Abby Lane, Otto Q Reyes, and Sage Ruiz have more.")).toEqual(["Abby Lane", "Otto Q Reyes", "Sage Ruiz"]);
    expect(tossReporterNames("InFocus reporter Abby Lane and Otto Reyes spoke with Paly students.")).toEqual(["Abby Lane", "Otto Reyes"]);
    expect(tossReporterNames("InFocus reporters Abby Lane & Otto Reyes found out more")).toEqual(["Abby Lane", "Otto Reyes"]);
    expect(tossReporterNames("InFocus reporter Abby Lane. Then Otto Reyes spoke.")).toEqual(["Abby Lane"]);
    expect(tossReporterNames("Abby Lane went to find out more.")).toEqual([]);
  });
});

describe("wordpressConfig", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is off until the site, user and application password are set", () => {
    vi.stubEnv("WORDPRESS_URL", "https://news.example.edu/");
    vi.stubEnv("WORDPRESS_USERNAME", "portal");
    vi.stubEnv("WORDPRESS_APP_PASSWORD", "");
    expect(wordpressConfig()).toBeNull();
    vi.stubEnv("WORDPRESS_APP_PASSWORD", "abcd efgh");
    vi.stubEnv("DRIVE_SERVICE_TOKEN", "");
    expect(wordpressConfig()).toEqual({ baseUrl: "https://news.example.edu", authorization: `Basic ${btoa("portal:abcd efgh")}`, relay: null });
    vi.stubEnv("WORDPRESS_URL", "http://news.example.edu");
    expect(wordpressConfig()).toBeNull();
  });
  it("sends the site's requests through Drive when Drive is set up", async () => {
    vi.stubEnv("WORDPRESS_URL", "https://news.example.edu");
    vi.stubEnv("WORDPRESS_USERNAME", "portal");
    vi.stubEnv("WORDPRESS_APP_PASSWORD", "abcd efgh");
    vi.stubEnv("DRIVE_BASE_URL", "https://drive.example.edu/");
    vi.stubEnv("DRIVE_SERVICE_TOKEN", "drive-token");
    const fetch = vi.fn(async () => Response.json(CATEGORIES));
    vi.stubGlobal("fetch", fetch);
    const client = await vi.importActual<typeof import("@/src/server/wordpress-client")>("@/src/server/wordpress-client");
    await expect(client.listWordpressCategories(wordpressConfig()!)).resolves.toEqual(CATEGORIES);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://drive.example.edu/api/service/wordpress/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,description");
    expect(init.headers).toMatchObject({ Authorization: "Bearer drive-token", "X-Wordpress-Authorization": `Basic ${btoa("portal:abcd efgh")}` });
    vi.unstubAllGlobals();
  });
});

describe("advanceWordpressStory", () => {
  const publication = { id: "pub", title: "Downtown Game Shop", showDate: "2026-10-27", videoId: VIDEO,
    wordpressPostId: null, wordpressMediaId: null, wordpressCategoryId: null, wordpressAttempts: 0 };
  const context = { topic: "Card shop", toss: "A new card shop opened downtown.", writers: ["Abby Lane", "Otto Reyes"] };
  const now = new Date("2026-10-26T20:00:00Z");
  const savedDraft = { id: 900, link: "https://news.example.edu/?p=900", status: "draft", meta: storyMeta(VIDEO) };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WORDPRESS_URL", "https://news.example.edu");
    vi.stubEnv("WORDPRESS_USERNAME", "portal");
    vi.stubEnv("WORDPRESS_APP_PASSWORD", "abcd efgh");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("maxresdefault")
      ? new Response("missing", { status: 404 })
      : new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })));
    mocks.update.mockResolvedValue({});
    mocks.categories.mockResolvedValue(CATEGORIES);
    mocks.ai.mockReturnValue({ accountId: "a", token: "t" });
    mocks.chat.mockResolvedValue({ content: '{"categoryId": 6}' });
    mocks.upload.mockResolvedValue(55);
    mocks.find.mockResolvedValue(null);
    mocks.draft.mockResolvedValue(savedDraft);
    mocks.staffNames.mockResolvedValue([{ id: 31, name: "Abby Lane" }, { id: 32, name: "Sage Ruiz" }]);
    mocks.createStaffName.mockResolvedValue(33);
    mocks.users.mockResolvedValue([{ name: "Abby Lane" }, { name: "Remy Marie Cole" }]);
    mocks.schedule.mockResolvedValue({ ...savedDraft, status: "future", link: "https://news.example.edu/downtown-game-shop/" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("drafts the story with the AI category and thumbnail, then schedules it for 9:05", async () => {
    const outcome = await advanceWordpressStory(publication, context, now);
    expect(mocks.upload).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ filename: `infocus-${VIDEO}.jpg`, title: "Downtown Game Shop" }));
    expect(mocks.draft).toHaveBeenCalledWith(expect.anything(),
      { title: "Downtown Game Shop", categories: [6], writers: [31, 33], featuredMedia: 55, meta: storyMeta(VIDEO, ["Abby Lane", "Otto Reyes"]) });
    expect(mocks.createStaffName).toHaveBeenCalledExactlyOnceWith(expect.anything(), "Otto Reyes");
    expect(mocks.schedule).toHaveBeenCalledWith(expect.anything(), 900, { status: "future", dateGmt: "2026-10-27T16:05:00" });
    expect(outcome).toEqual({ status: "POSTED", postId: 900, url: "https://news.example.edu/downtown-game-shop/",
      editUrl: "https://news.example.edu/wp-admin/post.php?post=900&action=edit", publishAt: new Date("2026-10-27T16:05:00Z") });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "pub" }, data: { wordpressPostId: 900 } });
  });

  it("adds reporters the toss names who are missing from the roster, when the site or the Portal knows them", async () => {
    const toss = "InFocus reporters Abby Lane, Sage Ruiz, Remy Cole and Kai Typo have more.";
    mocks.createStaffName.mockResolvedValueOnce(33).mockResolvedValueOnce(34);
    await advanceWordpressStory(publication, { ...context, toss }, now);
    expect(mocks.draft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ writers: [31, 33, 32, 34],
      meta: storyMeta(VIDEO, ["Abby Lane", "Otto Reyes", "Sage Ruiz", "Remy Marie Cole"]) }));
    expect(mocks.createStaffName.mock.calls.map(([, name]) => name)).toEqual(["Otto Reyes", "Remy Marie Cole"]);
  });

  it("posts without bylines when the package has no members", async () => {
    await advanceWordpressStory(publication, { ...context, writers: [] }, now);
    expect(mocks.staffNames).not.toHaveBeenCalled();
    expect(mocks.draft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ writers: [], meta: storyMeta(VIDEO) }));
  });

  it("files under News when the model's answer is unusable", async () => {
    mocks.chat.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await advanceWordpressStory(publication, context, now);
    expect(mocks.draft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ categories: [7] }));
  });

  it("reuses saved progress and an existing draft instead of posting twice", async () => {
    mocks.find.mockResolvedValue(savedDraft);
    await advanceWordpressStory({ ...publication, wordpressCategoryId: 7, wordpressMediaId: 55 }, context, now);
    expect(mocks.categories).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(mocks.schedule).toHaveBeenCalledWith(expect.anything(), 900, expect.anything());
    mocks.find.mockClear();
    await advanceWordpressStory({ ...publication, wordpressCategoryId: 7, wordpressMediaId: 55, wordpressPostId: 900 }, context, now);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("never schedules a draft whose SNO video field did not save", async () => {
    mocks.draft.mockResolvedValue({ ...savedDraft, meta: { footnotes: "" } });
    const outcome = await advanceWordpressStory(publication, context, now);
    expect(outcome).toEqual({ status: "FAILED", error: expect.stringContaining("did not save the video embed code") });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("retries site errors, then gives up so managers can post it by hand", async () => {
    mocks.categories.mockRejectedValue(new (await import("@/src/server/wordpress-client")).WordpressError("infocusnews.tv returned HTTP 500", 500));
    expect(await advanceWordpressStory(publication, context, now)).toBeNull();
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "pub" }, data: { wordpressAttempts: 1, wordpressError: "infocusnews.tv returned HTTP 500" } });
    expect(await advanceWordpressStory({ ...publication, wordpressAttempts: 4 }, context, now))
      .toEqual({ status: "FAILED", error: "infocusnews.tv returned HTTP 500" });
  });
});
