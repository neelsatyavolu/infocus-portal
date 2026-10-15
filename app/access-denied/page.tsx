import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ENTRY_FOOTER_CONTROL } from "@/components/public-entry/entry-panel";
import { PublicFrame } from "@/components/public-entry/public-frame";
import { getSessionUser } from "@/src/lib/auth";
import { normalizeEmail } from "@/src/lib/platform-admin";
import { cn } from "@/src/lib/utils";
import { AccessRequestButton } from "@/components/access-request-button";

type AccessDeniedPageProps = {
  searchParams: Promise<{
    email?: string;
    name?: string;
  }>;
};

export const metadata: Metadata = { title: "Access restricted" };

export default async function AccessDeniedPage({ searchParams }: AccessDeniedPageProps) {
  const [session, params] = await Promise.all([getSessionUser(), searchParams]);
  const fallbackEmail = normalizeEmail(params.email);
  const requestEmail = session?.email ?? (fallbackEmail.includes("@") ? fallbackEmail : null);
  const requestName = session?.name ?? params.name?.trim() ?? null;
  // The Google callback adds ?email= for an address that isn't on Portal. Without it, this is a
  // member who opened a producer-only page, or someone taken off the roster (the app layout sends
  // them here too), so the line covers both. The page can't tell those two apart, so it offers no
  // way back into the app (it would loop for someone taken off the roster) and leads with the request.
  const notOnPortal = Boolean(params.email?.trim());

  return (
    <PublicFrame width="narrow">
      <PageHeader
        eyebrow="InFocus Portal"
        title="Access restricted"
        description={
          notOnPortal
            ? "Your email is not on InFocus Portal yet."
            : "Your account can’t open that page, or isn’t on InFocus Portal yet."
        }
      />
      <AccessRequestButton
        email={requestEmail}
        name={requestName}
        footer={
          <>
            <span>{`${requestEmail ? "Or ask" : "Ask"} a producer to add you in Admin → People.`}</span>
            {session ? (
              <form action="/api/auth/sign-out?returnTo=/" method="post" className="ml-auto">
                <button type="submit" className={ENTRY_FOOTER_CONTROL}>
                  Sign out
                </button>
              </form>
            ) : (
              <Link href="/" className={cn(ENTRY_FOOTER_CONTROL, "ml-auto")}>
                Back home
              </Link>
            )}
          </>
        }
      />
    </PublicFrame>
  );
}
