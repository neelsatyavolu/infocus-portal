import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/kit/alert";
import { PageHeader } from "@/components/page-header";
import { PublicFrame } from "@/components/public-entry/public-frame";
import { ASSISTANT_PLACES } from "@/src/lib/assistant-places";
import { getSessionUser, hasGoogleOAuthConfig, sanitizeReturnTo } from "@/src/lib/auth";
import {
  canBypassHubMaintenance,
  HUB_MAINTENANCE_MODE
} from "@/src/lib/maintenance";
import { getPlatformRoleForEmail } from "@/src/lib/platform-admin";
import { signInPageTitle } from "@/src/lib/sign-in-title";
import { SignInMethods } from "./sign-in-methods";

type SignInPageProps = {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
};

export async function generateMetadata({ searchParams }: SignInPageProps): Promise<Metadata> {
  const { returnTo } = await searchParams;
  const title = signInPageTitle(returnTo);
  return { title: { absolute: title }, openGraph: { title } };
}

/**
 * "Continue to Grades" when the link opens a known Portal place, otherwise "Sign in". Only labels
 * from ASSISTANT_PLACES are shown, never words taken from the URL.
 */
function destinationEyebrow(returnTo?: string) {
  const value = (returnTo ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return "Sign in";
  const segment = value.slice(1).split(/[/?#]/)[0].toLowerCase();
  const place = ASSISTANT_PLACES.find((entry) => !entry.external && entry.href === `/${segment}`);
  return place ? `Continue to ${place.label}` : "Sign in";
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const [{ returnTo, error }, session] = await Promise.all([searchParams, getSessionUser()]);
  const safeReturnTo = sanitizeReturnTo(returnTo);

  if (session) {
    if (HUB_MAINTENANCE_MODE) {
      const role = await getPlatformRoleForEmail(session.email);
      if (!canBypassHubMaintenance(role, session.email)) {
        redirect("/maintenance" as never);
      }
    }
    redirect(safeReturnTo as never);
  }

  const errorMessage = error ? "Could not complete Google sign-in. Please sign in with email below." : null;
  const googleConfigured = hasGoogleOAuthConfig();
  const googleSignInHref = `/api/auth/google/start?returnTo=${encodeURIComponent(safeReturnTo)}`;

  return (
    <PublicFrame width="narrow">
      <PageHeader
        eyebrow={destinationEyebrow(returnTo)}
        title="Sign in to InFocus Portal"
        description="Use your registered email to access packages, grades, and the master calendar."
      />
      {errorMessage ? <Alert tone="danger" className="md:px-6">{errorMessage}</Alert> : null}
      <SignInMethods
        googleHref={googleConfigured ? googleSignInHref : null}
        showPasskey={safeReturnTo === "/equipment/manage"}
        returnTo={safeReturnTo}
      />
    </PublicFrame>
  );
}
