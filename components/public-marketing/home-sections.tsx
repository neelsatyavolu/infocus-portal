import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AboutPortalText } from "@/components/about-portal";
import { buttonVariants } from "@/components/ui/button";
import {
  homeApps,
  homeEquipmentHref,
  homePillars,
  homeQuickLinks
} from "@/components/public-marketing/home-content";
import { ANCHOR_OFFSET, INLINE_LINK_CLASS } from "@/components/public-marketing/shared";
import { cn } from "@/src/lib/utils";

const NEW_TAB = <span className="sr-only"> (opens in a new tab)</span>;
/** One row recipe for every list on the page: label on the left, hint under it, action on the right. */
const ROW = "flex min-h-14 items-center justify-between gap-4 py-3";
const ROW_LINK = cn(
  ROW,
  "-mx-2 rounded-md px-2 transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
);

/**
 * The nameplate: who InFocus is, one short paragraph about the Portal, and the page's one primary
 * button with Equipment beside it. No panel behind it, so the page opens on type, not a box.
 */
export function HomeHero() {
  return (
    <section aria-labelledby="home-title" className="flex max-w-[44rem] flex-col gap-5 py-4 md:py-8">
      <div className="eyebrow flex items-center gap-2">
        <span className="rec-dot rec-dot-red" aria-hidden />
        InFocus News
      </div>

      <h1 id="home-title" className="display-xl">
        Student journalism at Palo Alto High School.
      </h1>

      <p className="text-base leading-relaxed text-[var(--ink-text)] md:text-lg">
        InFocus is Paly&apos;s student-run broadcast publication. InFocus Portal is our newsroom&apos;s workspace,
        where reporters and producers plan stories, review cuts and run the show. Watch our work at{" "}
        <a href="https://infocusnews.tv" className={INLINE_LINK_CLASS}>
          infocusnews.tv
        </a>
        .
      </p>

      {/* Full width and stacked on phones; side by side at their own widths from sm. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/dashboard" prefetch={false} className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
          Open InFocus Portal
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        {/* A plain <a> in the same tab: the equipment host is its own app. */}
        <a href={homeEquipmentHref()} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto")}>
          Equipment
        </a>
      </div>
    </section>
  );
}

/**
 * One section of the page: a hairline above, the heading, then its content. From lg the heading
 * sits in a narrow left column so the lists get the width.
 */
function HomeSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("grid gap-3 border-t border-border pt-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10", ANCHOR_OFFSET)}
    >
      <h2 id={`${id}-title`} className="text-base font-semibold leading-snug text-foreground">
        {title}
      </h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function RowText({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{hint}</span>
    </span>
  );
}

/** Master Calendar, announcement submission, then the apps: every way in besides the hero buttons. */
export function GetAroundSection() {
  return (
    <HomeSection id="apps" title="Get around">
      <ul className="divide-y divide-border">
        {homeQuickLinks.map((link) => (
          <li key={link.key}>
            <Link href={link.href as Route} prefetch={link.prefetch} className={ROW_LINK}>
              <RowText label={link.label} hint={link.hint} />
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
        {homeApps.map((app) =>
          app.released ? (
            <li key={app.title}>
              <a href={app.href} target="_blank" rel="noopener noreferrer" className={ROW_LINK}>
                <RowText label={app.title} hint={app.description} />
                <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-foreground">
                  {app.action}
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </span>
                {NEW_TAB}
              </a>
            </li>
          ) : (
            <li key={app.title} className={ROW}>
              <RowText label={app.title} hint={app.description} />
              <span className="shrink-0 text-[13px] text-muted-foreground">Coming soon</span>
            </li>
          )
        )}
      </ul>
    </HomeSection>
  );
}

/** What the Portal does, one line per area. */
export function NewsroomSection() {
  return (
    <HomeSection id="features" title="What Portal does">
      <dl className="divide-y divide-border">
        {homePillars.map((pillar) => (
          <div key={pillar.title} className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm font-medium text-foreground">{pillar.title}</dt>
            <dd className="text-sm leading-relaxed text-muted-foreground">{pillar.description}</dd>
          </div>
        ))}
      </dl>
    </HomeSection>
  );
}

/** Who built the Portal, that it is open source, and how to contribute. Last on the home page. */
export function AboutSection() {
  return (
    <HomeSection id="about" title="About">
      <div className="flex max-w-[44rem] flex-col gap-3 py-3 text-sm leading-relaxed text-[var(--ink-text)]">
        <AboutPortalText linkClassName={INLINE_LINK_CLASS} />
      </div>
    </HomeSection>
  );
}
