import { prisma } from "@/src/lib/prisma";
import { buildCategoryMessages, FALLBACK_CATEGORY_SLUG, findStaffName, parseCategoryReply, pickableCategories, samePerson, storyMeta,
  storySchedule, tossReporterNames, youtubeThumbnailUrls, type WordpressStaffName } from "@/src/lib/wordpress-story";
import { createWordpressDraft, createWordpressStaffName, findWordpressPostByVideo, listWordpressCategories, listWordpressStaffNames,
  scheduleWordpressPost, uploadWordpressImage, wordpressConfig, WordpressError, type WordpressConfig } from "@/src/server/wordpress-client";
import { workersAiConfig, workersAiJsonChat } from "@/src/server/workers-ai";

const MAX_ATTEMPTS = 5;
const CATEGORY_MAX_TOKENS = 600;

type StoryPublication = {
  id: string; title: string; showDate: string; videoId: string;
  wordpressPostId: number | null; wordpressMediaId: number | null; wordpressCategoryId: number | null; wordpressAttempts: number;
};
/** `writers`: the package members' names, for the story's bylines. */
type StoryContext = { topic: string; toss: string; writers: string[] };

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
      const draft = await findWordpressPostByVideo(config, publication.videoId) ?? await createDraft(config, publication, categoryId, mediaId, context);
      if (typeof draft.meta?.video !== "string" || !draft.meta.video.includes(publication.videoId)) {
        throw new StoryError(`infocusnews.tv did not save the video embed code, so draft ${draft.id} was left unpublished. SNO must let the API set story fields.`);
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

async function createDraft(config: WordpressConfig, publication: StoryPublication, categoryId: number | null, mediaId: number, context: StoryContext) {
  const bylines = await writerBylines(config, context);
  return createWordpressDraft(config, {
    title: publication.title, categories: categoryId === null ? [] : [categoryId], writers: bylines.map((byline) => byline.id),
    featuredMedia: mediaId, meta: storyMeta(publication.videoId, bylines.map((byline) => byline.name))
  });
}

/**
 * Bylines for the members, adding one for anyone the site doesn't have yet, plus reporters the toss names who are not on the
 * roster. A toss name is only credited when the site or the Portal already knows the person, so a typo never becomes a byline.
 */
async function writerBylines(config: WordpressConfig, context: StoryContext) {
  const fromToss = tossReporterNames(context.toss).filter((name) => !context.writers.some((member) => samePerson(member, name)));
  if (!context.writers.length && !fromToss.length) return [];
  const staffNames = await listWordpressStaffNames(config);
  const bylines: WordpressStaffName[] = [];
  for (const name of context.writers) {
    bylines.push(findStaffName(name, staffNames) ?? { id: await createWordpressStaffName(config, name), name });
  }
  const unknown = fromToss.filter((name) => !findStaffName(name, staffNames));
  const users = unknown.length
    ? (await prisma.user.findMany({ where: { name: { not: null } }, select: { name: true } })).flatMap(({ name }) => name ? [{ id: 0, name }] : [])
    : [];
  for (const name of fromToss) {
    const staff = findStaffName(name, staffNames);
    const user = staff ? null : findStaffName(name, users);
    if (staff) bylines.push(staff);
    else if (user) bylines.push({ id: await createWordpressStaffName(config, user.name), name: user.name });
  }
  return bylines.filter((byline, index) => bylines.findIndex((other) => other.id === byline.id) === index);
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
