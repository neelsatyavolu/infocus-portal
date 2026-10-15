"use client";

import { Panel } from "@/components/kit/panel";
import { buttonVariants } from "@/components/ui/button";
import { SettingsNotice } from "@/components/settings-layout";
import { HealthLine, HealthTag } from "./admin-ui";
import { youtubeHealth, youtubeStatusLine } from "./admin-status";
import type { Remote, YoutubeStatus } from "./admin-types";
import type { OAuthResult } from "./admin-views";

/**
 * Admin → Integrations: the InFocus YouTube channel's authorization for show and package uploads.
 * The tag is the one status mark; the line under it is plain detail, and only Google's own error
 * message is drawn in Danger.
 */
export function YoutubeChannelCard({
  status,
  result,
  onDismissResult
}: {
  status: Remote<YoutubeStatus>;
  /** What came back from Google's sign-in (?youtube=…), shown until dismissed. */
  result: OAuthResult | null;
  onDismissResult: () => void;
}) {
  const reason = status.state === "ready" && !status.data.connected ? status.data.message : null;

  return (
    <Panel
      id="integration-youtube"
      title="YouTube channel"
      status={<HealthTag health={youtubeHealth(status)} />}
      description="Show and package uploads use this authorization. Google will ask you to choose the InFocus channel."
      footer={
        <a href="/api/admin/youtube/connect" className={buttonVariants({ variant: "outline" })}>
          Reconnect YouTube
        </a>
      }
    >
      <div className="space-y-2">
        <HealthLine tone="neutral">{youtubeStatusLine(status)}</HealthLine>
        {reason ? <HealthLine tone="danger">{reason}</HealthLine> : null}
        {result ? (
          <SettingsNotice tone={result.ok ? "success" : "error"} onDismiss={onDismissResult}>
            {result.message}
          </SettingsNotice>
        ) : null}
      </div>
    </Panel>
  );
}
