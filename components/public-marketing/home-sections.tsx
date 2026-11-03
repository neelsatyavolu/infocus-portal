import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { buttonVariants } from "@/components/ui/button";
import { homeApps, homeFeatures, homeHeroFacts } from "@/components/public-marketing/home-content";
import { ReviewPreview } from "@/components/public-marketing/review-preview";
import { ANCHOR_OFFSET, INLINE_LINK_CLASS } from "@/components/public-marketing/shared";
import { cn } from "@/src/lib/utils";

const NEW_TAB = <span className="sr-only"> (opens in a new tab)</span>;

/**
 * The hero, left-aligned: what InFocus is and what the Portal does, Open InFocus Portal and Submit
 * an announcement, one line of facts, then a still of the review screen at full column width.
 */
export function HomeHero() {
  return (
    <section aria-labelledby="home-title" className="pb-16 pt-6 md:pb-20 md:pt-10">
      <p className="eyebrow">Palo Alto High School · Student broadcast</p>

      <h1 id="home-title" className="display-xl mt-5 max-w-[16ch]">
        Every InFocus story, from pitch to air
      </h1>

      <p className="mt-6 max-w-[60ch] text-base leading-relaxed text-[var(--ink-text)] md:text-lg">
        InFocus is Paly&apos;s student-run broadcast. The Portal is where the class makes it: each
        package from pitch to final cut, feedback pinned to moments in the video, the show schedule, and
        the announcements read on air.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/dashboard" prefetch={false} className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
          Open InFocus Portal
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link href="/submit-announcement" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto")}>
          Submit an announcement
        </Link>
      </div>

      <p className="mt-4 text-[13px] text-muted-foreground">{homeHeroFacts.join(" · ")}</p>

      <figure className="mt-12 md:mt-16">
        <ReviewPreview />
        <figcaption className="mt-3 text-[13px] text-muted-foreground">
          The review screen, with made-up notes. Each note is pinned to the moment in the cut it&apos;s about.
        </figcaption>
      </figure>
    </section>
  );
}

/** One numbered section: a small label, the heading (and an optional lede), then the content, all on one left edge. */
function HomeSection({
  id,
  number,
  label,
  title,
  lede,
  children
}: {
  id: string;
  number: string;
  label: string;
  title: string;
  lede?: ReactNode;
  children: ReactNode;
}) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className={cn("border-t border-line py-16 md:py-20", ANCHOR_OFFSET)}>
      <p className="eyebrow">
        <span className="timecode mr-2 text-brand-green">{number}</span>
        {label}
      </p>
      <h2 id={titleId} className="display-md mt-3 max-w-[26ch]">
        {title}
      </h2>
      {lede ? <div className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--ink-text)]">{lede}</div> : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** What the Portal does: four cells on one hairline grid. */
export function FeaturesStrip() {
  return (
    <HomeSection id="features" number="01" label="Inside the Portal" title="One place for the whole show">
      <dl className="grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
        {homeFeatures.map((feature) => (
          <div key={feature.title} className="border-b border-r border-line p-5 md:p-6">
            <dt className="text-[15px] font-medium text-foreground">{feature.title}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</dd>
          </div>
        ))}
      </dl>
    </HomeSection>
  );
}

/** The iPhone and Mac apps as hairline rows. Unreleased apps show a tag instead of a button. */
export function AppsRow() {
  return (
    <HomeSection id="apps" number="02" label="Apps" title="On your iPhone and Mac">
      <ul className="divide-y divide-line border-y border-line">
        {homeApps.map((app) => (
          <li key={app.title} className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <h3 className="text-[15px] font-medium text-foreground">{app.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{app.description}</p>
            </div>
            {app.released ? (
              <a
                href={app.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 max-sm:h-10")}
              >
                {app.action}
                <span className="sr-only">, {app.title}</span>
                <ArrowUpRight className="h-4 w-4" aria-hidden />
                {NEW_TAB}
              </a>
            ) : (
              <StatusTag className="shrink-0">Coming soon</StatusTag>
            )}
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}

/** Closing: where the stories are, and the Portal's public code. */
export function HomeCloser() {
  return (
    <HomeSection
      id="open-source"
      number="03"
      label="Open source"
      title="The Portal's code is public"
      lede={
        <p>
          Watch the stories at{" "}
          <a href="https://infocusnews.tv" className={INLINE_LINK_CLASS}>
            infocusnews.tv
          </a>
          . The code that runs the Portal is on GitHub under the MIT license.
        </p>
      }
    >
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
    </HomeSection>
  );
}
