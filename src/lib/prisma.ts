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
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  }).$extends({
    name: "hide-app-review-user",
    query: {
      user: {
        findMany: ({ args, query }) => query(withoutAppReviewUser(args)),
        count: ({ args, query }) => query(withoutAppReviewUser(args ?? {}))
      }
    }
  });
  return client as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
