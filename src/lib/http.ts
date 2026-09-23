import { NextResponse } from "next/server";
import { applyUserDisplayNames } from "@/src/lib/user-display";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data: applyUserDisplayNames(data) }, { status });
}

export function okUnmapped<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
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
