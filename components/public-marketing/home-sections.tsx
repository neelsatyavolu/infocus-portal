import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { IconTile } from "@/components/kit/avatar";
import { StatusTag } from "@/components/kit/status-tag";
import { buttonVariants } from "@/components/ui/button";
import {
  homeApps,
  homeEquipmentHref,
  homePillars,
  homeQuickLinks,
  type QuickLink
} from "@/components/public-marketing/home-content";
import { ANCHOR_OFFSET, INLINE_LINK_CLASS } from "@/components/public-marketing/shared";
import { cn } from "@/src/lib/utils";

const HERO_TEXT = "max-w-[40rem] text-base leading-relaxed text-[var(--ink-text)] md:text-lg";
/** The one side inset for the hero and every card below it, so their text starts on one line. */
const ROW_PAD = "px-4 md:px-5";
const NEW_TAB = <span className="sr-only"> (opens in a new tab)</span>;

/**
 * The nameplate: who InFocus is, the page's one primary button (with Equipment beside it) right
 * after that first paragraph (in view at once on phones), then what Portal is. Screen order matches reading and tab order
 * at every width. Its side inset is the cards' (ROW_PAD), so the hero, Quick links, Apps and the
 * pillar cards all start their text on the same lines. Beside the cards (lg) it is as tall as
 * they are, so its content sits centered: any spare height splits evenly above and below.
 */
export function HomeHero({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="home-title"
      className={cn("brand-hero-panel flex min-w-0 flex-col gap-4 py-5 md:gap-5 md:py-6 lg:justify-center", ROW_PAD, className)}
    >
      <div className="eyebrow flex items-center gap-2">
        <span className="rec-dot rec-dot-red" aria-hidden />
        InFocus News
      </div>

      <h1 id="home-title" className="display-xl">
        Student journalism at Palo Alto High School.
      </h1>

      <p className={HERO_TEXT}>
        InFocus is Palo Alto High School&apos;s student-run broadcast publication, covering campus news,
        community stories, and live events. Our student journalists inform and engage the school community
        through news reports, features, and commentary.
      </p>

      {/* The page's one primary, with Equipment beside it as an outline of the same size.
          Full width and stacked on phones; side by side at their own widths from sm. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link href="/dashboard" prefetch={false} className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
          Open InFocus Portal
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        {/* A plain <a> in the same tab: the equipment host is its own app. */}
        <a href={homeEquipmentHref()} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto")}>
          Equipment
        </a>
      </div>

      <p className={HERO_TEXT}>
        InFocus Portal is our newsroom&apos;s production workspace, where student reporters and producers
        plan stories, review video reports, and coordinate broadcasts. Explore our published work at{" "}
        <a href="https://infocusnews.tv" className={INLINE_LINK_CLASS}>
          infocusnews.tv
        </a>
        . InFocus Portal is open source on{" "}
        <a href="https://github.com/neelsatyavolu/infocus-portal" target="_blank" rel="noopener noreferrer" className={INLINE_LINK_CLASS}>
          GitHub
          {NEW_TAB}
        </a>
        .
      </p>
    </section>
  );
}

/** One heading recipe for both cards beside the hero. */
function CardHeading({ id, title, description }: { id: string; title: string; description?: string }) {
  return (
    <div className={cn("border-b border-border pb-3 pt-4", ROW_PAD)}>
      <h2 id={id} className="text-base font-semibold leading-snug text-foreground">
        {title}
      </h2>
      {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function QuickLinkRow({ link }: { link: QuickLink }) {
  const className = cn(
    "grid min-h-14 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 py-3 transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    ROW_PAD
  );
  return (
    <Link href={link.href as Route} prefetch={link.prefetch} className={className}>
      <IconTile icon={link.icon} tone="brand" size={36} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-foreground">{link.label}</span>
          {link.tag ? <StatusTag size="sm">{link.tag}</StatusTag> : null}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{link.hint}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** Master Calendar and announcement submission: the other ways in. */
export function QuickLinksCard({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="quick-links-title"
      className={cn("min-w-0 overflow-hidden rounded-md border border-border bg-card", className)}
    >
      <CardHeading id="quick-links-title" title="Quick links" />
      <ul className="divide-y divide-border">
        {homeQuickLinks.map((link) => (
          <li key={link.key}>
            <QuickLinkRow link={link} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The iPhone and Mac apps. Unreleased apps show a tag, not a disabled-looking button. */
export function AppsCard({ className }: { className?: string }) {
  return (
    <section
      id="apps"
      aria-labelledby="apps-title"
      className={cn("min-w-0 overflow-hidden rounded-md border border-border bg-card", ANCHOR_OFFSET, className)}
    >
      <CardHeading id="apps-title" title="Get the apps" description="InFocus on your iPhone and Mac." />
      <ul className="divide-y divide-border">
        {homeApps.map((app) => (
          <li key={app.title} className={cn("grid grid-cols-[36px_minmax(0,1fr)] gap-3 py-4", ROW_PAD)}>
            <IconTile icon={app.icon} tone="brand" size={36} />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-snug text-foreground">{app.title}</h3>
              <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{app.description}</p>
              {/* One slot height for button and tag rows: 40px touch on phones, 32px from sm. */}
              <div className="mt-2.5 flex min-h-10 items-center sm:min-h-8">
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
                  // `wrap`: the label is long, and narrow phones would otherwise cut it off.
                  <StatusTag wrap>Coming soon to the App Store</StatusTag>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Inside the newsroom: the four areas of the work, each with the Portal tools behind it. From sm
 * the cards sit two by two at every width: each row pairs cards with the same number of tools
 * (2 + 2, then 1 + 1), so equal-height cards end without a blank block, tool text gets a full
 * line, and the column split lines up with the hero/cards split above. The cards in a row share
 * row tracks (subgrid), so titles, descriptions and the rule above the tools line up.
 * (Hand-rolled rather than kit Panel, which can't take part in a subgrid.)
 */
export function NewsroomSection() {
  return (
    <section id="features" aria-labelledby="features-title" className={cn("space-y-5", ANCHOR_OFFSET)}>
      <div>
        <div className="eyebrow eyebrow-ink">Inside the newsroom</div>
        <h2 id="features-title" className="display-md mt-2 text-foreground">
          Supporting every stage of student reporting
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          InFocus Portal brings together the tools our student newsroom uses to prepare stories for publication.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {homePillars.map((pillar) => (
          <article
            key={pillar.title}
            className="flex min-w-0 flex-col rounded-md border border-border bg-card p-4 md:p-5 sm:row-span-3 sm:grid sm:grid-rows-subgrid sm:gap-0"
          >
            <h3 className="text-lg font-semibold leading-snug text-foreground">{pillar.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{pillar.description}</p>
            <ul className="mt-4 grid content-start gap-4 border-t border-border pt-4">
              {pillar.tools.map((tool) => (
                <li key={tool.title} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                  <IconTile icon={tool.icon} tone="brand" size={32} />
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold leading-snug text-foreground">{tool.title}</h4>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{tool.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
