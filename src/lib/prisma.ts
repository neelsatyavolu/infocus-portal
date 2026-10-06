import { type Prisma, PrismaClient } from "@prisma/client";
import { appReviewEmail } from "@/src/lib/app-review";

/**
 * The App Review demo account (src/lib/app-review.ts) never appears in people lists: rosters,
 * pickers, cast randomizers, gradebooks, counts. Direct lookups (findUnique/findFirst) still
 * find it, so it can sign in. `email: null` is kept explicitly: SQL `NOT (email = x)` drops NULLs.
 */
export function withoutAppReviewUser<T extends { where?: Prisma.UserWhereInput }>(args: T, email = appReviewEmail()): T {
  if (!email) return args;
  const hide: Prisma.UserWhereInput = { OR: [{ email: null }, { NOT: { email: { equals: email, mode: "insensitive" } } }] };
  return { ...args, where: args.where ? { AND: [args.where, hide] } : hide };
}

// A query-only extension leaves every method's shape unchanged, so the client keeps its plain
// PrismaClient type (code across the app passes it and its transactions as PrismaClient).
function createPrismaClient(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Image versions keep the whole file as base64 (up to ~13 MB) and every list/stage query that
    // includes versions would drag it along. Leave it out by default; the image route and project
    // download ask for it with an explicit `select: { imageBase64: true }`, which still works.
    // uploadSignature is write-only (set at upload init, never read back).
    omit: { mediaVersion: { imageBase64: true, uploadSignature: true } }
  });
  // Client bundles reach this file through shared libs (platform-admin). The browser PrismaClient
  // stub throws on any property access, so `$extends` there would crash every page on load.
  if (typeof window !== "undefined") return base as unknown as PrismaClient;
  const client = base.$extends({
    name: "hide-app-review-user",
    query: {
      user: {
        findMany: ({ args, query }) => query(withoutAppReviewUser(args)),
        count: ({ args, query }) => query(withoutAppReviewUser(args ?? {}))
      }
    }
  });
  // The cast also drops the global `omit` from the types: imageBase64 still type-checks on full
  // rows but is undefined at runtime unless the query selects it.
  return client as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
