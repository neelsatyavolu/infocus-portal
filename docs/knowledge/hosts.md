# Hosts

Same Next.js app. Host routing in `middleware.ts`.

| Host | Surface | What else opens there |
|---|---|---|
| `infocusportal.com` | Main Portal (public home page at `/`) | Everything |
| `grades.infocusportal.com` | Student grades home (`/grades`) | `/grade-editor`, `/participation` |
| `teleprompter.infocusportal.com` | Teleprompter, full screen with no sidebar | Nothing else |
| `equipment.infocusportal.com` | Equipment checkout (`/equipment`) | Equipment pages only |
| `meet.infocusportal.com` | Meetings: `/` is the Meetings tab, `/producers` the InFocus Producer Meeting, `/<meeting id>` a call | `/meetings/<id>` (notes) |
| `drive.infocuspaly.com` | InFocus Drive (other repo) | — |

**The old address, infocuspaly.com,** still works for every host above (`grades.infocuspaly.com`, `meet.infocuspaly.com`, …). In a browser, a page there moves permanently to the same page on infocusportal.com, so you may need to sign in once more. It doesn't move inside the InFocus iPhone and Mac apps (they keep using the address they were built with until they're updated), on kiosks (the studio teleprompter and equipment station), or for the API.

Sign-in, access restricted, maintenance, onboarding, and Settings work on every host. Any other page on the grades or teleprompter host goes back to that host's home; on the equipment host it goes to `/equipment`; on the meet host it opens on the main Portal host (so the sidebar keeps working).

**Old meeting links** on the main host (`/meet/<id>`, `/meet/producers`, `/meetings`, `/meetings/<id>`) move permanently to the meet host, keeping anything after `?`. They don't move:
- inside the InFocus Portal iPhone app (it keeps opening meetings on the main host);
- for link-preview crawlers (iMessage, Slack, …), which still get the preview card;
- for the notes taker page (`/meet-scribe`), preview pages and the API.

Notifications link to `infocusportal.com/meet/<id>`; in a browser that moves to the meet host. App notifications (iPhone and Mac) use the same link on `infocuspaly.com`, the address the installed apps recognize.

Session cookie `infocus_session` uses the request's domain (`Domain=.infocusportal.com` or `.infocuspaly.com`) in production, so one sign-in covers every host on that domain; the two domains have separate sign-ins. Google sign-in returns to the main host of the domain it started on (`https://infocusportal.com/api/auth/google/callback` or the infocuspaly.com one). After sign-in, Portal returns you to the page you asked for, even on a subdomain (for example a meeting link on the meet host).

The studio teleprompter Mac can open the teleprompter host without signing in using a kiosk link (see `teleprompter.md`).

More: `docs/SUBDOMAINS.md`.
