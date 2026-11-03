import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { IconTile } from "@/components/kit/avatar";
import { StatusTag } from "@/components/kit/status-tag";
import { buttonVariants } from "@/components/ui/button";
import { homeApps, homeEquipmentHref, homeFeatures } from "@/components/public-marketing/home-content";
import { ReviewPreview } from "@/components/public-marketing/review-preview";
import { ANCHOR_OFFSET, INLINE_LINK_CLASS } from "@/components/public-marketing/shared";
import { cn } from "@/src/lib/utils";

const NEW_TAB = <span className="sr-only"> (opens in a new tab)</span>;
/** Small centered section heading, shared by Features and Apps. */
const SECTION_TITLE = "text-center text-[13px] font-medium text-muted-foreground";
const QUIET_LINK =
  "text-muted-foreground underline-offset-4 transition-colors duration-150 ease-[var(--ease-ui)] hover:text-foreground hover:underline";

/**
 * The centered hero: one headline, one sentence, Open InFocus Portal and Submit an announcement,
 * then Master Calendar and Equipment as quiet text links, with a still of the review screen below.
 */
export function HomeHero() {
  return (
    <section aria-labelledby="home-title" className="flex flex-col items-center text-center">
      <div className="eyebrow flex items-center gap-2">
        {/* Static: nothing on this page is live, so the rec dot doesn't fade here. */}
        <span className="rec-dot rec-dot-red [animation:none]" aria-hidden />
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
      </div>

      <div className="mt-5 flex items-center gap-6 text-sm">
        <Link href="/master-calendar" prefetch={false} className={QUIET_LINK}>
          Master Calendar
        </Link>
        {/* A plain <a> in the same tab: the equipment host is its own app. */}
        <a href={homeEquipmentHref()} className={QUIET_LINK}>
          Equipment
        </a>
      </div>

      <div className="mt-12 w-full text-left md:mt-16">
        <ReviewPreview />
      </div>
    </section>
  );
}

/** What the Portal does: four short items in two columns, each under a hairline. */
export function FeaturesStrip() {
  return (
    <section id="features" aria-labelledby="features-title" className={cn("space-y-5", ANCHOR_OFFSET)}>
      <h2 id="features-title" className={SECTION_TITLE}>
        Inside the Portal
      </h2>
      <dl className="grid gap-x-10 sm:grid-cols-2">
        {homeFeatures.map((feature) => (
          <div key={feature.title} className="border-t border-line py-4">
            <dt className="text-sm font-medium text-foreground">{feature.title}</dt>
            <dd className="mt-1 text-[13px] leading-snug text-muted-foreground">{feature.description}</dd>
          </div>
        ))}
      </dl>
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
            <IconTile icon={app.icon} size={36} />
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
