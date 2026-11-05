import type { Metadata } from "next";
import type { ComponentType } from "react";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { fieldLabelClass } from "@/components/kit/field";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import {
  accessFromAppointments,
  appointedAreas,
  managerAreas,
  type ManagerAreaId
} from "@/src/lib/managers";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { cn } from "@/src/lib/utils";
import { loadManagerRosters } from "@/src/server/manager-rosters";
import { ManagerAreaColumns, ManagerAreaRow, orderManagerAreas } from "./manager-area-row";

export const metadata: Metadata = {
  title: "Managers"
};

const ROLE_NAMES: Record<ManagerAreaId, string> = {
  equipment: "Equipment manager",
  livestreams: "Livestream manager",
  website: "Website manager",
  "social-media": "Social media manager"
};

const HOW_IT_WORKS: ReadonlyArray<{ icon: ComponentType<{ className?: string }>; title: string; text: string }> = [
  { icon: UserPlus, title: "Producers appoint", text: "Each tool has a Managers list. A producer adds you there." },
  { icon: KeyRound, title: "Your tool unlocks", text: "Once you’re on a list, you can open that tool from here right away." },
  { icon: ShieldCheck, title: "Only that tool", text: "A manager role never grants producer access. Removal locks it again." }
];

function roleSummary(isProducer: boolean, roles: ManagerAreaId[]) {
  if (isProducer) return "You’re a producer: you can open every tool and appoint managers from each one.";
  if (!roles.length) return "You’re not a manager yet. Producers appoint managers from each tool.";
  return "Each manager role has its own tool. Choose yours to open it.";
}

/** Always open for everyone: a plain section with a real h2, under the areas list. */
function HowManagerRolesWork() {
  return (
    <section aria-labelledby="how-managers-work" className="rounded-md border border-border bg-card p-4 sm:p-5">
      <h2 id="how-managers-work" className={fieldLabelClass}>
        How manager roles work
      </h2>
      <ol className="mt-4 grid gap-4 md:grid-cols-3 md:gap-5">
        {HOW_IT_WORKS.map(({ icon: Icon, title, text }, index) => (
          <li key={title} className={cn("flex gap-3", index > 0 && "md:border-l md:border-border md:pl-5")}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-green)]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--ink-text)]">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function ManagersPage() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const [access, rosters] = await Promise.all([getPlatformAccess(user.email), loadManagerRosters()]);
  const isProducer = access.canManageWorkspaces;
  const roles = appointedAreas(user.id, rosters);
  const areas = managerAreas(accessFromAppointments(isProducer, roles));
  const ordered = orderManagerAreas(areas, roles);

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow="Managers"
        status={
          isProducer ? (
            <StatusTag tone="success" srLabel="Your role: ">
              Producer
            </StatusTag>
          ) : roles.length ? (
            roles.map((id) => (
              <StatusTag key={id} tone="success" srLabel="Your role: ">
                {ROLE_NAMES[id]}
              </StatusTag>
            ))
          ) : null
        }
        title="Manager tools"
        description={roleSummary(isProducer, roles)}
      />

      <section aria-labelledby="manager-areas" className="@container">
        <h2 id="manager-areas" className="sr-only">
          Areas
        </h2>
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <ManagerAreaColumns />
          <ul className="divide-y divide-border">
            {ordered.map((area) => (
              <ManagerAreaRow key={area.id} area={area} people={rosters[area.id]} yours={roles.includes(area.id)} />
            ))}
          </ul>
        </div>
      </section>

      <HowManagerRolesWork />
    </div>
  );
}
