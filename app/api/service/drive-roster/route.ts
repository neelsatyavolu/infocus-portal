import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
}

function serviceConfigured() {
  return Boolean((process.env.DRIVE_SERVICE_TOKEN || "").trim());
}

function bearerOk(request: Request) {
  const expected = (process.env.DRIVE_SERVICE_TOKEN || "").trim();
  const auth = request.headers.get("authorization") || "";
  if (!expected || !auth.toLowerCase().startsWith("bearer ")) {
    return false;
  }
  const got = auth.slice(7).trim();
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!serviceConfigured()) {
    return NextResponse.json({ error: { message: "Service token not configured" } }, { status: 503 });
  }
  if (!bearerOk(request)) {
    return unauthorized();
  }

  const users = await prisma.user.findMany({
    where: { email: { not: null } },
    orderBy: [{ email: "asc" }],
    select: { email: true, name: true }
  });

  const seen = new Set<string>();
  const roster = [];
  for (const row of users) {
    const email = (row.email || "").trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) {
      continue;
    }
    seen.add(email);
    roster.push({ email, name: row.name || "" });
  }

  return NextResponse.json({ users: roster });
}
