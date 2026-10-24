import { prisma } from "@/src/lib/prisma";
import { buildCategoryMessages, FALLBACK_CATEGORY_SLUG, parseCategoryReply, pickableCategories, storyMeta, storySchedule,
  youtubeThumbnailUrls } from "@/src/lib/wordpress-story";
import { createWordpressDraft, findWordpressPostByVideo, listWordpressCategories, scheduleWordpressPost, uploadWordpressImage,
  wordpressConfig, WordpressError, type WordpressConfig } from "@/src/server/wordpress-client";
import { workersAiConfig, workersAiJsonChat } from "@/src/server/workers-ai";

const MAX_ATTEMPTS = 5;
const CATEGORY_MAX_TOKENS = 600;

type StoryPublication = {
  id: string; title: string; showDate: string; videoId: string;
  wordpressPostId: number | null; wordpressMediaId: number | null; wordpressCategoryId: number | null; wordpressAttempts: number;
};
type StoryContext = { topic: string; toss: string };

/** What the caller commits together with the manager emails once the story is settled. */
export type StoryOutcome =
  | { status: "POSTED"; postId: number; url: string; editUrl: string; publishAt: Date }
  | { status: "FAILED"; error: string };

class StoryError extends Error {}

/**
 * One attempt at the package's infocusnews.tv story. Saves its progress (category, thumbnail, draft) as it goes,
 * and returns the outcome once the story is scheduled or has failed for good, or null to retry on the next pass.
 */
export async function advanceWordpressStory(publication: StoryPublication, context: StoryContext, now = new Date()): Promise<StoryOutcome | null> {
  const config = wordpressConfig();
  if (!config) return { status: "FAILED", error: "Posting to infocusnews.tv is no longer configured." };
  const save = (data: { wordpressCategoryId?: number; wordpressMediaId?: number; wordpressPostId?: number }) =>
    prisma.youtubePublication.update({ where: { id: publication.id }, data });
  try {
    const categoryId = publication.wordpressCategoryId ?? await chooseCategory(config, publication, context);
    if (categoryId !== null && publication.wordpressCategoryId === null) await save({ wordpressCategoryId: categoryId });
    const mediaId = publication.wordpressMediaId ?? await uploadThumbnail(config, publication);
    if (publication.wordpressMediaId === null) await save({ wordpressMediaId: mediaId });

    let postId = publication.wordpressPostId;
    if (postId === null) {
      // A lost response can leave a draft this user already made for the video.
      const draft = await findWordpressPostByVideo(config, publication.videoId) ?? await createWordpressDraft(config, {
        title: publication.title, categories: categoryId === null ? [] : [categoryId], featuredMedia: mediaId, meta: storyMeta(publication.videoId)
      });
      if (typeof draft.meta?.video !== "string" || !draft.meta.video.includes(publication.videoId)) {
        throw new StoryError(`infocusnews.tv did not save the video embed, so draft ${draft.id} was left unpublished. SNO must let the API set story fields.`);
      }
      postId = draft.id;
      await save({ wordpressPostId: postId });
    }
    const schedule = storySchedule(publication.showDate, now);
    const post = await scheduleWordpressPost(config, postId, { status: schedule.status, dateGmt: schedule.at.toISOString().slice(0, 19) });
    return { status: "POSTED", postId, url: post.link, editUrl: `${config.baseUrl}/wp-admin/post.php?post=${postId}&action=edit`, publishAt: schedule.at };
  } catch (error) {
    const attempts = publication.wordpressAttempts + 1;
    const message = error instanceof StoryError || error instanceof WordpressError
      ? error.message : "Posting to infocusnews.tv was interrupted.";
    if (error instanceof StoryError || attempts >= MAX_ATTEMPTS) return { status: "FAILED", error: message };
    await prisma.youtubePublication.update({ where: { id: publication.id }, data: { wordpressAttempts: attempts, wordpressError: message } });
    return null;
  }
}

/** The model's pick from the site's categories, else News. Null only when the site has no News category. */
async function chooseCategory(config: WordpressConfig, publication: StoryPublication, context: StoryContext) {
  const categories = pickableCategories(await listWordpressCategories(config));
  const ai = workersAiConfig();
  if (ai) {
    try {
      const reply = await workersAiJsonChat(ai, { ...buildCategoryMessages({ ...context, title: publication.title, showDate: publication.showDate }, categories),
        maxTokens: CATEGORY_MAX_TOKENS });
      const picked = parseCategoryReply(reply.content, categories);
      if (picked !== null) return picked;
    } catch (error) {
      console.error("wordpress story: category pick failed", { publicationId: publication.id, error });
    }
  }
  return categories.find((category) => category.slug === FALLBACK_CATEGORY_SLUG)?.id ?? null;
}

async function uploadThumbnail(config: WordpressConfig, publication: StoryPublication) {
  for (const url of youtubeThumbnailUrls(publication.videoId)) {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) continue;
    return uploadWordpressImage(config, {
      bytes: await response.arrayBuffer(), filename: `infocus-${publication.videoId}.jpg`, title: publication.title
    });
  }
  throw new WordpressError("YouTube has no thumbnail for this video yet.");
}
