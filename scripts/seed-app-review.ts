/**
 * Creates or refreshes the Apple App Review sample for the InFocus Portal iPhone app:
 * the review account (APP_REVIEW_EMAIL), a workspace only it can see ("App Review Sample"),
 * and one project of sample image cards with review comments. Fictional names only; the
 * images are drawn here, so nothing touches InFocus Drive or Bunny. Safe to run again.
 *
 *   npx tsx scripts/seed-app-review.ts            # create or refresh (reads APP_REVIEW_EMAIL)
 *   npx tsx scripts/seed-app-review.ts --remove   # delete the account and its workspace
 *
 * Its name never contains "InFocus": the canonical-workspace fallback matches that word.
 */
import { deflateSync, crc32 } from "node:zlib";
import { appReviewEmail } from "@/src/lib/app-review";
import { IMAGE_BUNNY_LIBRARY_SENTINEL } from "@/src/lib/media-assets";
import { prisma } from "@/src/lib/prisma";
import { createSyntheticImageVideoId } from "@/src/server/media-assets-server";

const WORKSPACE_SLUG = "app-review-sample";
const WORKSPACE_NAME = "App Review Sample";
const PROJECT_NAME = "Sample package: Club Fair (Abby, Otto & Sage)";

type Rgb = [number, number, number];
type Rect = { x: number; y: number; w: number; h: number; color: Rgb };

const INK: Rgb = [0x0f, 0x11, 0x0f];
const INK_2: Rgb = [0x1a, 0x1d, 0x1a];
const GREEN: Rgb = [0x0b, 0x6e, 0x3e];
const SOFT_WHITE: Rgb = [0xec, 0xef, 0xea];
const RED: Rgb = [0xee, 0x3a, 0x2a];

/** Two flat brand mockups, 1280×720: a lower third over a dark frame, and a poster layout. */
const SAMPLES: { title: string; rects: Rect[]; comments: { at: [number, number]; body: string }[] }[] = [
  {
    title: "Lower third mockup",
    rects: [
      { x: 0, y: 0, w: 1280, h: 720, color: INK_2 },
      { x: 150, y: 520, w: 64, h: 64, color: INK },
      { x: 214, y: 520, w: 520, h: 64, color: INK },
      { x: 214, y: 584, w: 520, h: 36, color: GREEN },
      { x: 240, y: 544, w: 300, h: 16, color: SOFT_WHITE },
      { x: 240, y: 596, w: 180, h: 12, color: SOFT_WHITE }
    ],
    comments: [
      { at: [0.33, 0.78], body: "Nice and readable. Can the name plate start a beat later, after the shot settles?" },
      { at: [0.12, 0.76], body: "Keep the logo tile square here, like the other lower thirds." }
    ]
  },
  {
    title: "Club Fair poster (draft)",
    rects: [
      { x: 0, y: 0, w: 1280, h: 720, color: GREEN },
      { x: 80, y: 80, w: 560, h: 560, color: INK },
      { x: 700, y: 140, w: 480, h: 40, color: SOFT_WHITE },
      { x: 700, y: 220, w: 360, h: 24, color: SOFT_WHITE },
      { x: 700, y: 268, w: 400, h: 24, color: SOFT_WHITE },
      { x: 1140, y: 600, w: 40, h: 40, color: RED }
    ],
    comments: [{ at: [0.72, 0.22], body: "Add the date and the Quad under the title so people know when and where." }]
  }
];

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A flat-color RGB PNG, later rectangles drawn on top of earlier ones. */
export function drawPng(width: number, height: number, rects: Rect[]) {
  const pixels = Buffer.alloc(height * (width * 3 + 1));
  const topFirst = [...rects].reverse();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = topFirst.find((rect) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h)?.color ?? INK;
      pixels.set(color, y * (width * 3 + 1) + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

async function seed(email: string) {
  const existing = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { name: "App Review", onboardingCompletedAt: new Date() } })
    : await prisma.user.create({ data: { id: `email_${email}`, email, name: "App Review", onboardingCompletedAt: new Date() } });

  // Only direct members see a SPECIFIC_MEMBERS workspace with no visibility list.
  const workspace = await prisma.workspace.upsert({
    where: { slug: WORKSPACE_SLUG },
    update: { name: WORKSPACE_NAME, visibility: "SPECIFIC_MEMBERS" },
    create: { slug: WORKSPACE_SLUG, name: WORKSPACE_NAME, visibility: "SPECIFIC_MEMBERS", createdById: user.id }
  });
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role: "REVIEWER" },
    create: { workspaceId: workspace.id, userId: user.id, role: "REVIEWER" }
  });

  const project =
    (await prisma.project.findFirst({ where: { workspaceId: workspace.id, name: PROJECT_NAME } })) ??
    (await prisma.project.create({
      data: { workspaceId: workspace.id, name: PROJECT_NAME, description: "Sample work for App Review. Every name here is fictional." }
    }));

  for (const sample of SAMPLES) {
    if (await prisma.mediaItem.findFirst({ where: { projectId: project.id, title: sample.title, deletedAt: null } })) continue;
    const imageBase64 = drawPng(1280, 720, sample.rects).toString("base64");
    await prisma.$transaction(async (tx) => {
      const item = await tx.mediaItem.create({ data: { projectId: project.id, title: sample.title } });
      const version = await tx.mediaVersion.create({
        data: {
          mediaItemId: item.id,
          versionNumber: 1,
          bunnyVideoId: createSyntheticImageVideoId(),
          bunnyLibraryId: IMAGE_BUNNY_LIBRARY_SENTINEL,
          sourceType: "IMAGE",
          imageMimeType: "image/png",
          imageBase64,
          status: "READY",
          width: 1280,
          height: 720
        }
      });
      await tx.mediaItem.update({ where: { id: item.id }, data: { currentVersionId: version.id } });
      for (const comment of sample.comments) {
        await tx.reviewComment.create({
          data: {
            mediaVersionId: version.id,
            targetType: "FRAME_PIN",
            timeSeconds: 0,
            xPct: comment.at[0],
            yPct: comment.at[1],
            body: comment.body
          }
        });
      }
    });
  }
  console.log(`App Review sample ready: workspace "${WORKSPACE_NAME}", project "${PROJECT_NAME}", ${SAMPLES.length} items.`);
}

async function remove(email: string) {
  await prisma.workspace.deleteMany({ where: { slug: WORKSPACE_SLUG } });
  const { count } = await prisma.user.deleteMany({ where: { email } });
  console.log(`Removed the App Review workspace and ${count} account.`);
}

async function main() {
  const email = appReviewEmail();
  if (!email) throw new Error("Set APP_REVIEW_EMAIL first (the same value as in Vercel).");
  await (process.argv.includes("--remove") ? remove(email) : seed(email));
}

if (process.argv[1]?.endsWith("seed-app-review.ts")) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
