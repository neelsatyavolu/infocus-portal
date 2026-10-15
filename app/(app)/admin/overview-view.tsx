"use client";

import { cn } from "@/src/lib/utils";
import { AccessRequestsSection } from "./access-requests-section";
import type { AdminHealth } from "./admin-status";
import type { PlatformAccessRequest, PlatformStats, ReportMessage } from "./admin-types";
import { HealthStrip, type HealthItem } from "./health-strip";
import { PlatformTotals } from "./platform-totals";

function healthItems(health: AdminHealth): HealthItem[] {
  const system: HealthItem[] = [
    health.youtube ? { key: "youtube", label: "YouTube channel", health: health.youtube, target: "integrations" } : null,
    health.googleCalendar
      ? { key: "gcal", label: "Google Calendar", health: health.googleCalendar, target: "integrations" }
      : null,
    health.backups ? { key: "backups", label: "Backups", health: health.backups, target: "backups" } : null
  ].filter((item): item is HealthItem => item !== null);
  return [...system, { key: "calendar", label: "Paly's calendar", health: health.calendarSync, target: "configuration" }];
}

/**
 * Admin → Overview: the status strip (does anything need fixing?), the access-request queue,
 * then the platform totals. Strip / panel / strip, so the edges match whether the queue is
 * empty or long. On phones a waiting queue moves to the top, since it is the work here.
 */
export function OverviewView({
  health,
  onNavigate,
  requests,
  onChanged,
  onMessage,
  stats,
  statsError
}: {
  health: AdminHealth;
  onNavigate: (target: string) => void;
  requests: PlatformAccessRequest[];
  onChanged: () => Promise<void>;
  onMessage: ReportMessage;
  stats: PlatformStats | null;
  statsError: string | null;
}) {
  const waiting = requests.some((entry) => entry.status === "PENDING");
  return (
    <div id="overview" className="flex scroll-mt-24 flex-col gap-6">
      <HealthStrip items={healthItems(health)} onSelect={onNavigate} />
      <div className={cn("min-w-0", waiting && "max-sm:order-first")}>
        <AccessRequestsSection requests={requests} onChanged={onChanged} onMessage={onMessage} />
      </div>
      <PlatformTotals stats={stats} error={statsError} />
    </div>
  );
}
