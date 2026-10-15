"use client";

import { Panel } from "@/components/kit/panel";
import { buttonVariants } from "@/components/ui/button";
import { SettingsNotice } from "@/components/settings-layout";
import { HealthLine, HealthTag } from "./admin-ui";
import { googleCalendarHealth, googleCalendarStatusLine } from "./admin-status";
import { formatWhen, type GoogleCalendarStatus, type Remote } from "./admin-types";
import type { OAuthResult } from "./admin-views";

/**
 * Admin → Integrations: the InFocus Google account that sends meeting invites as Google Calendar
 * events. The tag is the one status mark; a recorded sync error shows in Danger whether or not
 * the account is still connected.
 */
export function GoogleCalendarCard({
  status,
  result,
  onDismissResult
}: {
  status: Remote<GoogleCalendarStatus>;
  /** What came back from Google's sign-in (?gcal=…), shown until dismissed. */
  result: OAuthResult | null;
  onDismissResult: () => void;
}) {
  const data = status.state === "ready" ? status.data : null;

  return (
    <Panel
      id="integration-google-calendar"
      title="Google Calendar"
      status={<HealthTag health={googleCalendarHealth(status)} />}
      description="Meeting invites go out as Google Calendar events from this account. Sign in as the InFocus Google account."
      footer={
        <a href="/api/admin/google-calendar/connect" className={buttonVariants({ variant: "outline" })}>
          {data?.connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
        </a>
      }
    >
      <div className="space-y-2">
        <HealthLine tone="neutral">{googleCalendarStatusLine(status)}</HealthLine>
        {data?.lastSyncError ? (
          <HealthLine tone="danger">Last sync failed: {data.lastSyncError}</HealthLine>
        ) : data?.connected && data.lastSyncedAt ? (
          <HealthLine tone="neutral">Last synced {formatWhen(data.lastSyncedAt)}</HealthLine>
        ) : null}
        {result ? (
          <SettingsNotice tone={result.ok ? "success" : "error"} onDismiss={onDismissResult}>
            {result.message}
          </SettingsNotice>
        ) : null}
      </div>
    </Panel>
  );
}
