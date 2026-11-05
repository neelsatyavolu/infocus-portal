import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getSessionUser } from "@/src/lib/auth";
import { cn } from "@/src/lib/utils";

const SIGN_OUT_ACTION = "/api/auth/sign-out?returnTo=/";

/** First letters of up to two words of the name (or the email's local part); "IF" when empty. */
function getInitials(name: string | null, email: string | null) {
  const source = (name?.trim() || email?.split("@")[0] || "").trim();
  if (!source) {
    return "IF";
  }

  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

type SessionPerson = { name: string | null; email: string | null; imageUrl?: string | null };

/**
 * 36px avatar: the profile picture, or initials on the card tone. `decorative` when the name is
 * already written beside it, so screen readers don't hear it twice.
 */
function SessionAvatar({
  person,
  decorative = false,
  className
}: {
  person: SessionPerson;
  decorative?: boolean;
  className?: string;
}) {
  const label = person.name ?? person.email ?? "Signed-in user";
  if (person.imageUrl) {
    return (
      <Image
        src={person.imageUrl}
        alt={decorative ? "" : label}
        title={decorative ? undefined : label}
        width={36}
        height={36}
        className={cn("h-9 w-9 shrink-0 rounded-full border border-border object-cover", className)}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      title={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className={cn(
        "h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card text-[13px] font-semibold text-muted-foreground",
        className ?? "grid"
      )}
    >
      <span aria-hidden>{getInitials(person.name, person.email)}</span>
      {decorative ? null : <span className="sr-only">{label}</span>}
    </span>
  );
}

/** Plain POST form, so signing out works without client JavaScript. */
function SignOutForm({ className, buttonClassName }: { className?: string; buttonClassName: string }) {
  return (
    <form action={SIGN_OUT_ACTION} method="post" className={className}>
      <button type="submit" className={buttonClassName}>
        Sign out
      </button>
    </form>
  );
}

/** Outline header button: 40px touch target on phones (with the menu toggle), 36px from sm. */
const HEADER_BUTTON = cn(buttonVariants({ variant: "outline" }), "max-sm:h-10");

/**
 * The session part of the header row, streamed inside a Suspense boundary so the page never
 * waits on the session read. Every control is h-9 (h-10 on phones); the header button is outline
 * so each page's own primary stays the only filled button in view.
 */
export async function HeaderAccount() {
  const session = await getSessionUser();

  if (!session) {
    return (
      // A plain <a>: /sign-in is a full page load, as before.
      <a href="/sign-in" className={HEADER_BUTTON}>
        Sign in
        <ArrowRight className="h-4 w-4" aria-hidden />
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SignOutForm className="hidden sm:block" buttonClassName={buttonVariants({ variant: "ghost" })} />
      <SessionAvatar person={session} className="hidden sm:grid" />
      <Link href={"/dashboard" as Route} className={HEADER_BUTTON}>
        Dashboard
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

/**
 * The account block at the bottom of the phone menu (below sm, where the header row has no room
 * for the avatar and Sign out). Renders nothing for signed-out visitors.
 */
export async function MenuAccount() {
  const session = await getSessionUser();
  if (!session) {
    return null;
  }

  const primary = session.name ?? session.email ?? "Signed in";
  const secondary = session.name && session.email ? session.email : null;

  return (
    <div className="mt-2 space-y-3 border-t border-border pt-4 sm:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <SessionAvatar person={session} decorative />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{primary}</p>
          {secondary ? <p className="truncate text-[13px] text-muted-foreground">{secondary}</p> : null}
        </div>
      </div>
      {/* Phones only (sm:hidden above), so the 40px touch height. */}
      <SignOutForm buttonClassName={cn(buttonVariants({ variant: "outline" }), "h-10 w-full")} />
    </div>
  );
}
