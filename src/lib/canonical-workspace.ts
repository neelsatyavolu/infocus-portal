import { prisma } from "@/src/lib/prisma";

/** Single workspace for the program. Multi-workspace UI is retired. */
export const CANONICAL_WORKSPACE_SLUG = "infocus-news";
export const CANONICAL_WORKSPACE_NAME = "InFocus News";

/**
 * Resolve the one workspace the app uses. Prefers slug `infocus-news`, then
 * name match, then oldest workspace (bootstrap). Creates one if the DB is empty.
 */
export async function getCanonicalWorkspace() {
  const bySlug = await prisma.workspace.findUnique({
    where: { slug: CANONICAL_WORKSPACE_SLUG }
  });
  if (bySlug) {
    return bySlug;
  }

  const byName = await prisma.workspace.findFirst({
    where: {
      OR: [
        { name: { equals: CANONICAL_WORKSPACE_NAME, mode: "insensitive" } },
        { name: { contains: "InFocus", mode: "insensitive" } }
      ]
    },
    orderBy: { createdAt: "asc" }
  });
  if (byName) {
    return byName;
  }

  const first = await prisma.workspace.findFirst({
    orderBy: { createdAt: "asc" }
  });
  if (first) {
    return first;
  }

  return prisma.workspace.create({
    data: {
      name: CANONICAL_WORKSPACE_NAME,
      slug: CANONICAL_WORKSPACE_SLUG
    }
  });
}

export async function getCanonicalWorkspaceId() {
  const workspace = await getCanonicalWorkspace();
  return workspace.id;
}
