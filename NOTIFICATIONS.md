# Notifications Reference

Portal notifies people through three channels: **email** (Resend), **browser push** (Web Push, per browser), and **Mac notifications** (Apple Push to the InFocus Mac app). The full, current list of events and recipients lives in [docs/knowledge/notifications.md](docs/knowledge/notifications.md). This file covers how the channels relate.

## Email

Every email goes through `src/lib/email.ts`. Most use `sendBrandedEmails`; the YouTube publication email uses `sendPreparedEmail` (retryable, idempotent), and the legacy video-uploaded email sends directly.

## Browser push

Web Push (`src/lib/web-push.ts`, `src/server/push-notify.ts`) goes to browsers that turned on **Browser notifications** in Settings, filtered by the Announcements / Comments / Grades switches. Senders call it explicitly; not every email has a browser push.

## Mac notifications

- **Rule:** a Mac notification goes out exactly when an email does, to the same people. `sendBrandedEmails` calls `sendNativePushToEmails` (`src/lib/native-push.ts`) alongside the email, so new emails get Mac notifications automatically. The YouTube publication email and the legacy video-uploaded email push explicitly.
- **Not pushed** (`push: false`): sign-in codes, account invites, access-request decisions, and the Settings test email.
- **Content:** title = email subject (package events use their shorter push title), text = first non-greeting paragraph (package events use their push body), click = the email's button link, opened in the app.
- **Matching:** recipients are matched to Portal users by account email or notification email, ignoring case. Only users with a registered Mac (`NativePushDevice`) get anything.
- **Delivery:** `src/lib/apns.ts` (HTTP/2 + ES256 provider token, no dependency). Tokens Apple reports as gone are deleted. Failures are logged without tokens and never affect the email.
- **Devices:** the app registers at `POST /api/push/native-device` under the real signed-in user (never a View as target) and removes itself with `DELETE` on sign-out. Settings → Mac app notifications → Test calls `POST /api/push/native-device/test`.
- **Config:** `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_TOPIC` ([docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)). Unset means Mac notifications are skipped.
