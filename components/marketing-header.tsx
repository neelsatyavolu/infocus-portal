import Image from "next/image";
import { BrandWordmark } from "@/components/brand-wordmark";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";
import { getSessionUser } from "@/src/lib/auth";
import { equipmentAppOrigin } from "@/src/lib/hosts";

type MarketingHeaderProps = {
  active?:
    | "features"
    | "workflow"
    | "security"
    | "show-roles"
    | "equipment"
    | "master-calendar"
    | "package-cycles"
    | "package-progress"
    | "drive"
    | "home";
};

const equipmentNav =
  process.env.NODE_ENV === "production"
    ? { href: equipmentAppOrigin(), label: "Equipment", key: "equipment", external: true }
    : { href: "/equipment", label: "Equipment", key: "equipment", external: false };

const navItems = [
  equipmentNav,
  { href: "/show-roles", label: "The Show", key: "show-roles", external: false },
  { href: "/master-calendar", label: "Master Calendar", key: "master-calendar", external: false },
  { href: "/package-cycles", label: "Package Cycles", key: "package-cycles", external: false },
  { href: "/package-progress", label: "Package Cycle", key: "package-progress", external: false },
  {
    href: "https://drive.infocuspaly.com",
    label: "InFocus Drive",
    key: "drive",
    external: true
  }
] as const;

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

export async function MarketingHeader({ active = "home" }: MarketingHeaderProps) {
  const session = await getSessionUser();

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b border-border bg-background/85 px-4 py-3.5 backdrop-blur-md sm:gap-6 md:px-8">
      <Link href="/" className="inline-flex items-center text-foreground">
        <BrandWordmark className="h-9 w-auto object-contain" priority />
      </Link>

      <nav className="hidden items-center gap-0.5 rounded-full border border-border bg-card p-1 lg:inline-flex">
        {navItems.map((item) => {
          const isActive = active === item.key;
          const className = `whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
            isActive
              ? "bg-secondary text-foreground shadow-[inset_0_0_0_1px_var(--ink-3)]"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`;

          if (item.external) {
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {item.label}
              </a>
            );
          }

          return (
            <Link key={item.href} href={item.href as Route} className={className}>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="inline-flex items-center gap-2 sm:gap-2.5">
        <MarketingMobileNav items={[...navItems]} active={active} />
        {session ? (
          <>
            <form
              action="/api/auth/sign-out?returnTo=/"
              method="post"
              className="hidden sm:block"
            >
              <button
                type="submit"
                className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                Sign out
              </button>
            </form>

            {session.imageUrl ? (
              <Image
                src={session.imageUrl}
                alt={session.name ?? session.email ?? "Signed-in user"}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full border border-border object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-xs font-semibold text-muted-foreground">
                {getInitials(session.name, session.email)}
              </span>
            )}

            <Link
              href={"/dashboard" as Route}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-green)] bg-[var(--brand-green)] px-3 py-2 text-[13px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--brand-green-deep)] hover:border-[var(--brand-green-deep)] sm:px-4"
            >
              Dashboard
              <ArrowRight className="hidden h-3.5 w-3.5 sm:inline" strokeWidth={2.5} />
            </Link>
          </>
        ) : (
          <>
            <a
              href="/sign-in"
              className="hidden rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground sm:inline-flex"
            >
              Sign in
            </a>
            <a
              href="/sign-in"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-green)] bg-[var(--brand-green)] px-3 py-2 text-[13px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--brand-green-deep)] hover:border-[var(--brand-green-deep)] sm:px-4"
            >
              Get Started
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            </a>
          </>
        )}
      </div>
    </header>
  );
}
