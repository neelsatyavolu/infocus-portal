# Notifications Reference

Portal notifies people through three channels: **email** (Resend), **browser push** (Web Push, per browser), and **Mac notifications** (Apple Push to the InFocus Mac app). The full, current list of events and recipients lives in [docs/knowledge/notifications.md](docs/knowledge/notifications.md). This file covers how the channels relate.

## Email

Every email goes through `src/lib/email.ts`. Most use `sendBrandedEmails`; the YouTube publication email uses `sendPreparedEmail` (retryable, idempotent), and the legacy video-uploaded email sends directly.

## Browser push

Web Push (`src/lib/web-push.ts`, `src/server/push-notify.ts`) goes to browsers that turned on **Browser notifications** in Settings, filtered by the Announcements / Comments / Grades switches. Senders call it explicitly; not every email has a browser push.

## Mac and iPhone notifications

The InFocus Mac app and the InFocus Portal iPhone app (`infocus-drive` repo, `mac/` and `ios/`) get the same notifications.

- **Rule:** an app notification goes out exactly when an email does, to the same people. `sendBrandedEmails` calls `sendNativePushToEmails` (`src/lib/native-push.ts`) alongside the email, so new emails get app notifications automatically. The YouTube publication email and the legacy video-uploaded email push explicitly.
- **Not pushed** (`push: false`): sign-in codes, account invites, access-request decisions, and the Settings test email.
- **Content:** title = email subject (package events use their shorter push title), text = first non-greeting paragraph (package events use their push body), click = the email's button link, opened in the app.
- **Matching:** recipients are matched to Portal users by account email or notification email, ignoring case. Only users with a registered Mac or iPhone (`NativePushDevice`) get anything.
- **Delivery:** `src/lib/apns.ts` (HTTP/2 + ES256 provider token, no dependency). Tokens Apple reports as gone are deleted. Failures are logged without tokens and never affect the email.
- **Devices:** the app registers at `POST /api/push/native-device` under the real signed-in user (never a View as target), with `platform` `macos` (default) or `ios`, which picks the APNs topic. It removes itself with `DELETE` on sign-out. Settings → Mac/iPhone app notifications → Test calls `POST /api/push/native-device/test`.
- **Config:** `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, and the topics `APNS_TOPIC` (Mac) and `APNS_IOS_TOPIC` (iPhone) ([docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)). An app without its topic gets nothing.

## Public InFocus app alerts

The public InFocus iPhone app (`infocus-news-app` repo, bundle `com.infocuspaly.news`) has no account. An iPhone saves its choices (new shows, new stories, going live) at `POST /api/public/news-devices` (`NewsPushDevice`; `DELETE` when all are off). `runNewsAlerts()` (`src/server/news-alerts.ts`), run every 10 minutes by Vercel Cron at `/api/cron/news-alerts` (`CRON_SECRET` bearer), checks the newest public show on YouTube, the newest infocusnews.tv story and live streams, and alerts each new item once (`NewsFeedState` remembers what was announced; the first run only records). Payload keys: `kind` (`show`, `story`, `live`) plus `videoId` or `postId`. Topic: `APNS_NEWS_TOPIC`.
