# Environment variables

Put these in `.env` (never commit it). Only the **Required** group is needed to run locally; every integration switches off when its variables are unset.

## Required

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `DIRECT_URL` | Direct (non-pooled) Postgres URL for Prisma, if you use a pooler |
| `APP_AUTH_SECRET` | Long random string; signs session JWTs |
| `APP_BASE_URL`, `NEXT_PUBLIC_APP_URL` | e.g. `http://localhost:3000` |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google sign-in |

## Staff identities

| Variable | Notes |
|---|---|
| `PLATFORM_SUPER_ADMIN_EMAIL` | Technical super admin |
| `PACKAGE_ADVISER_EMAIL` | Class adviser (Stage 2 approver, admin powers) |
| `VIEW_AS_LIMITED_ACTORS` | `actor@x=target@y\|other@y;actor2@x=target@y` |
| `HUB_MAINTENANCE_BYPASS_EMAILS` | Comma-separated |

## Hosts and cookies

`SESSION_COOKIE_DOMAIN`, `GRADES_APP_URL`, `TELEPROMPTER_APP_URL`, `EQUIPMENT_APP_URL`. See [SUBDOMAINS.md](SUBDOMAINS.md).

## Media storage

`MEDIA_STORAGE_PROVIDER` (`NAS` for new uploads), `NEXT_PUBLIC_MEDIA_STORAGE_HINT`, `DRIVE_BASE_URL`, `DRIVE_SERVICE_TOKEN`. See [NAS-STORAGE.md](NAS-STORAGE.md). Legacy Bunny: `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_PULL_ZONE`, `BUNNY_STREAM_SIGNING_KEY`, `BUNNY_WEBHOOK_SECRET`.

## Jobs, email, push

`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`.

## AI

`GEMINI_API_KEY` (teleprompter), `GEMINI_API_KEY_CHAT` (Portal assistant), `GROQ_API_KEY`, `GROQ_MODEL` (assistant fallback).

## Google Docs and Sheets

`GOOGLE_API_KEY`, `GOOGLE_CREDENTIALS`, `GOOGLE_OAUTH_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_DOCS_MASTER_CALENDAR_DOC_ID`, `GOOGLE_SHEETS_SUBMITTED_ANNOUNCEMENTS_SPREADSHEET_ID`, `GOOGLE_SHEETS_SUBMITTED_ANNOUNCEMENTS_RANGE`, `GOOGLE_SHEETS_COLLEGE_VISITS_SPREADSHEET_ID`.

## Slack

`SLACK_BOT_TOKEN`, `SLACK_PROOF_OF_CONTACT_WEBHOOK_URL`, `SLACK_PROOF_OF_CONTACT_CHANNEL`, `SLACK_ANNOUNCEMENTS_CHANNEL`.

## YouTube publishing

`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, `YOUTUBE_CHANNEL_ID`, `YOUTUBE_PUBLISHING_START_DATE`, `YOUTUBE_PUBLISH_HOUR_PACIFIC`. See [YOUTUBE-PUBLISHING.md](YOUTUBE-PUBLISHING.md).

## Teleprompter kiosk

`TELEPROMPTER_KIOSK_TOKEN` (at least 16 characters), `TELEPROMPTER_KIOSK_SERIAL` (label only).

## Password vault and backups

`PASSWORD_VAULT_KEY`. Cloudflare R2 backups: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
