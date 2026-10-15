import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { type PlatformRole } from "@prisma/client";
import { CreateProjectTile } from "@/components/create-project-tile";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { PageHeader } from "@/components/page-header";
import { StageTimeline } from "@/components/package-cycle/stage-timeline";
import { buttonVariants } from "@/components/ui/button";
import { homeStageSteps } from "@/src/lib/home-stages";
import { isAppReviewEmail } from "@/src/lib/app-review";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { userDisplayName } from "@/src/lib/user-display";
import { buildPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import {
  formatRelativeTime,
  formatStageDueLabel,
  getDashboardData as fetchDashboardPanels,
  loadStudentDashboardSnapshot,
  type DashboardActivityEntry,
  type DashboardUpNext,
  type StudentDashboardSnapshot
} from "@/src/server/dashboard-data";
import { buildWorkspaceAccessWhere } from "@/src/server/workspace-access";

type DashboardPageProps = {
  searchParams: Promise<{ workspaceId?: string; sort?: string; view?: string }>;
};

type SortValue = "name" | "recent" | "size";
type ViewValue = "grid" | "list";

const TILE_GRADIENTS = [
  "brand-gradient-green",
  "brand-gradient-1",
  "brand-gradient-5",
  "brand-gradient-4",
  "brand-gradient-2",
  "brand-gradient-3",
  "brand-gradient-5",
  "brand-gradient-2"
] as const;

function normalizeSort(value: string | undefined): SortValue {
  if (value === "recent" || value === "size") {
    return value;
  }

  return "name";
}

function normalizeView(value: string | undefined): ViewValue {
  if (value === "list") {
    return "list";
  }

  return "grid";
}

/** includeProjects: false for students, whose dashboard shows the snapshot instead of projects. */
async function getDashboardData(
  userId: string,
  platformRole: PlatformRole | null,
  email: string | null,
  includeProjects: boolean
) {
  return prisma.workspace.findMany({
    where: buildWorkspaceAccessWhere({
      userId,
      platformRole,
      email
    }),
    select: {
      id: true,
      name: true,
      members: {
        where: {
          userId
        },
        select: {
          role: true
        },
        take: 1
      },
      projects: {
        orderBy: { createdAt: "desc" },
        ...(includeProjects ? {} : { take: 0 }),
        select: {
          id: true,
          name: true,
          updatedAt: true,
          _count: {
            select: {
              mediaItems: true
            }
          }
        }
      }
    },
    orderBy: {
      name: "asc"
    }
  });
}

function canCreateInWorkspace(role: string | undefined) {
  if (!role) {
    return false;
  }

  return role === "OWNER_ADMIN" || role === "EDITOR";
}

function sortProjects<T extends { name: string; updatedAt: Date; _count: { mediaItems: number } }>(
  projects: T[],
  sortValue: SortValue
) {
  return [...projects].sort((a, b) => {
    if (sortValue === "recent") {
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    }

    if (sortValue === "size") {
      return b._count.mediaItems - a._count.mediaItems;
    }

    return a.name.localeCompare(b.name);
  });
}


export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [{ workspaceId, sort, view }, currentAppUser] = await Promise.all([searchParams, getCurrentAppUser()]);
  const { userId, user, platformRole } = currentAppUser;
  const access = buildPlatformAccess(platformRole);
  // The App Review account sees its sample workspace's projects, not a (blank) student snapshot.
  const isStudent = !access.canManageWorkspaces && !isAppReviewEmail(user.email);
  // The student snapshot doesn't depend on workspaces, so start everything at once.
  const workspacesPromise = getDashboardData(userId, platformRole, user.email, !isStudent);
  const [workspaces, dashboardPanels, snapshot] = await Promise.all([
    workspacesPromise,
    workspacesPromise.then((loaded) =>
      fetchDashboardPanels({
        userId,
        userName: userDisplayName(user) || user.name,
        userEmail: user.email,
        workspaceIds: loaded.map((workspace) => workspace.id)
      })
    ),
    isStudent ? loadStudentDashboardSnapshot(userId) : Promise.resolve(null)
  ]);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0] ?? null;
  const selectedWorkspaceRole = selectedWorkspace?.members[0]?.role;
  const sortValue = normalizeSort(sort);
  const viewValue = normalizeView(view);
  const projects = selectedWorkspace ? sortProjects(selectedWorkspace.projects, sortValue) : [];

  const accountName = userDisplayName(user) || `${(user.email ?? "Your").split("@")[0]}'s Account`;
  const totalProjects = selectedWorkspace?.projects.length ?? 0;
  const firstName = (userDisplayName(user) || user.name || "").trim().split(/\s+/)[0] || null;

  if (isStudent && snapshot) {
    return (
      <StudentHome
        snapshot={snapshot}
        upNext={dashboardPanels.upNext}
        activity={dashboardPanels.activity}
        firstName={firstName}
      />
    );
  }

  const canCreate = access.canManageWorkspaces && selectedWorkspace !== null && canCreateInWorkspace(selectedWorkspaceRole);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <span className="rec-dot rec-dot-red" />
            {dashboardPanels.upNext?.cycleNumber ? `Live Cycle - Cycle ${dashboardPanels.upNext.cycleNumber}` : "Live Cycle"}
          </>
        }
        title={selectedWorkspace?.name ?? accountName}
        description={
          selectedWorkspace
            ? `${totalProjects} active package${totalProjects === 1 ? "" : "s"} · ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"} · Shows Wed & Fri`
            : "Select a workspace to start reviewing packages."
        }
        actions={
          selectedWorkspace ? (
            <div className="inline-flex items-center gap-1 rounded-md border border-border p-1 text-sm" aria-label="Sort packages">
              {(["name", "recent", "size"] as const).map((value) => (
                <Link
                  key={value}
                  href={`/dashboard?workspaceId=${selectedWorkspace.id}&sort=${value}&view=${viewValue}`}
                  aria-current={sortValue === value ? "true" : undefined}
                  className={`rounded-md px-2.5 py-1.5 ${
                    sortValue === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {value === "name" ? "Name" : value === "recent" ? "Recent" : "Size"}
                </Link>
              ))}
            </div>
          ) : null
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {!selectedWorkspace ? (
          <section className="rounded-md border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            You do not have any workspaces yet.
          </section>
        ) : projects.length === 0 && !canCreate ? (
          <section className="rounded-md border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-2 h-5 w-5 text-[var(--brand-green)]" />
            No projects in this workspace yet.
          </section>
        ) : (
          <section
            className={`grid content-start gap-4 ${viewValue === "list" ? "grid-cols-1" : "sm:grid-cols-2 2xl:grid-cols-3"}`}
          >
            {projects.map((project, index) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group overflow-hidden rounded-md border border-border bg-card transition hover:border-[var(--brand-green)]/40"
              >
                <div className={`brand-tile-orbs relative h-24 p-4 ${TILE_GRADIENTS[index % TILE_GRADIENTS.length]}`}>
                  <p className="relative text-lg font-semibold tracking-tight text-soft-white">{project.name}</p>
                  <p className="relative text-xs font-medium text-soft-white/85">{selectedWorkspace.name}</p>
                </div>
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    {project._count.mediaItems} media file{project._count.mediaItems === 1 ? "" : "s"}
                  </span>
                  {access.canManageWorkspaces ? (
                    <DeleteEntityButton
                      endpoint={`/api/projects/${project.id}`}
                      label={project.name}
                      description="This permanently deletes the project and all media files in it. This action cannot be undone."
                      redirectTo="/dashboard"
                      className="relative z-10"
                    />
                  ) : null}
                </div>
              </Link>
            ))}
            {canCreate ? <CreateProjectTile workspaceId={selectedWorkspace.id} /> : null}
          </section>
        )}

        <aside className="flex flex-col gap-5">
          {dashboardPanels.upNext ? <MyPackageCard upNext={dashboardPanels.upNext} compact /> : null}
          <ActivityCard activity={dashboardPanels.activity} />
        </aside>
      </div>
    </div>
  );
}

function StudentHome({
  snapshot,
  upNext,
  activity,
  firstName
}: {
  snapshot: StudentDashboardSnapshot;
  upNext: DashboardUpNext | null;
  activity: DashboardActivityEntry[];
  firstName: string | null;
}) {
  const steps = upNext ? homeStageSteps(upNext.stages) : [];
  const current = steps.find((step) => step.tone === "current") ?? null;
  const currentDue = current ? formatStageDueLabel(current.dueDate) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={upNext ? `Cycle ${upNext.cycleNumber}` : snapshot.semesterLabel}
        title={firstName ? `Hi, ${firstName}` : "Dashboard"}
        description={
          current
            ? `${current.label}: ${currentDue ?? "submit when ready"}.`
            : upNext
              ? "Every stage of your package is submitted."
              : "You aren't assigned to a package this cycle yet."
        }
        actions={
          current ? (
            <Link href={current.href as never} className={buttonVariants()}>
              Open {current.label}
            </Link>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {upNext ? (
            <MyPackageCard upNext={upNext} unreadFeedback={snapshot.unreadFeedback} snapshot={snapshot} />
          ) : (
            <section className="flex h-full flex-col justify-center rounded-md border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
              You aren&apos;t assigned to a package this cycle yet. Ask a producer to add you.
            </section>
          )}
        </div>
        <GradeCard snapshot={snapshot} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <ThisWeekCard snapshot={snapshot} />
        <ActivityCard activity={activity} />
      </div>
    </div>
  );
}

function CardHeading({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="display-sm text-foreground">{title}</h2>
      {href && linkLabel ? (
        <Link href={href as never} className="text-sm text-[var(--brand-green)] hover:text-foreground">
          {linkLabel} →
        </Link>
      ) : null}
    </div>
  );
}

function MyPackageCard({
  upNext,
  unreadFeedback,
  snapshot,
  compact = false
}: {
  upNext: DashboardUpNext;
  unreadFeedback?: number;
  snapshot?: StudentDashboardSnapshot;
  compact?: boolean;
}) {
  const steps = homeStageSteps(upNext.stages);
  const current = steps.find((step) => step.tone === "current");
  const dueLabels = Object.fromEntries(steps.map((step) => [step.key, formatStageDueLabel(step.dueDate)]));
  const people = [
    upNext.memberNames.filter(Boolean).join(", "),
    upNext.producerName ? `Producer: ${upNext.producerName}` : "No producer assigned"
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="flex h-full flex-col gap-4 rounded-md border border-border bg-card p-5">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">My package</div>
        <h2 className="display-sm mt-1 text-foreground">{upNext.groupTopic?.trim() || "Untitled package"}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{people}</p>
      </div>
      {compact ? (
        current ? (
          <Link href={current.href as never} className="text-sm text-[var(--brand-green)] hover:text-foreground">
            {current.label}
            {dueLabels[current.key] ? ` · ${dueLabels[current.key]}` : ""} →
          </Link>
        ) : null
      ) : (
        <StageTimeline steps={steps} dueLabels={dueLabels} />
      )}
      {compact ? null : (
        <dl className="mt-auto flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Check-ins</dt>
            <dd className="font-mono-broadcast tabular-nums">
              {upNext.checkInsDone} / {upNext.checkInsTotal}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Feedback</dt>
            <dd>
              <Link href={(current?.href ?? "/brainstorming") as never} className="hover:text-[var(--brand-green)]">
                {unreadFeedback ? `${unreadFeedback} unread` : "No unread notes"}
              </Link>
            </dd>
          </div>
          {snapshot ? (
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Extensions</dt>
              <dd>
                <Link href="/extension-requests" className="hover:text-[var(--brand-green)]">
                  <span className="font-mono-broadcast tabular-nums">
                    {snapshot.extensionsRemaining} / {snapshot.extensionBank}
                  </span>{" "}
                  days left
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}

function GradeCard({ snapshot }: { snapshot: StudentDashboardSnapshot }) {
  const rows = [
    {
      label: "Packages · 55%",
      value: snapshot.packages.possible > 0 ? `${snapshot.packages.earned} / ${snapshot.packages.possible}` : "—",
      href: "/grades"
    },
    {
      label: "Participation · 35%",
      value:
        snapshot.participation.possible > 0 ? `${snapshot.participation.earned} / ${snapshot.participation.possible}` : "—",
      href: "/grades"
    },
    {
      label: "Livestream",
      value: `${formatHours(snapshot.livestreamHours)} / ${snapshot.requiredLivestreamHours}h${
        snapshot.livestreamPoints === null ? "" : ` · ${snapshot.livestreamPoints} pts`
      }`,
      href: "/livestreams"
    }
  ];

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border bg-card p-5">
      <CardHeading title="Grade" href="/grades" linkLabel="All grades" />
      <div className="flex items-baseline gap-3">
        <span
          className={`text-4xl font-semibold leading-none tracking-tight ${
            snapshot.letter ? "text-[var(--brand-green)]" : "text-muted-foreground"
          }`}
        >
          {snapshot.letter ?? "—"}
        </span>
        <span className="text-sm text-muted-foreground">
          {snapshot.percentage === null ? "Not gradeable yet" : `${snapshot.percentage.toFixed(1)}% estimated`} ·{" "}
          {snapshot.semesterLabel}
        </span>
      </div>
      <dl className="flex flex-col">
        {rows.map((row) => (
          <Link
            key={row.label}
            href={row.href as never}
            className="flex items-center justify-between gap-3 border-t border-border py-2.5 text-sm hover:text-[var(--brand-green)]"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-mono-broadcast tabular-nums">{row.value}</dd>
          </Link>
        ))}
      </dl>
    </section>
  );
}

function ThisWeekCard({ snapshot }: { snapshot: StudentDashboardSnapshot }) {
  const week = snapshot.thisWeek;
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-5">
      <CardHeading title="This week" href="/grades" linkLabel="Participation" />
      {week && week.possible > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {week.label}:{" "}
            <span className="font-mono-broadcast tabular-nums text-foreground">
              {week.earned} / {week.possible}
            </span>{" "}
            points · Mon 10 · Tue/Thu 20
          </p>
          <div className="flex flex-wrap gap-1.5">
            {week.days.map((day) => (
              <span key={day.weekday} className="meta-pill">
                {day.weekday} {day.points === null ? "—" : `${day.points}/${day.maxPoints}`}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No class days scored yet this week.</p>
      )}
    </section>
  );
}

function ActivityCard({ activity }: { activity: DashboardActivityEntry[] }) {
  return (
    <section className="rounded-md border border-border bg-card p-5">
      <CardHeading title="Activity" />
      {activity.length > 0 ? (
        <div className="mt-3 flex flex-col">
          {activity.map((entry, index) => (
            <ActivityRow
              key={entry.id}
              palette={(["av-green", "av-red", "av-blue", "av-purple", "av-gray"] as const)[index % 5]}
              initials={entry.initials}
              who="You"
              what={entry.verb}
              what2={entry.subject ?? "an item"}
              when={formatRelativeTime(entry.createdAt)}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No recent activity from you yet.</p>
      )}
    </section>
  );
}

function formatHours(hours: number) {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function ActivityRow({
  palette,
  initials,
  who,
  what,
  what2,
  when
}: {
  palette: "av-green" | "av-red" | "av-gray" | "av-purple" | "av-blue";
  initials: string;
  who: string;
  what: string;
  what2: string;
  when: string;
}) {
  return (
    <div className="flex items-start gap-2.5 border-t border-border py-2.5 first:border-t-0 first:pt-0">
      <div className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[11px] font-bold ${palette}`}>
        {initials}
      </div>
      <div className="min-w-0">
        <div className="text-xs">
          <span className="font-semibold text-foreground">{who}</span>{" "}
          <span className="text-muted-foreground">{what} </span>
          <strong className="font-semibold text-foreground">{what2}</strong>
        </div>
        <div className="mt-0.5 font-mono-broadcast text-[10px] tabular-nums text-[var(--ink-5)]">{when}</div>
      </div>
    </div>
  );
}
