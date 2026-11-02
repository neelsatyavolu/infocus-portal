import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { IconTile } from "@/components/kit/avatar";
import { StatusTag } from "@/components/kit/status-tag";
import { buttonVariants } from "@/components/ui/button";
import { homeApps, homeEquipmentHref, homeFeatures } from "@/components/public-marketing/home-content";
import { ANCHOR_OFFSET, INLINE_LINK_CLASS } from "@/components/public-marketing/shared";
import { cn } from "@/src/lib/utils";

const NEW_TAB = <span className="sr-only"> (opens in a new tab)</span>;
/** Small centered section heading, shared by Features and Apps. */
const SECTION_TITLE = "text-center text-[13px] font-medium text-muted-foreground";
const QUIET_LINK =
  "text-muted-foreground underline-offset-4 transition-colors duration-150 ease-[var(--ease-ui)] hover:text-foreground hover:underline";

/**
 * The centered hero: one headline, one sentence, the page's one primary button with Submit an
 * announcement and Equipment beside it, and Master Calendar as a quiet text link.
 */
export function HomeHero() {
  return (
    <section aria-labelledby="home-title" className="flex flex-col items-center text-center">
      <div className="eyebrow flex items-center gap-2">
        <span className="rec-dot rec-dot-red" aria-hidden />
        InFocus Portal
      </div>

      <h1 id="home-title" className="display-xl mt-5 max-w-[14ch]">
        InFocus News
      </h1>

      <p className="mt-5 max-w-[34rem] text-base leading-relaxed text-[var(--ink-text)] md:text-lg">
        Palo Alto High School&apos;s student broadcast, and the workspace where we make it.
      </p>

      <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
        <Link href="/dashboard" prefetch={false} className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
          Open InFocus Portal
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link href="/submit-announcement" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto")}>
          Submit an announcement
        </Link>
        {/* A plain <a> in the same tab: the equipment host is its own app. */}
        <a href={homeEquipmentHref()} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto")}>
          Equipment
        </a>
      </div>

      <Link href="/master-calendar" prefetch={false} className={cn(QUIET_LINK, "mt-5 text-sm")}>
        Master Calendar
      </Link>
    </section>
  );
}

/** What the Portal does: four short items in one hairline-divided row (2 × 2 on phones). */
export function FeaturesStrip() {
  return (
    <section id="features" aria-labelledby="features-title" className={cn("space-y-5", ANCHOR_OFFSET)}>
      <h2 id="features-title" className={SECTION_TITLE}>
        Inside the Portal
      </h2>
      <ul className="grid grid-cols-2 overflow-hidden rounded-lg border border-line-strong bg-card lg:grid-cols-4">
        {homeFeatures.map((feature, index) => (
          <li
            key={feature.title}
            className={cn(
              "flex flex-col items-center gap-3 px-4 py-6 text-center",
              index % 2 === 1 && "border-l border-line",
              index >= 2 && "border-t border-line lg:border-t-0",
              index === 2 && "lg:border-l"
            )}
          >
            <IconTile icon={feature.icon} tone="brand" size={36} />
            <div>
              <h3 className="text-sm font-medium text-foreground">{feature.title}</h3>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{feature.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The iPhone and Mac apps as three equal cards. Unreleased apps show a tag instead of a button. */
export function AppsRow() {
  return (
    <section id="apps" aria-labelledby="apps-title" className={cn("space-y-5", ANCHOR_OFFSET)}>
      <h2 id="apps-title" className={SECTION_TITLE}>
        Get the apps
      </h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {homeApps.map((app) => (
          <li
            key={app.title}
            className="flex flex-col items-center gap-3 rounded-lg border border-line-strong bg-card px-4 py-6 text-center"
          >
            <IconTile icon={app.icon} tone="brand" size={36} />
            <div>
              <h3 className="text-sm font-medium text-foreground">{app.title}</h3>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{app.description}</p>
            </div>
            {/* mt-auto keeps the buttons and tags on one line across the row. */}
            <div className="mt-auto flex min-h-8 items-center pt-1">
              {app.released ? (
                <a
                  href={app.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "max-sm:h-10")}
                >
                  {app.action}
                  <span className="sr-only">, {app.title}</span>
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                  {NEW_TAB}
                </a>
              ) : (
                <StatusTag>Coming soon</StatusTag>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Closing: where the stories are, and the Portal's public code. */
export function HomeCloser() {
  return (
    <section aria-label="Open source" className="flex flex-col items-center gap-4 text-center">
      <p className="text-sm text-muted-foreground">
        Watch our stories at{" "}
        <a href="https://infocusnews.tv" className={INLINE_LINK_CLASS}>
          infocusnews.tv
        </a>
        . The Portal is open source.
      </p>
      <a
        href="https://github.com/neelsatyavolu/infocus-portal"
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "outline" })}
      >
        View the code on GitHub
        <ArrowUpRight className="h-4 w-4" aria-hidden />
        {NEW_TAB}
      </a>
    </section>
  );
}
