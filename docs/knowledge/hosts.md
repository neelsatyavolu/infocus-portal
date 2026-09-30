# Hosts

Same Next.js app. Host routing in `middleware.ts`.

| Host | Surface | What else opens there |
|---|---|---|
| `infocuspaly.com` | Main Portal (public home page at `/`) | Everything |
| `grades.infocuspaly.com` | Student grades home (`/grades`) | `/grade-editor`, `/participation` |
| `teleprompter.infocuspaly.com` | Teleprompter, full screen with no sidebar | Nothing else |
| `equipment.infocuspaly.com` | Equipment checkout (`/equipment`) | Equipment pages only |
| `drive.infocuspaly.com` | InFocus Drive (other repo) | — |

Sign-in, access restricted, maintenance, onboarding, and Settings work on every host. Any other page on the grades or teleprompter host goes back to that host's home; on the equipment host it goes to `/equipment`.

Session cookie `infocus_session` uses `Domain=.infocuspaly.com` in production, so one sign-in covers every host. OAuth callback stays on `APP_BASE_URL` (`https://infocuspaly.com/api/auth/google/callback`). After sign-in, Portal returns you to the page you asked for, even on a subdomain.

The studio teleprompter Mac can open the teleprompter host without signing in using a kiosk link (see `teleprompter.md`).

More: `docs/SUBDOMAINS.md`.
