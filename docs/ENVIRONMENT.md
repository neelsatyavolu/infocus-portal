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
| `SUPER_ADMIN_PASSWORD_USERNAME`, `SUPER_ADMIN_PASSWORD_HASH` | Optional password sign-in for the `PLATFORM_SUPER_ADMIN_EMAIL` account only (`src/server/password-sign-in.ts`). The hash comes from `op read "op://<vault>/<item>/password" \| npx tsx scripts/hash-password.ts`; the password itself is never stored. Unset either one to turn it off |

## Hosts and cookies

`SESSION_COOKIE_DOMAIN`, `GRADES_APP_URL`, `TELEPROMPTER_APP_URL`, `EQUIPMENT_APP_URL`. See [SUBDOMAINS.md](SUBDOMAINS.md).

`MEET_APP_URL` (server) and `NEXT_PUBLIC_MEET_APP_URL` (browser copy, for Copy link and the sidebar): the Meetings host, default `https://meet.infocusportal.com`; set both to the same value if you change it. Old meeting links on the main host only move there on `infocusportal.com` / `www.infocusportal.com`, or wherever `MEET_APP_URL` is set; local dev and Vercel previews keep meetings on their own host.

## Media storage

`MEDIA_STORAGE_PROVIDER` (`NAS` for new uploads), `NEXT_PUBLIC_MEDIA_STORAGE_HINT`, `DRIVE_BASE_URL`, `DRIVE_SERVICE_TOKEN`. See [NAS-STORAGE.md](NAS-STORAGE.md). Legacy Bunny: `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_PULL_ZONE`, `BUNNY_STREAM_SIGNING_KEY`, `BUNNY_WEBHOOK_SECRET`.

## Jobs, email, push

`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`.

App notifications (Apple Push): `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (contents of the `.p8` key; `\n` escapes are fine), plus one bundle ID per app: `APNS_TOPIC` (InFocus for Mac), `APNS_IOS_TOPIC` (InFocus Portal for iPhone, `com.infocuspaly.portal`), `APNS_NEWS_TOPIC` (the public InFocus iPhone app, `com.infocuspaly.news`). An app whose topic is unset gets no pushes. `YOUTUBE_API_KEY`: a YouTube Data API key restricted to that API (Google Cloud project with the Portal's YouTube OAuth client). The public app feeds (`/api/public/shows`, `/api/public/live`) read public videos with it, so they keep working even if the channel authorization lapses; without it they fall back to the channel authorization. `CRON_SECRET`: bearer token for manual calls to `/api/cron/news-alerts` (public app alerts; the 10-minute schedule is the Inngest function `news-alerts-every-ten-minutes`); without it the route refuses every call. The Portal Worker also sends it to `/api/service/shows/upload` (show → YouTube uploads), so without it shows never upload.

Apple App Review demo account (`src/lib/app-review.ts`): `APP_REVIEW_EMAIL` is the account; it is confined to its own sample workspace and left out of every people list. `APP_REVIEW_CODE` (12–32 digits, secret, only in App Store Connect's review notes) lets that email sign in with this fixed code instead of a mailed one; any other value turns the fixed code off. Create the account and workspace with `npx tsx scripts/seed-app-review.ts`. See `docs/knowledge/iphone-apps.md`.

## AI

`GEMINI_API_KEY` (teleprompter), `GEMINI_API_KEY_CHAT` (feedback scoring), `NVIDIA_API_KEY` (Portal assistant, tried first), `OPENROUTER_API_KEY` (Portal assistant fallback), `OPENROUTER_MODEL` (optional: the OpenRouter model to try first).

`CLOUDFLARE_WORKERS_AI_TOKEN` (Ideas tab): a Cloudflare API token with only the Workers AI permission, used with `CLOUDFLARE_ACCOUNT_ID` (or `R2_ACCOUNT_ID`, the same account). The job calls `@cf/openai/gpt-oss-120b` once per batch (a batch every 2 days; never more than one call a day, even when a run fails), capped at about 660 neurons a call, because meeting notes draw on the same free 10,000 neurons a day. Without the token no ideas are generated and the tab stays empty. After the first deploy, `PUT /api/inngest` so Inngest registers the job. Sending the Inngest event `ideas/generate.requested` runs the daily check right away (it still only writes a set when one is due).

## Google Docs and Sheets

`GOOGLE_API_KEY`, `GOOGLE_CREDENTIALS`, `GOOGLE_OAUTH_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_DOCS_MASTER_CALENDAR_DOC_ID`, `GOOGLE_SHEETS_SUBMITTED_ANNOUNCEMENTS_SPREADSHEET_ID`, `GOOGLE_SHEETS_SUBMITTED_ANNOUNCEMENTS_RANGE`, `GOOGLE_SHEETS_COLLEGE_VISITS_SPREADSHEET_ID`.

## Slack

`SLACK_BOT_TOKEN`, `SLACK_PROOF_OF_CONTACT_WEBHOOK_URL`, `SLACK_PROOF_OF_CONTACT_CHANNEL`, `SLACK_ANNOUNCEMENTS_CHANNEL`, `SLACK_CLASS_BOARD_CHANNEL` (channel ID for the Class Board standings post, Mon/Wed/Fri 7 PM Pacific; unset posts nothing. The bot needs `files:write` and, for @mentions, `users:read.email`).

## YouTube publishing

`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_CHANNEL_ID`, `YOUTUBE_PUBLISHING_START_DATE`, `YOUTUBE_PUBLISH_HOUR_PACIFIC`. The channel authorization comes from **Admin → Reconnect YouTube** (stored encrypted in the database with a key derived from `APP_AUTH_SECRET`); `YOUTUBE_REFRESH_TOKEN` is only a fallback when nothing is stored. See [YOUTUBE-PUBLISHING.md](YOUTUBE-PUBLISHING.md).

Posting packages to infocusnews.tv: `WORDPRESS_URL` (`https://infocusnews.tv`), `WORDPRESS_USERNAME` (the Portal's WordPress user), `WORDPRESS_APP_PASSWORD` (that user's login password: the site's API sign-in rejects application passwords). Unset, managers get the embed-code email instead. With `DRIVE_SERVICE_TOKEN` set, these requests go through Drive's relay, because the site blocks requests from Workers; Drive needs `WORDPRESS_URL` in its `.env`. Category picks use the Workers AI settings (`CLOUDFLARE_WORKERS_AI_TOKEN`); without them every story goes under News. See [YOUTUBE-PUBLISHING.md](YOUTUBE-PUBLISHING.md#infocusnewstv-stories).

Meetings calendar invites reuse `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` (and the same registered redirect, `/api/admin/youtube/callback`). The Google account comes from **Admin → Connect Google Calendar**, stored encrypted like the YouTube one; enable the Google Calendar API in that Cloud project. No new variables.

## Automatic show editing

Editing machines run [infocus-editor](https://github.com/neelsatyavolu/infocus-editor) and poll `/api/service/show-editor/*`. Everything is managed on the Editing tab (`/editing`) by producers, so none of these variables is required:
- **Linking:** a machine is linked by approving the code its setup app shows, and gets its own token. Several machines can be linked; one is active.
- **Settings:** auto-start, auto-publish, the pinned version, AI account order and the house rules are saved in the Portal.

The variables below are only fallbacks:
- `SHOW_EDITOR_TOKEN`: optional legacy secret (`openssl rand -hex 32`). A client sending it as `Authorization: Bearer …` counts as a machine named "legacy". It is separate from `CRON_SECRET` and `DRIVE_SERVICE_TOKEN`, which never leave the Portal.
- `SHOW_EDITOR_AUTO_START`: `1` turns auto-start on while the **Start editing by itself** setting has never been saved. With it on, a new recording that has settled in Drive `Shows/` starts the edit of the next show (at most one check every 5 minutes).
- `SHOW_EDITOR_AUTO_PUBLISH`: `1` turns auto-publish on while **Schedule clean edits by themselves** has never been saved. An edit with nothing flagged and every check passed is then scheduled with the Upload show defaults.
- `SHOW_EDITOR_TARGET_VERSION`: a release tag (e.g. `v0.3.1`), used while **Editor version** is empty. Unset means machines follow the newest release.
- `SHOW_EDITOR_REPO_URL`: the editor's git repository, used in the **Connect AI account** command (`uvx --from git+<repo> infocus-editor connect …`). Defaults to `https://github.com/neelsatyavolu/infocus-editor`; set it to run a fork.

The editor signs in to a Claude, Codex or Grok subscription, never an API key. **Connect AI account** gives a one-time code for one machine. The sign-in is sealed on the producer's computer to that machine's key, so the Portal only stores ciphertext and deletes it once the machine confirms it (or after an hour). The command and the link page use `APP_BASE_URL` as the Portal address.

Recordings are listed and downloaded through Drive (`DRIVE_BASE_URL`, `DRIVE_SERVICE_TOKEN`); Drive's service user needs read access to `Shows/`.

## Teleprompter kiosk

`TELEPROMPTER_KIOSK_TOKEN` (at least 16 characters), `TELEPROMPTER_KIOSK_SERIAL` (label only).

## Password vault and backups

`PASSWORD_VAULT_KEY`. Cloudflare R2 backups: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

## Meetings

`MEETING_ROOM_SECRET`: random value (32+ characters) shared with the meeting-room Worker; signs room tickets and Portal ↔ Worker calls. `MEETING_ROOM_URL`: the Worker's `https://` origin. Without both, joining a meeting fails with a "not set up" message. Meeting keys are sealed with `APP_AUTH_SECRET`. The Drive Scribe and its notes callback use `DRIVE_BASE_URL` and `DRIVE_SERVICE_TOKEN`. Optional usage meter: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ANALYTICS_TOKEN` (Account Analytics read); when set, new meetings can't start once the month's video traffic passes 900 GB.
