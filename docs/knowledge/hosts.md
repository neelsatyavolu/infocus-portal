# Hosts

Same Next.js app. Host routing in `middleware.ts`.

| Host | Surface |
|---|---|
| `infocuspaly.com` | Main Portal |
| `grades.infocuspaly.com` | Student grades home |
| `teleprompter.infocuspaly.com` | Teleprompter |
| `equipment.infocuspaly.com` | Equipment checkout |
| `drive.infocuspaly.com` | InFocus Drive (other repo) |

Session cookie `infocus_session` uses `Domain=.infocuspaly.com` in production. OAuth callback stays on `APP_BASE_URL` (`https://infocuspaly.com/api/auth/google/callback`).

More: `docs/SUBDOMAINS.md`.
