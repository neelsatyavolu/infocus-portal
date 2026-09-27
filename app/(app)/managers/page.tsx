import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Camera, Globe, Lock, Radio } from "lucide-react";
import type { ComponentType } from "react";
import { SocialIcon } from "@/components/story-maker/social-icons";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { managerAreas, type ManagerArea, type ManagerAreaId } from "@/src/lib/managers";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { isEquipmentManager } from "@/src/server/equipment-access";
import { isPublishingManager } from "@/src/server/publishing-access";
import { isSocialMediaManager } from "@/src/server/social-media-access";

export const metadata: Metadata = {
  title: "Managers · InFocus Portal"
};

function InstagramIcon({ className }: { className?: string }) {
  return <SocialIcon name="instagram" className={className} />;
}

const ICONS: Record<ManagerAreaId, ComponentType<{ className?: string }>> = {
  equipment: Camera,
  livestreams: Radio,
  website: Globe,
  "social-media": InstagramIcon
};

function AreaCard({ area }: { area: ManagerArea }) {
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
      <div className="mt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.11em] text-[var(--brand-green)]">{area.title}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{area.tool}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-text)]">{area.description}</p>
      </div>
      <p className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground">
        {area.canOpen ? area.access : `${area.access}. Ask a producer if you need access.`}
      </p>
    </>
  );

  const className = "group flex min-h-[248px] flex-col gap-4 rounded-md border border-border bg-card p-5";
  if (!area.canOpen) {
    return (
      <div className={`${className} opacity-70`} aria-disabled="true">
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

export default async function ManagersPage() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  const isProducer = access.canManageWorkspaces;
  // Producers can open everything, so only look up appointments for everyone else.
  const [equipment, publishing, socialMedia] = isProducer
    ? [true, true, true]
    : await Promise.all([isEquipmentManager(user.id), isPublishingManager(user.id), isSocialMediaManager(user.id)]);
  const areas = managerAreas({
    isProducer,
    isEquipmentManager: equipment,
    isPublishingManager: publishing,
    isSocialMediaManager: socialMedia
  });

  return (
    <div className="route-enter mx-auto w-full max-w-[1760px] space-y-5 pb-28">
      <section className="brand-hero-panel relative overflow-hidden p-6 md:p-8">
        <p className="eyebrow">Managers</p>
        <h1 className="mt-3 text-[32px] font-semibold leading-none text-foreground md:text-[44px]" style={{ letterSpacing: "-0.025em" }}>
          Pick your area
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--ink-text)]">
          Each manager role has its own tool. Choose yours to open it.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {areas.map((area) => (
          <AreaCard key={area.id} area={area} />
        ))}
      </div>
    </div>
  );
}
