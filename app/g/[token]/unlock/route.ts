import { NextResponse } from "next/server";
import { isGuestLinkActive, issueGuestCredential, verifyPasscode } from "@/src/lib/guest-links";
import { prisma } from "@/src/lib/prisma";
import { getClientIp } from "@/src/lib/rate-limit";
import { checkSharedRateLimit } from "@/src/server/shared-rate-limit";
import {
  GUEST_PASSCODE_ATTEMPT_LIMIT,
  GUEST_PROOF_COOKIE,
  guestProofCookieOptions,
  isGuestTokenShape
} from "../guest-proof-cookie";

/**
 * The guest page's passcode form posts here. A right passcode sets a signed, link-scoped cookie
 * and sends the guest back to the page; anything else goes back with `?error=`. Like the page,
 * the reply never says whether the link exists, is active or has a passcode.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isGuestTokenShape(token)) {
    return NextResponse.redirect(new URL("/", request.url), 303);
  }
  const page = new URL(`/g/${token}`, request.url);
  const back = (error?: "passcode" | "limit") => {
    if (error) page.searchParams.set("error", error);
    return NextResponse.redirect(page, 303);
  };

  const rate = await checkSharedRateLimit(
    `guest-passcode:${token}:${getClientIp(request)}`,
    GUEST_PASSCODE_ATTEMPT_LIMIT
  );
  if (!rate.allowed) {
    return back("limit");
  }

  const form = await request.formData().catch(() => null);
  const passcode = form?.get("passcode");
  if (typeof passcode !== "string" || passcode.length === 0 || passcode.length > 40) {
    return back("passcode");
  }

  const link = await prisma.guestLink.findUnique({
    where: { token },
    select: { id: true, token: true, passcodeHash: true, revokedAt: true, expiresAt: true }
  });
  if (!link || !isGuestLinkActive(link) || !link.passcodeHash || !verifyPasscode(passcode, link.passcodeHash)) {
    return back("passcode");
  }

  const response = back();
  response.cookies.set(
    GUEST_PROOF_COOKIE,
    issueGuestCredential({ id: link.id, token: link.token, passcodeHash: link.passcodeHash }),
    guestProofCookieOptions(token)
  );
  return response;
}
