import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Briefcase,
  Check,
  Circle,
  Clock,
  FolderKanban,
  Grid2X2,
  List,
  Sparkles
} from "lucide-react";
import { type PlatformRole } from "@prisma/client";
import { CreateProjectTile } from "@/components/create-project-tile";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { userDisplayName } from "@/src/lib/user-display";
import { buildPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import {
  formatRelativeTime,
  formatStageDueLabel,
  getDashboardData as fetchDashboardPanels,
  loadStudentDashboardSnapshot,
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
  "brand-gradient-red",
  "brand-gradient-4",
  "brand-gradient-2",
  "brand-gradient-3",
  "brand-gradient-5",
  "brand-gradient-ink"
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

async function getDashboardData(userId: string, platformRole: PlatformRole | null) {
  return prisma.workspace.findMany({
    where: buildWorkspaceAccessWhere({
      userId,
      platformRole
    }),
    include: {
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
        include: {
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


export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [{ workspaceId, sort, view }, currentAppUser] = await Promise.all([searchParams, getCurrentAppUser()]);
  const { userId, user, platformRole } = currentAppUser;
  const access = buildPlatformAccess(platformRole);
  const workspaces = await getDashboardData(userId, platformRole);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0] ?? null;
  const selectedWorkspaceRole = selectedWorkspace?.members[0]?.role;
  const sortValue = normalizeSort(sort);
  const viewValue = normalizeView(view);
  const projects = selectedWorkspace ? sortProjects(selectedWorkspace.projects, sortValue) : [];

  const accountName = userDisplayName(user) || `${(user.email ?? "Your").split("@")[0]}'s Account`;
  const totalProjects = selectedWorkspace?.projects.length ?? 0;
  const isStudent = !access.canManageWorkspaces;
  const [dashboardPanels, snapshot] = await Promise.all([
    fetchDashboardPanels({
      userId,
      userName: userDisplayName(user) || user.name,
      userEmail: user.email,
      workspaceIds: workspaces.map((workspace) => workspace.id)
    }),
    isStudent ? loadStudentDashboardSnapshot(userId) : Promise.resolve(null)
  ]);

  return (
    <div className="space-y-5">
      {isStudent && snapshot ? (
        <StudentSnapshot snapshot={snapshot} />
      ) : (
        <>
      {/* HERO — broadcast-banded cycle marquee */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-5">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-60" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <div className="eyebrow flex items-center gap-2">
              <span className="rec-dot rec-dot-red" />
              {dashboardPanels.upNext?.cycleNumber
                ? `Live Cycle - Cycle ${dashboardPanels.upNext.cycleNumber}`
                : "Live Cycle"}
            </div>
            <h1 className="display-md mt-2 text-foreground">
              {selectedWorkspace?.name ?? accountName}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {selectedWorkspace
                ? `Browse ${totalProjects} active package${totalProjects === 1 ? "" : "s"} · Shows Wed & Fri`
                : "Select a workspace to start reviewing packages."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="meta-pill">
              <Clock className="h-3.5 w-3.5" />
              {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}
            </span>
            {selectedWorkspace ? (
              <span className="meta-pill">
                <FolderKanban className="h-3.5 w-3.5" />
                {totalProjects} project{totalProjects === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* TOOLBAR */}
      <section className="rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="h-4 w-4" />
            {selectedWorkspace ? `Projects in ${selectedWorkspace.name}` : "No workspace selected"}
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1 text-sm">
              {(["name", "recent", "size"] as const).map((value) => (
                <Link
                  key={value}
                  href={`/dashboard?workspaceId=${selectedWorkspace?.id ?? ""}&sort=${value}&view=${viewValue}`}
                  className={`rounded-md px-2 py-1.5 ${
                    sortValue === value
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {value === "name" ? "Name" : value === "recent" ? "Recent" : "Size"}
                </Link>
              ))}
            </div>
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1 text-sm">
              <Link
                href={`/dashboard?workspaceId=${selectedWorkspace?.id ?? ""}&sort=${sortValue}&view=grid`}
                className={`grid h-7 w-7 place-items-center rounded-md ${
                  viewValue === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label="Grid view"
              >
                <Grid2X2 className="h-3.5 w-3.5" />
              </Link>
              <Link
                href={`/dashboard?workspaceId=${selectedWorkspace?.id ?? ""}&sort=${sortValue}&view=list`}
                className={`grid h-7 w-7 place-items-center rounded-md ${
                  viewValue === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label="List view"
              >
                <List className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {!selectedWorkspace ? (
        <section className="rounded-2xl border border-dashed border-border bg-muted/50 px-5 py-8 text-center text-sm text-muted-foreground">
          You do not have any workspaces yet.
        </section>
      ) : projects.length === 0 ? (
        <section className="space-y-3">
          <div className="rounded-2xl border border-dashed border-border bg-muted/50 px-5 py-8 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-2 h-5 w-5 text-[var(--brand-green)]" />
            No projects in this workspace yet.
          </div>
          {access.canManageWorkspaces && canCreateInWorkspace(selectedWorkspaceRole) ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <CreateProjectTile workspaceId={selectedWorkspace.id} />
            </div>
          ) : null}
        </section>
      ) : (
        <section className={`grid gap-4 ${viewValue === "list" ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
          {projects.map((project, index) => {
            const gradient = TILE_GRADIENTS[index % TILE_GRADIENTS.length];

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-[var(--brand-green)]/40 hover:bg-card/90"
              >
                <div className={`brand-tile-orbs relative h-28 p-4 ${gradient}`}>
                  <p className="relative text-lg font-semibold text-white drop-shadow-sm">{project.name}</p>
                  <p className="relative text-xs font-medium text-white/85">{selectedWorkspace.name}</p>
                </div>

                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {project._count.mediaItems} media file{project._count.mediaItems === 1 ? "" : "s"}
                    </span>
                  </div>

                  {access.canManageWorkspaces ? (
                    <div className="flex items-center justify-end">
                      <DeleteEntityButton
                        endpoint={`/api/projects/${project.id}`}
                        label={project.name}
                        description="This permanently deletes the project and all media files in it. This action cannot be undone."
                        redirectTo="/dashboard"
                        className="relative z-10"
                      />
                    </div>
                  ) : null}
                </div>
              </Link>
            );
          })}

          {access.canManageWorkspaces && selectedWorkspace && canCreateInWorkspace(selectedWorkspaceRole) ? (
            <CreateProjectTile workspaceId={selectedWorkspace.id} />
          ) : null}
        </section>
      )}
        </>
      )}

      {/* Up Next + Activity row */}
      <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="display-sm text-foreground">Up Next</h2>
            <span className="font-mono-broadcast text-xs text-muted-foreground">
              {dashboardPanels.upNext
                ? `Cycle ${dashboardPanels.upNext.cycleNumber} stages`
                : "Your cycle stages"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {dashboardPanels.upNext?.groupTopic
              ? `Package: ${dashboardPanels.upNext.groupTopic}`
              : "Submit each stage by its due date."}
          </p>
          {dashboardPanels.upNext ? (
            <div className="mt-4 flex flex-col gap-2.5">
              {dashboardPanels.upNext.stages.map((stage, index) => {
                const allPriorDone = dashboardPanels.upNext!.stages
                  .slice(0, index)
                  .every((prior) => prior.done);
                let tone: "done" | "warn" | "future";
                if (stage.done) tone = "done";
                else if (allPriorDone) tone = "warn";
                else tone = "future";
                const dueLabel = formatStageDueLabel(stage.dueDate);
                const meta =
                  tone === "done"
                    ? "Submitted"
                    : dueLabel ??
                      (tone === "warn" ? "Up next — submit when ready" : "Locked until prior stage");
                return (
                  <StageRow key={stage.key} tone={tone} title={stage.label} meta={meta} />
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-border bg-[hsl(var(--background))] px-4 py-6 text-center text-xs text-muted-foreground">
              You aren&apos;t assigned to a package this cycle yet.
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-border bg-card p-5">
          <h2 className="display-sm text-foreground">Activity</h2>
          {dashboardPanels.activity.length > 0 ? (
            <div className="mt-3 flex flex-col">
              {dashboardPanels.activity.map((entry, index) => (
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
            <div className="mt-3 rounded-lg border border-dashed border-border bg-[hsl(var(--background))] px-4 py-6 text-center text-xs text-muted-foreground">
              No recent activity from you yet.
            </div>
          )}
        </aside>
      </section>

      {isStudent && snapshot ? (
        <StudentDetailsRow snapshot={snapshot} upNext={dashboardPanels.upNext} />
      ) : null}
    </div>
  );
}

function pctOf(earned: number, possible: number) {
  if (possible <= 0) return null;
  return Math.round((earned / possible) * 1000) / 10;
}

function formatHours(hours: number) {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function StudentSnapshot({ snapshot }: { snapshot: StudentDashboardSnapshot }) {
  const packagePct = pctOf(snapshot.packages.earned, snapshot.packages.possible);
  const participationPct = pctOf(snapshot.participation.earned, snapshot.participation.possible);
  const livestreamPct = pctOf(snapshot.livestreamHours, snapshot.requiredLivestreamHours);

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Link
        href="/grades"
        className="rounded-2xl border border-border bg-card p-4 transition hover:border-[var(--brand-green)]/40 hover:bg-card/90"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Your grade
          </div>
          <span className="meta-pill">{snapshot.semesterLabel}</span>
        </div>
        <div
          className={`mt-2 font-display text-4xl font-extrabold italic leading-none tracking-tight ${
            snapshot.letter ? "text-[var(--brand-green)]" : "text-muted-foreground"
          }`}
        >
          {snapshot.letter ?? "—"}
        </div>
        <div className="mt-1 font-mono-broadcast text-xs text-[var(--brand-green)]">
          {snapshot.percentage === null ? "Not gradeable yet" : `${snapshot.percentage.toFixed(1)}% estimated`}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Packages, participation, and portfolio.</p>
      </Link>

      <SnapshotCard
        href="/grades"
        label="Packages"
        weight="55%"
        value={
          snapshot.packages.possible > 0
            ? `${snapshot.packages.earned} / ${snapshot.packages.possible}`
            : "—"
        }
        detail={packagePct === null ? "Not gradeable yet" : `${packagePct}% of category`}
        hint="Final cuts + check-ins"
        progress={packagePct}
      />
      <SnapshotCard
        href="/grades"
        label="Participation"
        weight="35%"
        value={
          snapshot.participation.possible > 0
            ? `${snapshot.participation.earned} / ${snapshot.participation.possible}`
            : "—"
        }
        detail={participationPct === null ? "Not gradeable yet" : `${participationPct}% of category`}
        hint="Mon 10 · Tue/Thu 20"
        progress={participationPct}
      />
      <SnapshotCard
        href="/livestreams"
        label="Livestream"
        weight={`${snapshot.requiredLivestreamHours}h`}
        value={`${formatHours(snapshot.livestreamHours)} / ${snapshot.requiredLivestreamHours}h`}
        detail={
          snapshot.livestreamPoints === null
            ? livestreamPct === null
              ? "No hours logged yet"
              : `${livestreamPct}% of required hours`
            : `${snapshot.livestreamPoints} pts earned`
        }
        hint="8 hours · 40 pts this semester"
        progress={livestreamPct}
      />
    </section>
  );
}

function StudentDetailsRow({
  snapshot,
  upNext
}: {
  snapshot: StudentDashboardSnapshot;
  upNext: DashboardUpNext | null;
}) {
  const week = snapshot.thisWeek;
  const weekPct = week ? pctOf(week.earned, week.possible) : null;
  const extensionPct = pctOf(snapshot.extensionsRemaining, snapshot.extensionBank);
  const teammates = upNext?.memberNames.filter(Boolean).join(" · ") || "No teammates listed";

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SnapshotCard
        href="/grades"
        label="This week"
        weight={week?.label ?? "Participation"}
        value={week && week.possible > 0 ? `${week.earned} / ${week.possible}` : "—"}
        detail={weekPct === null ? "No class days scored yet" : `${weekPct}% of this week`}
        hint="Mon 10 · Tue/Thu 20"
        progress={weekPct}
      >
        {week && week.days.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {week.days.map((day) => (
              <span key={day.weekday} className="meta-pill">
                {day.weekday} {day.points === null ? "—" : `${day.points}/${day.maxPoints}`}
              </span>
            ))}
          </div>
        ) : null}
      </SnapshotCard>

      <SnapshotCard
        href="/extension-requests"
        label="Extensions"
        weight={`${snapshot.extensionBank} days`}
        value={`${snapshot.extensionsRemaining} / ${snapshot.extensionBank}`}
        detail={
          snapshot.extensionsRemaining === snapshot.extensionBank
            ? "Full bank remaining"
            : `${snapshot.extensionsRemaining} day${snapshot.extensionsRemaining === 1 ? "" : "s"} left`
        }
        hint="Used against late final-cut days"
        progress={extensionPct}
      />

      <SnapshotCard
        href="/brainstorming"
        label="Feedback"
        weight="Producer"
        value={snapshot.unreadFeedback > 0 ? String(snapshot.unreadFeedback) : "0"}
        detail={
          snapshot.unreadFeedback > 0
            ? `${snapshot.unreadFeedback} unread comment${snapshot.unreadFeedback === 1 ? "" : "s"}`
            : "No unread comments"
        }
        hint="Stage notes from your producer"
        progress={null}
      />

      <SnapshotCard
        href="/a-roll"
        label="Your package"
        weight={upNext ? `Cycle ${upNext.cycleNumber}` : "Cycle"}
        value={upNext?.groupTopic?.trim() || "Unassigned"}
        detail={
          upNext
            ? upNext.producerName
              ? `Producer · ${upNext.producerName}`
              : "No producer assigned"
            : "Not on a package this cycle"
        }
        hint={
          upNext
            ? `${teammates} · ${upNext.checkInsDone}/${upNext.checkInsTotal} check-ins`
            : "Ask a producer to add you"
        }
        progress={upNext ? pctOf(upNext.checkInsDone, upNext.checkInsTotal) : null}
      />
    </section>
  );
}

function SnapshotCard({
  href,
  label,
  weight,
  value,
  detail,
  hint,
  progress,
  children
}: {
  href: string;
  label: string;
  weight: string;
  value: string;
  detail: string;
  hint: string;
  progress: number | null;
  children?: ReactNode;
}) {
  return (
    <Link
      href={href as never}
      className="rounded-2xl border border-border bg-card p-4 transition hover:border-[var(--brand-green)]/40 hover:bg-card/90"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <span className="meta-pill">{weight}</span>
      </div>
      <div className="mt-2 font-display text-3xl font-extrabold italic leading-none tracking-tight text-foreground">
        {value}
      </div>
      <div className="mt-1 font-mono-broadcast text-xs text-[var(--brand-green)]">{detail}</div>
      <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
      {progress !== null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[var(--brand-green)]"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      ) : null}
      {children}
    </Link>
  );
}

function StageRow({
  tone,
  title,
  meta
}: {
  tone: "done" | "warn" | "future";
  title: string;
  meta: string;
}) {
  const wrapperCls =
    tone === "warn"
      ? "border-[rgb(242,165,22,0.4)] bg-[rgb(242,165,22,0.06)]"
      : tone === "future"
        ? "border-border bg-[hsl(var(--background))] opacity-60"
        : "border-border bg-[hsl(var(--background))]";
  const iconCls =
    tone === "done"
      ? "border-[rgb(0,199,44,0.4)] bg-[rgb(0,199,44,0.18)] text-[var(--brand-green)]"
      : tone === "warn"
        ? "border-[rgb(242,165,22,0.4)] bg-[rgb(242,165,22,0.18)] text-[var(--brand-amber)]"
        : "border-border bg-card text-muted-foreground";
  const metaCls =
    tone === "warn" ? "text-[var(--brand-amber)]" : "text-muted-foreground";
  const Icon =
    tone === "done" ? Check : tone === "warn" ? AlertTriangle : Circle;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 ${wrapperCls}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`grid h-7 w-7 place-items-center rounded-full border ${iconCls}`}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={3} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className={`text-xs ${metaCls}`}>{meta}</div>
        </div>
      </div>
      {tone === "done" ? (
        <span className="status-pill status-approved">Submitted</span>
      ) : tone === "warn" ? (
        <span className="status-pill status-warn">Up next</span>
      ) : (
        <span className="status-pill status-neutral">Pending</span>
      )}
    </div>
  );
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
        <div className="mt-0.5 font-mono-broadcast text-[10px] text-[var(--ink-5)]">{when}</div>
      </div>
    </div>
  );
}
