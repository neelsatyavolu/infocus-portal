import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth";
import { normalizeEmail } from "@/src/lib/platform-admin";
import { AccessRequestButton } from "@/components/access-request-button";

type AccessDeniedPageProps = {
  searchParams: Promise<{
    email?: string;
    name?: string;
  }>;
};

export default async function AccessDeniedPage({ searchParams }: AccessDeniedPageProps) {
  const [session, params] = await Promise.all([getSessionUser(), searchParams]);
  const fallbackEmail = normalizeEmail(params.email);
  const requestEmail = session?.email ?? (fallbackEmail.includes("@") ? fallbackEmail : null);
  const requestName = session?.name ?? params.name?.trim() ?? null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-10">
      <section className="w-full rounded-2xl border border-border bg-card p-7 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl border border-amber-300/30 bg-amber-400/10 text-amber-200">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your email is not on InFocus Portal yet. Ask a producer to add you in Admin → People, or request access below.
        </p>
        <AccessRequestButton email={requestEmail} name={requestName} />
        <div className="mt-5 flex justify-center gap-2">
          {session ? (
            <form action="/api/auth/sign-out?returnTo=/" method="post">
              <button className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-semibold text-foreground">
                Sign out
              </button>
            </form>
          ) : (
            <Link
              href="/"
              className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-semibold text-foreground"
            >
              Back Home
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
