import { NextResponse } from "next/server";
import { buildCalendarFeedForUser } from "@/src/server/calendar-feed";
import { verifyCalendarFeedToken } from "@/src/server/calendar-feed-token";

/**
 * Personal calendar feed (public route: calendar apps can't send cookies). The token in the path
 * is the credential; anything invalid, tampered or for a removed account is a plain 404.
 */
function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token.endsWith(".ics")) return notFound();
  const userId = verifyCalendarFeedToken(token.slice(0, -".ics".length));
  if (!userId) return notFound();

  try {
    const body = await buildCalendarFeedForUser(userId);
    if (body === null) return notFound();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="infocus.ics"',
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex"
      }
    });
  } catch (error) {
    console.error("calendar feed: build failed", error);
    return new NextResponse("Calendar feed unavailable", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
