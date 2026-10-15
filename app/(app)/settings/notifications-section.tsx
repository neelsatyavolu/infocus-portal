"use client";

import { Alert, InlineError } from "@/components/kit/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SaveStatus, SettingsSection } from "@/components/settings-layout";
import { ChannelCard, ChannelCardSkeleton, ChannelGrid, HEADER_SWITCH_CLASS, SendMeLabel } from "./channel-card";
import { MacNotificationsCard, type AppNotificationsState } from "./mac-notifications-card";
import { browserDeviceTag, type BrowserDeviceState } from "./settings-status";
import { CATEGORIES, categoryLabels, preferenceKeyMap, type ChannelKey, type NotificationsState } from "./use-notifications";

const CHANNEL_WORDS: Record<ChannelKey, string> = { email: "Email", browser: "Browser" };

/** Why the Browser card carries a tag, in one line. */
function browserNote(device: BrowserDeviceState | null) {
  if (device === "unsupported") return "This browser can't show Portal notifications.";
  if (device === "blocked") return "This browser blocks notifications from Portal. Allow them in its site settings first.";
  return null;
}

/** A channel's Announcements / Comments / Grades switches. They stay usable while the channel is off. */
function SendMeList({ channel, state }: { channel: ChannelKey; state: NotificationsState }) {
  const word = CHANNEL_WORDS[channel];
  const enabled = channel === "email" ? state.channels.emailEnabled : state.channels.browserEnabled;
  const labelId = `notify-${channel}-send-me`;

  return (
    <div role="group" aria-labelledby={labelId}>
      <SendMeLabel id={labelId} note={enabled ? null : `when ${word} is on`} />
      <ul className="mt-1 divide-y divide-border">
        {CATEGORIES.map((category) => {
          const id = `notify-${channel}-${category}`;
          return (
            <li key={category} className="flex min-h-11 items-center justify-between gap-4">
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer py-2.5 text-sm text-foreground">
                {categoryLabels[category]}
              </label>
              <Switch
                id={id}
                checked={Boolean(state.channels[preferenceKeyMap[channel][category]])}
                onCheckedChange={(next) => state.updateCategoryPreference(channel, category, next)}
                aria-label={`${word} ${categoryLabels[category]}`}
                disabled={state.busy}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmailCard({ state, accountEmail }: { state: NotificationsState; accountEmail: string | null }) {
  const fieldError = state.notificationEmailError;

  return (
    <ChannelCard
      id="notifications-email"
      title="Email"
      controlId="notify-email"
      control={
        <Switch
          id="notify-email"
          checked={state.channels.emailEnabled}
          onCheckedChange={state.setEmailEnabled}
          aria-label="Email notifications"
          disabled={state.busy || state.emailTestSending}
          className={HEADER_SWITCH_CLASS}
        />
      }
      sendMe={<SendMeList channel="email" state={state} />}
      footerActions={
        <Button
          type="button"
          variant="outline"
          onClick={state.sendEmailTest}
          disabled={state.busy || state.emailTestSending || !state.channels.emailEnabled}
        >
          {state.emailTestSending ? "Sending…" : "Send test"}
        </Button>
      }
    >
      <form onSubmit={(event) => void state.saveNotificationEmail(event)} noValidate className="space-y-1.5">
        <label htmlFor="notification-email" className="block text-sm font-medium text-foreground">
          Send to
        </label>
        <div className="flex gap-2">
          <Input
            id="notification-email"
            type="email"
            value={state.notificationEmailInput}
            onChange={(event) => state.setNotificationEmailInput(event.target.value)}
            placeholder="notifications@example.com"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "notification-email-error" : "notification-email-hint"}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="outline" disabled={state.busy}>
            Save
          </Button>
        </div>
        {fieldError ? (
          <InlineError id="notification-email-error">{fieldError}</InlineError>
        ) : (
          <p id="notification-email-hint" className="break-words text-[13px] leading-snug text-muted-foreground">
            Optional. Leave blank to use {accountEmail ?? "your account email"}.
          </p>
        )}
      </form>
    </ChannelCard>
  );
}

function BrowserCard({ state }: { state: NotificationsState }) {
  const note = browserNote(state.browserDevice);

  return (
    <ChannelCard
      id="notifications-browser"
      title="Browser"
      tag={browserDeviceTag(state.browserDevice)}
      controlId="notify-browser"
      control={
        <Switch
          id="notify-browser"
          checked={state.channels.browserEnabled}
          onCheckedChange={state.toggleBrowser}
          aria-label="Browser notifications"
          disabled={state.busy}
          className={HEADER_SWITCH_CLASS}
        />
      }
      sendMe={<SendMeList channel="browser" state={state} />}
      footerStart="The test shows on this device only."
      footerActions={
        <Button type="button" variant="outline" onClick={state.sendBrowserTest} disabled={state.busy || !state.channels.browserEnabled}>
          Send test
        </Button>
      }
    >
      <div className="space-y-2">
        <p className="text-sm leading-snug text-[var(--ink-text)]">
          Pop-up notifications on this device. Turn it on for each device you use.
        </p>
        {note ? <p className="text-[13px] leading-snug text-muted-foreground">{note}</p> : null}
      </div>
    </ChannelCard>
  );
}

function EnableBrowserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enable browser notifications</DialogTitle>
          <DialogDescription>Make sure notifications are enabled in both your browser and your device settings.</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
          <li>Allow notifications for this site when your browser prompts you.</li>
          <li>In your browser settings, confirm notifications are allowed for this website.</li>
          <li>In your device settings (Mac/Windows/iOS/Android), make sure notifications for your browser are enabled.</li>
        </ol>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Settings → Notifications: one card per channel (Email, then Browser on the web or the InFocus
 * app's card inside the Mac or iPhone app), each with its own Send me list.
 */
export function NotificationsSection({
  state,
  app,
  accountEmail
}: {
  state: NotificationsState;
  app: AppNotificationsState;
  accountEmail: string | null;
}) {
  const firstLoad = !state.loaded && state.loading;
  // The first GET failed and no earlier copy exists: the switches would only show defaults, and
  // any toggle would save those over this person's settings. Keep placeholders until Try again
  // works, and keep the notice (with Try again) up until then.
  const loadFailed = !state.loaded && !state.loading;
  // Real preferences on screen, and we know whether this is an InFocus app.
  const showPrefs = state.loaded && state.appDevice !== undefined;

  return (
    <SettingsSection
      id="notifications"
      title="Notifications"
      description="Where Portal reaches you, and what it sends."
      actions={<SaveStatus text={firstLoad ? "Loading…" : state.savedLabel} pending={firstLoad} />}
    >
      {state.error || loadFailed ? (
        <Alert
          tone="danger"
          compact
          onDismiss={loadFailed ? undefined : state.clearError}
          action={
            loadFailed ? (
              <Button type="button" variant="outline" onClick={state.retry}>
                Try again
              </Button>
            ) : undefined
          }
        >
          {state.error ?? "Couldn't load your notification settings."}
        </Alert>
      ) : null}

      <ChannelGrid>
        {showPrefs ? <EmailCard state={state} accountEmail={accountEmail} /> : <ChannelCardSkeleton still={loadFailed} />}
        {state.appDevice ? (
          // The app's own setup (Turn on, Open settings, Send test) doesn't depend on the GET.
          <MacNotificationsCard app={app} email={state.loaded ? state.channels : null} />
        ) : showPrefs ? (
          <BrowserCard state={state} />
        ) : (
          <ChannelCardSkeleton still={loadFailed} />
        )}
      </ChannelGrid>

      <EnableBrowserDialog open={state.browserEnableModalOpen} onOpenChange={state.setBrowserEnableModalOpen} />
    </SettingsSection>
  );
}
