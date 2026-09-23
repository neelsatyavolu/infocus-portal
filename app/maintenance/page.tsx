import { CalendarClock, Sparkles, Wrench } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth";
import {
  HUB_MAINTENANCE_BODY,
  HUB_MAINTENANCE_ETA,
  HUB_MAINTENANCE_TITLE
} from "@/src/lib/maintenance";

export default async function MaintenancePage() {
  const session = await getSessionUser();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
      <div
        className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-[var(--brand-green)]/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-1/4 h-64 w-64 rounded-full bg-[var(--brand-amber)]/10 blur-3xl"
        aria-hidden
      />

      <section className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-card/95 p-8 shadow-2xl shadow-black/20 backdrop-blur-sm md:p-10">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--brand-green)] via-[var(--brand-amber)] to-[var(--brand-green)]" />

        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[var(--brand-amber)]/35 bg-[var(--brand-amber)]/12 text-[var(--brand-amber)]">
            <Wrench className="h-6 w-6" aria-hidden />
          </div>
          <div className="eyebrow flex items-center gap-2 text-[var(--brand-amber)]">
            <span className="rec-dot rec-dot-red" aria-hidden />
            Temporary outage
          </div>
        </div>

        <h1 className="display-md font-display text-foreground">{HUB_MAINTENANCE_TITLE}</h1>

        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{HUB_MAINTENANCE_BODY}</p>

        <div className="mt-7 space-y-3">
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/60 px-4 py-3.5">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-green)]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-foreground">Estimated return</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                We estimate to complete this by <span className="font-semibold text-foreground">{HUB_MAINTENANCE_ETA}</span>.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-[var(--brand-green)]/25 bg-[var(--brand-green)]/8 px-4 py-3.5">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-green)]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-foreground">What&apos;s coming</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                A more comprehensive, powerful, and faster portal with a better user experience.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-7 text-center text-xs text-muted-foreground">
          Producers retain full access while we rebuild.
        </p>

        {session ? (
          <div className="mt-5 flex justify-center">
            <form action="/api/auth/sign-out?returnTo=/" method="post">
              <button
                type="submit"
                className="rounded-xl border border-border bg-secondary px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary/80"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </section>
    </main>
  );
}
