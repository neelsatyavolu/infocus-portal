"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FileVideo2, FolderKanban, HardDrive, Link2, MessageCircle, Shield, Users } from "lucide-react";
import {
  SettingsHeader,
  SettingsLayout,
  SettingsNotice,
  SettingsPanel,
  SettingsSection,
  type SettingsNavItem
} from "@/components/settings-layout";
import { AccessRequestsSection } from "./access-requests-section";
import {
  formatRoleLabel,
  formatStorage,
  getData,
  type BackupStatus,
  type PlatformAccessRequest,
  type PlatformMe,
  type PlatformStats,
  type PlatformUser,
  type RoleAssignment
} from "./admin-types";
import { BackupsSection } from "./backups-section";
import { DangerZoneSection } from "./danger-zone-section";
import { GoogleCalendarRow } from "./google-calendar-card";
import { PackageCyclesSection } from "./package-cycles-section";
import { PeopleSection } from "./people-section";
import { ProducerTeamSection } from "./producer-team-section";
import { YoutubeChannelRow } from "./youtube-channel-card";

function AdminHeader({ description, meta }: { description: string; meta?: ReactNode }) {
  return (
    <SettingsHeader
      eyebrow={
        <>
          <Shield className="h-3 w-3" aria-hidden="true" />
          Platform
        </>
      }
      title="Admin Dashboard"
      description={description}
      meta={meta}
    />
  );
}

function StatCell({
  Icon,
  label,
  value,
  detail
}: {
  Icon: typeof Users;
  label: string;
  value: string | number | null;
  detail: string | null;
}) {
  return (
    <div className="bg-card px-4 py-4 md:px-5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      {value === null ? (
        <div className="mt-2 h-6 w-16 animate-pulse rounded-sm bg-secondary" aria-hidden="true" />
      ) : (
        <p className="mt-1.5 font-mono text-2xl leading-none tabular-nums text-foreground">{value}</p>
      )}
      <p className="mt-1.5 min-h-4 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function OverviewSection({ stats }: { stats: PlatformStats | null }) {
  const totals = stats?.totals;
  const cells = [
    { Icon: Users, label: "Users", value: totals?.users, detail: totals ? `${totals.roleAssignments} elevated roles` : null },
    { Icon: FolderKanban, label: "Workspaces", value: totals?.workspaces, detail: totals ? `${totals.projects} projects` : null },
    { Icon: FileVideo2, label: "Media", value: totals?.activeMedia, detail: totals ? `${totals.versions} versions tracked` : null },
    {
      Icon: HardDrive,
      label: "Storage",
      value: stats ? formatStorage(stats.storage.estimatedBytes) : undefined,
      detail: stats ? (stats.storage.isEstimated ? "Estimated usage" : "Synced usage") : null
    },
    { Icon: MessageCircle, label: "Comments", value: totals?.comments, detail: totals ? "Review conversations" : null },
    { Icon: Link2, label: "Share links", value: totals?.activeShareLinks, detail: totals ? "Active guest links" : null }
  ];

  return (
    <SettingsSection id="overview" title="Overview">
      <SettingsPanel className="grid grid-cols-2 gap-px divide-y-0 bg-border sm:grid-cols-3 xl:grid-cols-6">
        {cells.map((cell) => (
          <StatCell key={cell.label} Icon={cell.Icon} label={cell.label} value={cell.value ?? null} detail={cell.detail} />
        ))}
      </SettingsPanel>
    </SettingsSection>
  );
}

export default function AdminPage() {
  const [me, setMe] = useState<PlatformMe | null>(null);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [accessRequests, setAccessRequests] = useState<PlatformAccessRequest[]>([]);
  const [cyclesPerSemester, setCyclesPerSemester] = useState(3);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupStatus | null>(null);

  const canManageAllowedEmails = Boolean(me?.permissions.canManageAllowedEmails);
  const canManagePlatformRoles = Boolean(me?.permissions.canManagePlatformRoles);
  const pendingAccessRequestCount = accessRequests.filter((entry) => entry.status === "PENDING").length;

  async function refresh(options?: { pageLoader?: boolean; includeStats?: boolean }) {
    const pageLoader = options?.pageLoader ?? true;
    const includeStats = options?.includeStats ?? true;
    if (pageLoader) {
      setLoading(true);
    }

    try {
      const nextMe = await getData<PlatformMe>("/api/platform/me");
      setMe(nextMe);

      if (nextMe.permissions.canManageAllowedEmails) {
        const statsPromise = includeStats
          ? getData<PlatformStats>("/api/platform/stats").then((nextStats) => {
              setStats(nextStats);
            })
          : null;

        const [roles, users, requests, program] = await Promise.all([
          getData<RoleAssignment[]>("/api/platform/roles"),
          getData<PlatformUser[]>("/api/platform/users"),
          getData<PlatformAccessRequest[]>("/api/platform/access-requests"),
          getData<{ cyclesPerSemester: number }>("/api/platform/program-settings")
        ]);

        setCyclesPerSemester(program.cyclesPerSemester);
        setRoleAssignments(roles);
        setPlatformUsers(users);
        setAccessRequests(requests);

        if (statsPromise) {
          void statsPromise.catch((error) => {
            setMessage(error instanceof Error ? error.message : "Failed to load admin stats.");
          });
        }
      }

      if (nextMe.permissions.canManagePlatformRoles) {
        try {
          setBackups(await getData<BackupStatus>("/api/platform/backups"));
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Failed to load backups.");
        }
      } else {
        setBackups(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load admin data.");
    } finally {
      if (pageLoader) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void refresh({ pageLoader: true, includeStats: true });
  }, []);

  const refreshLists = () => refresh({ pageLoader: false, includeStats: false });

  if (loading || !canManageAllowedEmails) {
    return (
      <div className="route-enter mx-auto w-full max-w-6xl space-y-6">
        <AdminHeader
          description={loading ? "Loading admin controls…" : "You do not have permission to manage platform settings."}
        />
        {!loading && message ? <SettingsNotice tone="error">{message}</SettingsNotice> : null}
      </div>
    );
  }

  const nav: SettingsNavItem[] = [
    { id: "overview", label: "Overview" },
    { id: "access-requests", label: "Access requests", badge: pendingAccessRequestCount },
    { id: "people", label: "People", badge: platformUsers.length },
    { id: "producer-team", label: "Producer Team" },
    { id: "package-cycles", label: "Package Cycles" },
    ...(canManagePlatformRoles
      ? [
          { id: "integrations", label: "Integrations" },
          { id: "backups", label: "Backups" },
          { id: "danger-zone", label: "Danger zone", tone: "danger" as const }
        ]
      : [])
  ];

  return (
    <SettingsLayout
      nav={nav}
      header={
        <AdminHeader
          description="People, access, producer roles, and how Portal is set up."
          meta={
            <>
              <span className="meta-pill">
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                {formatRoleLabel(me?.role ?? null)}
              </span>
              {pendingAccessRequestCount > 0 ? (
                <a href="#access-requests" className="meta-pill tabular-nums hover:bg-accent">
                  {pendingAccessRequestCount} pending access
                </a>
              ) : null}
            </>
          }
        />
      }
    >
      {message ? (
        <SettingsNotice tone="error" onDismiss={() => setMessage(null)}>
          {message}
        </SettingsNotice>
      ) : null}

      <OverviewSection stats={stats} />

      <AccessRequestsSection requests={accessRequests} onChanged={refreshLists} onMessage={setMessage} />

      <PeopleSection
        users={platformUsers}
        roles={roleAssignments}
        onChanged={refreshLists}
        onMessage={setMessage}
        onUserUpdated={(updated) =>
          setPlatformUsers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
        }
        onUserRemoved={(userId) => {
          setPlatformUsers((current) => current.filter((entry) => entry.id !== userId));
          setStats((current) =>
            current ? { ...current, totals: { ...current.totals, users: Math.max(0, current.totals.users - 1) } } : current
          );
        }}
      />

      <ProducerTeamSection
        roles={roleAssignments}
        users={platformUsers}
        canManage={canManagePlatformRoles}
        onChanged={refreshLists}
        onMessage={setMessage}
      />

      <PackageCyclesSection cyclesPerSemester={cyclesPerSemester} onCyclesPerSemesterChange={setCyclesPerSemester} />

      {canManagePlatformRoles ? (
        <>
          <SettingsSection
            id="integrations"
            title="Integrations"
            description="Google accounts Portal acts as. Reconnect when a status turns red."
          >
            <SettingsPanel>
              <YoutubeChannelRow />
              <GoogleCalendarRow />
            </SettingsPanel>
          </SettingsSection>

          <BackupsSection backups={backups} onMessage={setMessage} />

          <DangerZoneSection onReset={() => refresh({ pageLoader: false, includeStats: true })} />
        </>
      ) : null}
    </SettingsLayout>
  );
}
