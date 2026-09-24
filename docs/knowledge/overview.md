# Overview

InFocus Portal is the student broadcast production site for **InFocus News** (Palo Alto High School). It is not InFocus Drive (NAS file storage) and not a generic video-review SaaS.

**Product name:** InFocus Portal (browser tab, PWA, sign-in, emails). Do not rename the show or Drive.

## Who it is for

- **Students / reporters** — package work, grades, livestreams, announcements, calendar.
- **Associate producers** — assigned packages in Groups, Package Cycle (view), Members notes, publishing queue, The Show.
- **Executive producers** — all Groups, Grade Editor, Participation, Admin people, calendar cast.
- **Adviser** — same platform-admin powers as super admin; stage 2 of package approval only.
- **Super admin** — technical owner; can View as any user.

## Main hosts

| Host | App |
|---|---|
| `infocuspaly.com` | Portal (packages, calendar, admin, …) |
| `grades.infocuspaly.com` | Student grades |
| `teleprompter.infocuspaly.com` | Teleprompter |
| `drive.infocuspaly.com` | InFocus Drive (separate app) |
| `equipment.infocuspaly.com` | Equipment checkout, requests, and manage |

One sign-in covers Portal, grades, teleprompter, and equipment manage (shared session cookie). Sign in with Google or an emailed code. Checkout and requests stay public.

## Privacy and analytics

Page views are counted without cookies by Vercel Analytics and by n3el analytics (`analytics.n3el.dev`, run by the developer). n3el analytics gets only the site, page path (no query, IDs removed) and referring site. No names, emails, grades, IP addresses or content. Guest review links are not counted.

## What Portal is not

- Adding a person in Admin does not put them on a package roster. Use Package Cycle for that.
- Uploading a Final Cut does not put the package on air. A producer must **Send to queue**.
- Members (`/members`) is producer notes, not the account list. Accounts live in Admin → People.
- The bottom-right Portal assistant is for everyone signed in. It reads `docs/knowledge/`. Reporters do not get producer lookups; associates do not get grades.
