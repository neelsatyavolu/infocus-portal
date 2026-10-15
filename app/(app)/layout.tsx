import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InitialNavStatusProvider } from "@/components/shell/use-nav-status";
import { TeleprompterShell } from "@/components/teleprompter-shell";
import { isAppReviewEmail } from "@/src/lib/app-review";
import { getRealSessionUser, getSessionUser, requireUserId, syncUserProfile } from "@/src/lib/auth";
import { EMBEDDED_APP_COOKIE } from "@/src/lib/embedded-app";
import { resolveAppSurface } from "@/src/lib/hosts";
import { startInitialNavStatus } from "@/src/server/nav-status";
import { hasSharedVaultEntries } from "@/src/server/password-vault";
import { hasTeleprompterKioskCookie } from "@/src/server/teleprompter-access";
import {
  canBypassHubMaintenance,
  HUB_MAINTENANCE_MODE
} from "@/src/lib/maintenance";
import { getPlatformRoleForEmail, hasPlatformRole } from "@/src/lib/platform-admin";
import { userDisplayName } from "@/src/lib/user-display";
import { canControlViewAs } from "@/src/lib/view-as";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireUserId().catch(() => null);
  const headerStore = await headers();
  const surface =
    (headerStore.get("x-infocus-surface") as "main" | "grades" | "teleprompter" | null) ??
    resolveAppSurface(headerStore.get("x-infocus-host") ?? headerStore.get("host"));

  if (!userId) {
    if (surface === "teleprompter" && (await hasTeleprompterKioskCookie())) {
      return <TeleprompterShell>{children}</TeleprompterShell>;
    }
    if (headerStore.get("x-infocus-class-board") === "1") {
      return <div className="h-dvh overflow-hidden bg-background">{children}</div>;
    }
    redirect("/sign-in" as never);
  }

  let shell: Awaited<ReturnType<typeof loadShell>>;
  try {
    shell = await loadShell(userId, surface);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/access-denied" as never);
    }

    throw error;
  }

  if (shell.teleprompter) {
    return <TeleprompterShell>{children}</TeleprompterShell>;
  }

  return (
    <InitialNavStatusProvider value={shell.initialNavStatus}>
      <AppShell
        platformRole={shell.platformRole}
        currentUser={shell.currentUser}
        canViewAs={shell.canViewAs}
        viewingAs={shell.viewingAs}
        hasSharedPasswords={shell.hasSharedPasswords}
        sampleOnly={shell.sampleOnly}
        embedded={shell.embedded}
      >
        {children}
      </AppShell>
    </InitialNavStatusProvider>
  );
}

/**
 * The signed-in person's shell: role, View as, the maintenance and onboarding redirects, and what
 * the sidebar needs. Data only; the layout renders it outside its try/catch.
 */
async function loadShell(userId: string, surface: string) {
  // Warm the per-request role cache with the session email while the profile syncs. The
  // role below is still looked up by user.email; it reuses this only when the strings match.
  void getSessionUser()
    .then((session) => (session?.email ? getPlatformRoleForEmail(session.email) : null))
    .catch(() => null);
  // Needs only the user id, so it runs beside the profile and role lookups (awaited below,
  // where it's used; the no-op catch only keeps an early redirect from leaving it unhandled).
  const sharedVaultPromise = surface === "teleprompter" ? Promise.resolve(false) : hasSharedVaultEntries(userId);
  sharedVaultPromise.catch(() => undefined);
  const [user, realSession] = await Promise.all([syncUserProfile(userId), getRealSessionUser()]);
  const viewingAs = Boolean(realSession && realSession.userId !== userId);
  // Only look up a second role while viewing as someone else; otherwise it is the same person.
  const [platformRole, viewerRole] = await Promise.all([
    getPlatformRoleForEmail(user.email),
    viewingAs && realSession ? getPlatformRoleForEmail(realSession.email) : null
  ]);
  const realRole = viewingAs ? viewerRole : platformRole;
  const canViewAs = canControlViewAs(realSession?.email);

  if (
    HUB_MAINTENANCE_MODE &&
    !canBypassHubMaintenance(platformRole, user.email) &&
    !canBypassHubMaintenance(realRole, realSession?.email)
  ) {
    redirect("/maintenance" as never);
  }

  if (user.email && !user.onboardingCompletedAt && !viewingAs) {
    redirect("/onboarding" as never);
  }

  const currentUser = {
    name: userDisplayName(user) || user.name,
    email: user.email,
    imageUrl: user.imageUrl
  };

  // Dedicated full-screen app on teleprompter.infocuspaly.com — no main sidebar.
  if (surface === "teleprompter") {
    return { teleprompter: true } as const;
  }

  // Producers always see Passwords; anyone else only once an exec shares a login with them.
  const embedded = (await cookies()).get(EMBEDDED_APP_COOKIE)?.value === "1";
  // The sidebar's first statuses stream in with the page (not awaited here). The embedded app
  // shows no sidebar, so it skips them.
  const initialNavStatus = embedded ? null : startInitialNavStatus({ userId, role: platformRole }, user.email);
  const hasSharedPasswords =
    !viewingAs && !hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER") && (await sharedVaultPromise);

  return {
    teleprompter: false,
    initialNavStatus,
    platformRole,
    currentUser,
    canViewAs,
    viewingAs,
    hasSharedPasswords,
    sampleOnly: isAppReviewEmail(user.email),
    embedded
  } as const;
}
