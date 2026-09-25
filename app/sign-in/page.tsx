import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Chrome, Lock } from "lucide-react";
import { getSessionUser, hasGoogleOAuthConfig, sanitizeReturnTo } from "@/src/lib/auth";
import { EquipmentPasskeyButton } from "@/components/equipment-passkeys";
import { EmailSignInForm } from "./email-sign-in-form";
import {
  canBypassHubMaintenance,
  HUB_MAINTENANCE_MODE
} from "@/src/lib/maintenance";
import { getPlatformRoleForEmail } from "@/src/lib/platform-admin";
import { signInPageTitle } from "@/src/lib/sign-in-title";

type SignInPageProps = {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
};

export async function generateMetadata({ searchParams }: SignInPageProps): Promise<Metadata> {
  const { returnTo } = await searchParams;
  const title = signInPageTitle(returnTo);
  return { title, openGraph: { title } };
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
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-10">
      <section className="relative w-full overflow-hidden rounded-2xl border border-border bg-card p-8">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-30" />
        <div className="relative">
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-[var(--brand-green)]/40 bg-[var(--brand-green)]/15 text-[var(--brand-green)]">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="eyebrow flex items-center gap-2">
            <span className="rec-dot rec-dot-red" aria-hidden="true" />
            Authenticated access
          </div>
          <h1 className="display-md mt-2 text-foreground">Sign in to InFocus Portal</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Use your registered email to access packages, grades, and the master calendar.
          </p>

          {errorMessage ? (
            <p className="mt-4 rounded-lg border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3">
            {googleConfigured ? (
              <>
                <a
                  href={googleSignInHref}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground text-background text-sm font-semibold transition hover:bg-foreground/90"
                >
                  <Chrome className="h-4 w-4 text-[#4285F4]" aria-hidden="true" />
                  Continue with Google
                </a>
                <p className="text-center text-sm text-muted-foreground">or sign in with email</p>
              </>
            ) : null}
            {safeReturnTo === "/equipment/manage" ? <EquipmentPasskeyButton purpose="login" /> : null}
            <EmailSignInForm returnTo={safeReturnTo} />
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Workspace access granted by your producer.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
