"use client";

import { SettingsSection } from "@/components/settings-layout";
import type { AdminHealth } from "./admin-status";
import type { BackupStatus, GoogleCalendarStatus, Remote, ReportMessage, YoutubeStatus } from "./admin-types";
import { BackupsSection } from "./backups-section";
import { DangerZoneSection } from "./danger-zone-section";
import { GoogleCalendarCard } from "./google-calendar-card";
import type { OAuthResults } from "./use-admin-navigation";
import { YoutubeChannelCard } from "./youtube-channel-card";

/** Admin → System (adviser and super admin): integrations, backups, and the danger zone. */
export function SystemView({
  youtube,
  googleCalendar,
  oauth,
  onDismissOauth,
  health,
  backups,
  backupsError,
  onRetryBackups,
  onMessage,
  onReset
}: {
  youtube: Remote<YoutubeStatus>;
  googleCalendar: Remote<GoogleCalendarStatus>;
  oauth: OAuthResults;
  onDismissOauth: (key: keyof OAuthResults) => void;
  health: AdminHealth;
  backups: BackupStatus | null;
  backupsError: string | null;
  onRetryBackups: () => void;
  onMessage: ReportMessage;
  onReset: () => Promise<void>;
}) {
  return (
    <div id="system" className="scroll-mt-24 space-y-6">
      <SettingsSection
        id="integrations"
        title="Integrations"
        description="Google accounts Portal acts as. Reconnect when a status turns red."
      >
        <div className="grid gap-4 @2xl:grid-cols-2">
          <YoutubeChannelCard status={youtube} result={oauth.youtube} onDismissResult={() => onDismissOauth("youtube")} />
          <GoogleCalendarCard
            status={googleCalendar}
            result={oauth.googleCalendar}
            onDismissResult={() => onDismissOauth("googleCalendar")}
          />
        </div>
      </SettingsSection>

      {health.backups ? (
        <BackupsSection
          backups={backups}
          error={backupsError}
          health={health.backups}
          onRetry={onRetryBackups}
          onMessage={onMessage}
        />
      ) : null}

      <DangerZoneSection onReset={onReset} />
    </div>
  );
}
