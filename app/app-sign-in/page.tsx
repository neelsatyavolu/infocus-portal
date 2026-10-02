import type { Metadata } from "next";
import { MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRealSessionUser, getSessionUser } from "@/src/lib/auth";
import { APP_STATE, PKCE_CHALLENGE } from "@/src/server/app-sign-in";

export const metadata: Metadata = { title: "Sign in to the InFocus app" };

type AppSignInPageProps = {
  searchParams: Promise<{ challenge?: string; state?: string }>;
};

/** Opened by the InFocus Mac or iPhone app in a browser sheet; signed-out visitors go through /sign-in first (middleware). */
export default async function AppSignInPage({ searchParams }: AppSignInPageProps) {
  const [{ challenge = "", state = "" }, real, session] = await Promise.all([
    searchParams,
    getRealSessionUser(),
    getSessionUser()
  ]);
  const validLink = PKCE_CHALLENGE.test(challenge) && APP_STATE.test(state);
  const viewingAs = Boolean(real && session && session.userId !== real.userId);
  const who = real?.name?.trim() || real?.email || "your account";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-10">
      <section className="brand-hero-panel relative w-full overflow-hidden p-8">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-[var(--brand-green)]/40 bg-[var(--brand-green)]/15 text-[var(--brand-green)]">
          <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="display-md text-foreground">Sign in to the InFocus app</h1>

        {!validLink ? (
          <p className="mt-3 text-sm text-muted-foreground">
            This link is invalid or incomplete. Start sign-in again from the InFocus app.
          </p>
        ) : viewingAs ? (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
            Stop viewing as someone else first, then try again from the InFocus app.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              The InFocus app on this device will be signed in as <span className="font-semibold text-foreground">{who}</span>.
              Only continue if you started sign-in from the app.
            </p>
            <form action="/api/auth/app/authorize" method="post" className="mt-6 flex flex-col gap-3">
              <input type="hidden" name="challenge" value={challenge} />
              <input type="hidden" name="state" value={state} />
              <Button type="submit" name="decision" value="allow" size="lg">
                Allow
              </Button>
              <Button type="submit" name="decision" value="cancel" size="lg" variant="outline">
                Cancel
              </Button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
