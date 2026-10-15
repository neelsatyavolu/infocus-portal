import Link from "next/link";
import type { ComponentType } from "react";
import { ArrowRight, Camera, Globe, Lock, Radio } from "lucide-react";
import { IconTile } from "@/components/kit/avatar";
import { fieldLabelClass } from "@/components/kit/field";
import { StatusTag } from "@/components/kit/status-tag";
import { SocialIcon } from "@/components/story-maker/social-icons";
import type { ManagerArea, ManagerAreaId, ManagerRosters } from "@/src/lib/managers";
import { cn } from "@/src/lib/utils";

const SHOWN_NAMES = 4;

/**
 * Area | Managers | Access | arrow. The column header and every row share this template once the
 * list is at least 56rem wide (a container query on the list's section). Narrower, each row
 * stacks: icon | area / tool / description | arrow, with Managers and Access as a label list below.
 */
export const AREA_COLUMNS = "@4xl:grid-cols-[2.5rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_1rem]";

/** One Managers / Access pair: label over value on a phone, beside it from 28rem, a plain cell in the columns. */
const PAIR = "grid gap-y-0.5 @md:grid-cols-[5.5rem_minmax(0,1fr)] @md:items-baseline @md:gap-x-3 @4xl:block";

function InstagramIcon({ className }: { className?: string }) {
  return <SocialIcon name="instagram" className={className} />;
}

const ICONS: Record<ManagerAreaId, ComponentType<{ className?: string }>> = {
  equipment: Camera,
  livestreams: Radio,
  website: Globe,
  "social-media": InstagramIcon
};

/** Yours first, then the other tools you can open, then locked ones; AREA_ORDER within each (the sort is stable). */
export function orderManagerAreas(areas: ManagerArea[], roles: ManagerAreaId[]) {
  const rank = (area: ManagerArea) => (roles.includes(area.id) ? 0 : area.canOpen ? 1 : 2);
  return [...areas].sort((a, b) => rank(a) - rank(b));
}

function Names({ people }: { people: ManagerRosters[ManagerAreaId] }) {
  if (!people.length) return <span className="text-muted-foreground">No one appointed yet</span>;
  const shown = people.slice(0, SHOWN_NAMES).map((person) => person.name).join(", ");
  const more = people.length - SHOWN_NAMES;
  return (
    <span className="text-foreground">
      {shown}
      {more > 0 ? <span className="text-muted-foreground"> +{more} more</span> : null}
    </span>
  );
}

/** The labels over the columns, shown only when the rows use the column template. */
export function ManagerAreaColumns() {
  return (
    <div
      aria-hidden
      className={cn(fieldLabelClass, "hidden h-10 items-center gap-x-4 border-b border-border px-4 @4xl:grid", AREA_COLUMNS)}
    >
      {/* An empty cell over the icons, so "Area" sits over the area names. */}
      <span />
      <span>Area</span>
      <span>Managers</span>
      <span>Access</span>
      <span />
    </div>
  );
}

/**
 * One manager area. An area the person can open is a whole-row link: the link is the tool name
 * (so that is all a screen reader hears), stretched over the row. A locked area keeps its place
 * with a Locked tag, a muted icon and who to ask.
 */
export function ManagerAreaRow({ area, people, yours }: { area: ManagerArea; people: ManagerRosters[ManagerAreaId]; yours: boolean }) {
  const access = area.canOpen ? area.access : `${area.access}. Ask a producer if you need it.`;
  return (
    <li
      className={cn(
        "group relative grid grid-cols-[2.5rem_minmax(0,1fr)_1rem] items-start gap-x-4 gap-y-3 px-4 py-4 @4xl:items-center @4xl:py-3",
        AREA_COLUMNS,
        area.canOpen && "transition-colors hover:bg-[var(--ink-3)]"
      )}
    >
      <IconTile icon={ICONS[area.id]} tone={area.canOpen ? "brand" : "neutral"} />

      <div className="min-w-0">
        <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn(fieldLabelClass, area.canOpen && "text-[var(--brand-green)]")}>{area.title}</p>
          {yours ? (
            <StatusTag tone="success" size="sm">
              Your role
            </StatusTag>
          ) : null}
          {area.canOpen ? null : (
            <StatusTag size="sm" icon={Lock}>
              Locked
            </StatusTag>
          )}
        </div>
        <h3 className="mt-1 text-base font-semibold leading-snug tracking-tight text-foreground">
          {area.canOpen ? (
            <Link
              href={area.href as never}
              className="outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[var(--brand-green)]"
            >
              {area.tool}
            </Link>
          ) : (
            area.tool
          )}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-[var(--ink-text)]">{area.description}</p>
      </div>

      {/* Phone: the full row width, each label over its value. Tablet: under the area text, labels
          beside values. Wide: the Managers and Access columns. */}
      <dl className="col-span-3 col-start-1 grid gap-y-3 text-sm leading-relaxed @md:col-span-2 @md:col-start-2 @md:gap-y-2 @4xl:col-span-2 @4xl:col-start-3 @4xl:row-start-1 @4xl:grid-cols-subgrid">
        <div className={PAIR}>
          <dt className={cn(fieldLabelClass, "@4xl:sr-only")}>Managers</dt>
          <dd className="min-w-0">
            <Names people={people} />
          </dd>
        </div>
        <div className={PAIR}>
          <dt className={cn(fieldLabelClass, "@4xl:sr-only")}>Access</dt>
          <dd className="min-w-0 text-[var(--ink-text)]">{access}</dd>
        </div>
      </dl>

      <span aria-hidden className="col-start-3 row-start-1 flex h-10 items-center justify-end @4xl:col-start-5 @4xl:h-auto">
        {area.canOpen ? (
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        ) : null}
      </span>
    </li>
  );
}
