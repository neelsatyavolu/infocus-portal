import { NextResponse } from "next/server";
import { applyUserDisplayNames } from "@/src/lib/user-display";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data: applyUserDisplayNames(data) }, { status });
}

export function okUnmapped<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

/** Public data the CDN may cache for `seconds`, then serve stale while it refreshes. */
export function okPublicCached<T>(data: T, seconds: number) {
  return NextResponse.json(
    { data },
    { headers: { "Cache-Control": `public, max-age=60, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}` } }
  );
}

/** For responses carrying secrets: never stored by browsers or proxies. */
export function okNoStore<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status, headers: { "Cache-Control": "no-store, private" } });
}

export function fail(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      error: {
        message,
        details
      }
    },
    { status }
  );
}
