import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { markMasterCalendarEdited } from "@/src/server/master-calendar-sync";
import { isMonthKey, loadMasterCalendarMonth } from "@/src/server/master-calendar-data";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const payloadSchema = z.object({
  date: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
  content: z.string().max(20_000)
});

function isValidDateKey(dateKey: string) {
  const [yearStr, monthStr, dayStr] = dateKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const normalized = candidate.toISOString().slice(0, 10);
  return normalized === dateKey;
}

function sanitizeContent(raw: string) {
  // Step 1: Sanitize with allowlist (includes div to preserve browser-generated structure)
  const cleaned = sanitizeHtml(raw, {
    allowedTags: ["p", "div", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li", "span"],
    allowedAttributes: {
      span: ["class", "data-package-id", "data-display-label"]
    },
    allowedClasses: {
      span: ["package-pill"]
    },
    disallowedTagsMode: "discard"
  });

  // Step 2: Normalize div tags to p tags (calendar expects p-based structure)
  const normalized = cleaned
    .replace(/<div>/gi, "<p>")
    .replace(/<\/div>/gi, "</p>");

  return normalized.trim();
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    const { searchParams } = new URL(request.url);
    const month = monthSchema.safeParse(searchParams.get("month"));
    if (!month.success || !isMonthKey(month.data)) {
      return fail("Invalid month. Use YYYY-MM.", 400);
    }

    return ok(await loadMasterCalendarMonth(month.data, access.role));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const parsed = payloadSchema.parse(await request.json());
    if (!isValidDateKey(parsed.date)) {
      return fail("Invalid date.", 400);
    }

    const content = sanitizeContent(parsed.content);

    if (!content) {
      await prisma.masterCalendarEntry.deleteMany({
        where: {
          date: parsed.date
        }
      });
      await markMasterCalendarEdited(parsed.date);

      return ok({ date: parsed.date, deleted: true });
    }

    const entry = await prisma.masterCalendarEntry.upsert({
      where: {
        date: parsed.date
      },
      create: {
        date: parsed.date,
        content
      },
      update: {
        content
      }
    });
    await markMasterCalendarEdited(parsed.date);

    return ok({
      date: entry.date,
      content: entry.content,
      updatedAt: entry.updatedAt.toISOString()
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
