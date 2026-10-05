# Hosts

Same Next.js app. Host routing in `middleware.ts`.

| Host | Surface | What else opens there |
|---|---|---|
| `infocuspaly.com` | Main Portal (public home page at `/`) | Everything |
| `grades.infocuspaly.com` | Student grades home (`/grades`) | `/grade-editor`, `/participation` |
| `teleprompter.infocuspaly.com` | Teleprompter, full screen with no sidebar | Nothing else |
| `equipment.infocuspaly.com` | Equipment checkout (`/equipment`) | Equipment pages only |
| `meet.infocuspaly.com` | Meetings: `/` is the Meetings tab, `/producers` the InFocus Producer Meeting, `/<meeting id>` a call | `/meetings/<id>` (notes) |
| `drive.infocuspaly.com` | InFocus Drive (other repo) | — |

Sign-in, access restricted, maintenance, onboarding, and Settings work on every host. Any other page on the grades or teleprompter host goes back to that host's home; on the equipment host it goes to `/equipment`; on the meet host it opens on the main Portal host (so the sidebar keeps working).

**Old meeting links** on the main host (`/meet/<id>`, `/meet/producers`, `/meetings`, `/meetings/<id>`) move permanently to the meet host, keeping anything after `?`. They don't move:
- inside the InFocus Portal iPhone app (it keeps opening meetings on the main host);
- for link-preview crawlers (iMessage, Slack, …), which still get the preview card;
- for the notes taker page (`/meet-scribe`), preview pages and the API.

Notifications still link to `infocuspaly.com/meet/<id>` (what the iPhone app opens); in a browser that moves to the meet host.

Session cookie `infocus_session` uses `Domain=.infocuspaly.com` in production, so one sign-in covers every host. OAuth callback stays on `APP_BASE_URL` (`https://infocuspaly.com/api/auth/google/callback`). After sign-in, Portal returns you to the page you asked for, even on a subdomain (for example a meeting link on the meet host).

The studio teleprompter Mac can open the teleprompter host without signing in using a kiosk link (see `teleprompter.md`).

More: `docs/SUBDOMAINS.md`.
