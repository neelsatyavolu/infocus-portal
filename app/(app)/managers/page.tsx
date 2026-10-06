import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Camera, Globe, KeyRound, Lock, Radio, ShieldCheck, UserPlus } from "lucide-react";
import type { ComponentType } from "react";
import { SocialIcon } from "@/components/story-maker/social-icons";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import {
  accessFromAppointments,
  appointedAreas,
  managerAreas,
  type ManagerArea,
  type ManagerAreaId,
  type ManagerRosters
} from "@/src/lib/managers";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { cn } from "@/src/lib/utils";
import { loadManagerRosters } from "@/src/server/manager-rosters";

export const metadata: Metadata = {
  title: "Managers"
};

const SHOWN_NAMES = 4;

function InstagramIcon({ className }: { className?: string }) {
  return <SocialIcon name="instagram" className={className} />;
}

const ICONS: Record<ManagerAreaId, ComponentType<{ className?: string }>> = {
  equipment: Camera,
  livestreams: Radio,
  website: Globe,
  "social-media": InstagramIcon
};

const ROLE_NAMES: Record<ManagerAreaId, string> = {
  equipment: "Equipment manager",
  livestreams: "Livestream manager",
  website: "Website manager",
  "social-media": "Social media manager"
};

function Names({ people }: { people: ManagerRosters[ManagerAreaId] }) {
  if (!people.length) return <span className="text-muted-foreground">No one appointed yet</span>;
  const shown = people.slice(0, SHOWN_NAMES).map((person) => person.name).join(", ");
  const more = people.length - SHOWN_NAMES;
  return (
    <span className="text-[var(--ink-text)]">
      {shown}
      {more > 0 ? <span className="text-muted-foreground"> +{more} more</span> : null}
    </span>
  );
}

function AreaCard({ area, people, yours }: { area: ManagerArea; people: ManagerRosters[ManagerAreaId]; yours: boolean }) {
  const Icon = ICONS[area.id];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[var(--ink)] text-[var(--brand-green)]">
          <Icon className="h-5 w-5" />
        </span>
        {area.canOpen ? (
          <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        ) : (
          <Lock className="h-4 w-4 text-muted-foreground" aria-label="Locked" />
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.11em] text-[var(--brand-green)]">{area.title}</p>
          {yours ? (
            <span className="rounded-[4px] bg-[var(--brand-green)]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.11em] text-[var(--brand-green)]">
              Your role
            </span>
          ) : null}
        </div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{area.tool}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-text)]">{area.description}</p>
      </div>
      <dl className="mt-auto grid gap-1.5 border-t border-border pt-3 text-xs">
        <div className="flex gap-2">
          <dt className="w-[5.5rem] shrink-0 font-medium uppercase tracking-[0.11em] text-muted-foreground">Managers</dt>
          <dd className="min-w-0"><Names people={people} /></dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-[5.5rem] shrink-0 font-medium uppercase tracking-[0.11em] text-muted-foreground">Access</dt>
          <dd className="min-w-0 text-[var(--ink-text)]">{area.canOpen ? area.access : `${area.access}. Ask a producer if you need it.`}</dd>
        </div>
      </dl>
    </>
  );

  const className = "group flex min-h-[292px] flex-col gap-5 rounded-md border border-border bg-card p-5";
  if (!area.canOpen) {
    return (
      <div className={`${className} opacity-75`} aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <Link
      href={area.href as never}
      className={`${className} transition-colors hover:border-[var(--brand-fill)] hover:bg-[var(--ink-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-green)]`}
    >
      {body}
    </Link>
  );
}

function RoleSummary({ isProducer, roles }: { isProducer: boolean; roles: ManagerAreaId[] }) {
  if (isProducer) {
    return <>You’re a producer: you can open every tool and appoint managers from each one.</>;
  }
  if (!roles.length) {
    return <>You’re not a manager yet. Producers appoint managers from each tool.</>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      Your roles:
      {roles.map((id) => (
        <span key={id} className="rounded-[4px] bg-[var(--brand-green)]/15 px-1.5 py-0.5 text-xs font-medium text-[var(--brand-green)]">
          {ROLE_NAMES[id]}
        </span>
      ))}
    </span>
  );
}

const HOW_IT_WORKS: ReadonlyArray<{ icon: ComponentType<{ className?: string }>; title: string; text: string }> = [
  { icon: UserPlus, title: "Producers appoint", text: "Each tool has a Managers list. A producer adds you there." },
  { icon: KeyRound, title: "Your card unlocks", text: "Once you’re on a list, its card opens here right away." },
  { icon: ShieldCheck, title: "Only that tool", text: "A manager role never grants producer access. Removal locks the card again." }
];

export default async function ManagersPage() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const [access, rosters] = await Promise.all([getPlatformAccess(user.email), loadManagerRosters()]);
  const isProducer = access.canManageWorkspaces;
  const roles = appointedAreas(user.id, rosters);
  const areas = managerAreas(accessFromAppointments(isProducer, roles));

  return (
    <div className="route-enter mx-auto w-full max-w-[1760px] space-y-5 pb-28">
      <section className="brand-hero-panel relative overflow-hidden p-6 md:p-8">
        <p className="eyebrow">Managers</p>
        <h1 className="display-md mt-3 text-balance text-foreground">Pick your area</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--ink-text)]">
          Each manager role has its own tool. Choose yours to open it.
        </p>
        <p className="mt-4 text-sm text-foreground">
          <RoleSummary isProducer={isProducer} roles={roles} />
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {areas.map((area) => (
          <AreaCard key={area.id} area={area} people={rosters[area.id]} yours={roles.includes(area.id)} />
        ))}
      </div>

      <section aria-labelledby="how-managers-work" className="rounded-md border border-border bg-card p-5">
        <h2 id="how-managers-work" className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
          How manager roles work
        </h2>
        <ol className="mt-4 grid gap-5 md:grid-cols-3">
          {HOW_IT_WORKS.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className={cn("flex gap-3", index > 0 && "md:border-l md:border-border md:pl-5")}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-green)]" />
              <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--ink-text)]">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
