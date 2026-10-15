"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Shield, UserPlus } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/kit/empty-state";
import { ViewTabPanel, ViewTabs, type ViewTabItem } from "@/components/kit/view-tabs";
import { Button } from "@/components/ui/button";
import { SettingsNotice } from "@/components/settings-layout";
import { AddPersonDialog } from "./add-person-dialog";
import { AdminHeader } from "./admin-header";
import { AdminSkeleton } from "./admin-skeleton";
import {
  backupHealth,
  calendarSyncHealth,
  googleCalendarHealth,
  headerContextItems,
  needsAttention,
  systemNeedsAttention,
  youtubeHealth,
  type AdminHealth
} from "./admin-status";
import type { BackupStatus, Remote } from "./admin-types";
import type { AdminView } from "./admin-views";
import { OverviewView } from "./overview-view";
import { PeopleView } from "./people-view";
import { SchoolYearView } from "./school-year-view";
import { SystemView } from "./system-view";
import { useAdminConfiguration } from "./use-admin-configuration";
import { useAdminData } from "./use-admin-data";
import { useAdminIntegrations } from "./use-admin-integrations";
import { useAdminNavigation } from "./use-admin-navigation";

const TABS_ID = "admin";
const ROOT_CLASS = "route-enter @container space-y-5";
/** The views whose work is people, where the header offers Add person. */
const PEOPLE_VIEWS: ReadonlySet<AdminView> = new Set(["overview", "people"]);

/**
 * A tab label with a Danger warning icon when its view has something broken. The icon's shape, not
 * only its colour, carries the warning, and screen readers hear "needs attention". Tab marks only
 * ever mean "needs you".
 */
function tabLabel(label: string, alert: boolean): ReactNode {
  if (!alert) return label;
  return (
    <>
      {label}
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
      <span className="sr-only">, needs attention</span>
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className={ROOT_CLASS}>{children}</div>;
}

/**
 * Admin Dashboard: four views (Overview, People, School year, System) under tabs in the same
 * place as hub tabs, then the nameplate. Every view stays mounted (hidden when inactive), so all
 * loads start at once and the tab warnings are live.
 */
export default function AdminPage() {
  const data = useAdminData();
  const canAdmin = Boolean(data.me?.permissions.canManageAllowedEmails);
  const canSystem = Boolean(data.me?.permissions.canManagePlatformRoles);
  const ready = canAdmin && data.listsLoaded;

  const configuration = useAdminConfiguration(ready);
  const integrations = useAdminIntegrations(ready && canSystem);
  const navigation = useAdminNavigation({ enabled: ready, canSystem });
  const [addOpen, setAddOpen] = useState(false);

  const backupsRemote: Remote<BackupStatus> = data.backups
    ? { state: "ready", data: data.backups }
    : { state: data.backupsError ? "error" : "loading" };

  const health: AdminHealth = {
    youtube: canSystem ? youtubeHealth(integrations.youtube) : null,
    googleCalendar: canSystem ? googleCalendarHealth(integrations.googleCalendar) : null,
    backups: canSystem ? backupHealth(backupsRemote) : null,
    calendarSync: calendarSyncHealth(configuration.calendarSync)
  };

  if (data.loading && !ready) {
    return (
      <Shell>
        <AdminSkeleton />
      </Shell>
    );
  }

  if (data.loadError && (!data.me || (canAdmin && !data.listsLoaded))) {
    return (
      <Shell>
        <AdminHeader />
        <ErrorState
          size="page"
          title="Couldn't load Admin"
          message={data.loadError}
          onRetry={() => void data.refresh({ pageLoader: true, includeStats: true })}
        />
      </Shell>
    );
  }

  if (!canAdmin) {
    return (
      <Shell>
        <AdminHeader />
        <EmptyState
          size="page"
          icon={Shield}
          title="Admin is for executive producers, the adviser, and super admin."
          description="You do not have permission to manage platform settings."
        />
      </Shell>
    );
  }

  const view = navigation.view;
  const refreshLists = () => data.refresh({ pageLoader: false, includeStats: false });
  const tabs: Array<ViewTabItem<AdminView>> = [
    {
      value: "overview",
      label: "Overview",
      count: data.pendingRequests,
      countTone: "warning",
      countLabel: `${data.pendingRequests} access request${data.pendingRequests === 1 ? "" : "s"} waiting`
    },
    // No count on People: the panel header already shows it, and a tab mark means "needs you".
    { value: "people", label: "People" },
    { value: "school-year", label: tabLabel("School year", needsAttention(health.calendarSync)) },
    ...(canSystem ? [{ value: "system" as const, label: tabLabel("System", systemNeedsAttention(health)) }] : [])
  ];

  return (
    <Shell>
      <ViewTabs
        items={tabs}
        value={view}
        onChange={navigation.selectView}
        ariaLabel="Admin views"
        idPrefix={TABS_ID}
        // 13px labels and 16px gaps on phones, so all four tabs fit a 360px screen.
        className="-mt-1 gap-4 sm:gap-6 max-sm:[&>[role=tab]]:text-[13px]"
      />

      {/* Overview already shows every status and the queue, so its header just says what Admin is for.
          Add person belongs to the views about people (access requests, People); School year and
          System have no header action, so their main control is their own work. */}
      <AdminHeader
        role={data.me?.role ?? null}
        context={view === "overview" ? undefined : headerContextItems(data.pendingRequests, health)}
        onNavigate={(target) => navigation.goTo(target)}
        actions={
          PEOPLE_VIEWS.has(view) ? (
            <Button type="button" onClick={() => setAddOpen(true)}>
              <UserPlus aria-hidden="true" />
              Add person
            </Button>
          ) : undefined
        }
      />

      {data.message ? (
        <SettingsNotice tone="error" onDismiss={() => data.setMessage(null)}>
          {data.message}
        </SettingsNotice>
      ) : null}

      {/* One wrapper, so the hidden views never add spacing after the visible one. */}
      <div>
        <ViewTabPanel idPrefix={TABS_ID} value="overview" active={view === "overview"}>
          <OverviewView
            health={health}
            onNavigate={(target) => navigation.goTo(target)}
            requests={data.requests}
            onChanged={refreshLists}
            onMessage={data.setMessage}
            stats={data.stats}
            statsError={data.statsError}
          />
        </ViewTabPanel>

        <ViewTabPanel idPrefix={TABS_ID} value="people" active={view === "people"}>
          <PeopleView
            active={view === "people"}
            users={data.users}
            roles={data.roles}
            canManageRoles={canSystem}
            onChanged={refreshLists}
            onMessage={data.setMessage}
            onUserUpdated={data.updateUser}
            onUserRemoved={data.removeUser}
          />
        </ViewTabPanel>

        <ViewTabPanel idPrefix={TABS_ID} value="school-year" active={view === "school-year"}>
          <SchoolYearView
            cyclesPerSemester={data.cyclesPerSemester}
            onCyclesPerSemesterChange={data.setCyclesPerSemester}
            configuration={configuration}
            calendarHealth={health.calendarSync}
          />
        </ViewTabPanel>

        {canSystem ? (
          <ViewTabPanel idPrefix={TABS_ID} value="system" active={view === "system"}>
            <SystemView
              youtube={integrations.youtube}
              googleCalendar={integrations.googleCalendar}
              oauth={navigation.oauth}
              onDismissOauth={navigation.dismissOauth}
              health={health}
              backups={data.backups}
              backupsError={data.backupsError}
              onRetryBackups={() => void data.loadBackups()}
              onMessage={data.setMessage}
              onReset={() => data.refresh({ pageLoader: false, includeStats: true })}
            />
          </ViewTabPanel>
        ) : null}
      </div>

      <AddPersonDialog open={addOpen} onOpenChange={setAddOpen} onChanged={refreshLists} onMessage={data.setMessage} />
    </Shell>
  );
}
