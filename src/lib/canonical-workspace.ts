import { prisma } from "@/src/lib/prisma";

/** Single workspace for the program. Multi-workspace UI is retired. */
export const CANONICAL_WORKSPACE_SLUG = "infocus-news";
export const CANONICAL_WORKSPACE_NAME = "InFocus News";

/**
 * The resolved id is effectively constant (one program workspace), so it is remembered
 * per server instance for a few minutes instead of re-running up to three lookups on
 * every call. The TTL bounds staleness if a workspace is ever renamed, added or removed.
 */
const CANONICAL_ID_TTL_MS = 5 * 60 * 1000;
let canonicalIdMemo: { id: string; at: number } | null = null;

/**
 * Resolve the one workspace the app uses. Prefers slug `infocus-news`, then
 * name match, then oldest workspace (bootstrap). Creates one if the DB is empty.
 */
export async function getCanonicalWorkspace() {
  const workspace = await resolveCanonicalWorkspace();
  canonicalIdMemo = { id: workspace.id, at: Date.now() };
  return workspace;
}

async function resolveCanonicalWorkspace() {
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
  if (canonicalIdMemo && Date.now() - canonicalIdMemo.at < CANONICAL_ID_TTL_MS) {
    return canonicalIdMemo.id;
  }
  const workspace = await getCanonicalWorkspace();
  return workspace.id;
}

/** Tests only: forget the remembered id. */
export function resetCanonicalWorkspaceMemo() {
  canonicalIdMemo = null;
}
