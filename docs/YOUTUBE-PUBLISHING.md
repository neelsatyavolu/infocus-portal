# YouTube package publishing

Publishing Queue sends each queued Final Cut to the configured InFocus channel as unlisted, beginning on its Pacific air date. The feature uses the existing Inngest endpoint and Resend account. No upload or email is sent merely by applying the migration.

## Activation

1. Review and apply `prisma/migrations/20260919_youtube_publishing/migration.sql` through the normal production migration process. This adds only the manager, publication, and email-outbox tables. Regenerate Prisma on deployment.
2. Enable YouTube Data API v3 in the Google Cloud project. Authorize the **actual InFocus channel** (select the Brand Account if applicable) using an OAuth client with offline access and scopes `https://www.googleapis.com/auth/youtube.upload` and `https://www.googleapis.com/auth/youtube.readonly`. Store the refresh token in server environment configuration, never source control. Google OAuth Playground with **Use your own OAuth credentials** can perform this one-time authorization; use its exact redirect URI on the client and request offline access. Refresh tokens issued while an external consent app is in Testing may expire; complete the applicable consent setup before unattended use.
3. Set these server-only environment variables in the deployment:

   - `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`
   - `YOUTUBE_CHANNEL_ID`: the channel's `UC…` ID; the worker verifies the authorized channel before uploading.
   - `YOUTUBE_PUBLISHING_START_DATE`: activation date, `YYYY-MM-DD`. Set to the desired first automated air date, normally today or a future date. Earlier shows will **not** be backfilled.
   - `YOUTUBE_PUBLISH_HOUR_PACIFIC`: optional integer 0–23; default `0` (midnight).
   - Existing `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, and Drive/Bunny download configuration must be available.
4. Deploy and sync the existing `/api/inngest` endpoint. Confirm registration of `youtube-publications-discover` (every minute) and `youtube-package-publish`. The endpoint allows 300 seconds per request; each upload step transfers at most 8 MiB. Discovery is inert until all required YouTube settings are present. Use production-only credentials/configuration to prevent previews publishing against production data.
5. In Publishing Queue → **Managers**, assign recipients before the first scheduled upload. Initially use a deliberately queued test package, then verify the channel, visibility, email, and embed. This is a live upload and should be done deliberately by the operator.

YouTube restricts uploads by affected unverified API projects to private visibility. An API compliance audit may be required before unlisted automation works. The worker does not email a private or non-embeddable video as ready. See [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), and [resumable upload protocol](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol).

## Behavior and recovery

- Source version, title, channel and air date are pinned in `YoutubePublication`. The unique `rowId` prevents normal retries or requeueing from creating another publication. Transfer progress is queried from YouTube before each chunk, including recovery of a completed upload after a lost response. Final Cut storage must support HTTP byte ranges.
- `uploadSessionUrl` is a secret. Never expose it in queue APIs, logs, support messages, or job outputs. Tokens also stay inside job steps.
- A removed package does not advance. Moving an in-progress package to another air date stops it for reconciliation. Replacing/deleting the source during upload does not switch the pinned source to a different cut.
- Transient failures retry on the next discovery pass. `FAILED` means operator action is needed; the card shows a sanitized explanation. Correct a channel/privacy/audit issue in YouTube or configuration, then set the existing publication back to `PROCESSING` if it has a `videoId`, or `UPLOADING` if resuming a valid session. Keep its existing video/session identity.
- If the session expired or the result is uncertain, inspect YouTube Studio first. If the video exists, record its ID on the existing publication and resume `PROCESSING`. Start over only after confirming no completed upload exists. Do not clear publication records blindly. If an air date changed during an unfinished upload, reconcile the existing video/session and set the record's `showDate` to the intended queue date before resuming.
- Publication and recipient outbox records are committed together. Payloads are frozen, including sender, so retries use the same Resend body and idempotency key. Successful recipients are not resent. Pending deliveries remain eligible even if the package leaves the queue.
- Removing a manager or changing their account email cancels pending deliveries to that old recipient; it cannot retract mail already accepted by Resend. Discovery paginates the queue so stalled older records cannot block newer packages.
- Resend's [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys) last 24 hours. After 23 hours from the first attempt, uncertain deliveries stop for manual reconciliation. Check Resend for the key `youtube-publication/<email-record-id>`; mark confirmed sends delivered. Only reset an attempt after confirming it was not sent. Delivery details live in `YoutubePublicationEmail.lastError`; the queue shows an aggregate pending-email message.

Production setup, migration application, and a real channel upload require operator configuration; unit tests use mocks and do not publish videos or send email.
