import Link from "next/link";
import type { Route } from "next";
import { PUBLIC_CONTAINER, type MarketingActive } from "@/components/public-marketing/shared";
import { cn } from "@/src/lib/utils";

const FOOTER_LINKS = [
  { href: "/privacy", label: "Privacy policy", key: "privacy" },
  { href: "/support", label: "Support", key: "support" }
] as const;

/** Slim public footer: the two App Store pages, on the same column edges as the header. */
export function MarketingFooter({ active }: { active?: MarketingActive }) {
  return (
    <footer className="border-t border-border">
      <div
        className={cn(
          PUBLIC_CONTAINER,
          "flex flex-col gap-1 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        )}
      >
        <p>InFocus Portal · Palo Alto High School</p>
        <nav aria-label="Footer">
          <ul className="flex items-center gap-5">
            {FOOTER_LINKS.map((link) => {
              const isActive = active === link.key;
              return (
                <li key={link.key}>
                  <Link
                    href={link.href as Route}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex h-10 items-center transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8",
                      isActive && "font-medium text-foreground"
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
