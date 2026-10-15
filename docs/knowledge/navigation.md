# Navigation

Portal chrome is dark by default (Light is in Settings → Appearance). Sidebar depends on role. On phones and tablets under 1024px, the sidebar is hidden behind a menu button in the header.

Sidebar category headings use compact spacing, with 0.675rem above each heading.

## Header

- The InFocus logo goes to the dashboard.
- **Search…** (or ⌘K on a Mac, Ctrl+K on Windows) opens a command palette. Type a page name and press Enter to jump to any page you can open.
- Breadcrumbs (for example, Dashboard / project / video) are links: click one to go back up.

## Sidebar, top to bottom

Tabs with no note are shown to everyone signed in.

**Top**

- Dashboard (students) or Packages (associate producers and up)
- My package — reporters, and any producer (associate, executive, or super admin) who is on a package roster. Opens the stage you are working on (the latest unlocked one) and shows the total unread feedback on this cycle's package.
- Grades (`/grades`) — reporters and associate producers. Hidden for executive producers, the adviser, and super admin.
- Calendar — Master Calendar, with **Cycle Dates** (`/package-cycles`: stage dates for each cycle) as a tab at the top

**Producing** — associate producers and up.

- Groups, Package Cycle (roster)
- People — Members, with **Participation** as a tab at the top
- Meetings (opens `meet.infocuspaly.com`). Calls open full screen at `meet.infocuspaly.com/<id>` (see `meetings.md`)
- Extension Requests — producers find it here; students find it in the stage bar on their package pages. A number shows how many requests are waiting on you.
- Grade Editor — executive producers, the adviser, and super admin

**Production**

- The Show (associate producers and up), with **Publishing Queue** and **Livestreams** as tabs at the top. Everyone else sees **Livestream Tracker** here instead.

**Class**

- Announcements, with **Submitted** (everyone can read; associate producers and up can delete; executive producers and super admin can invite outside viewers) and **PA** (assigned announcers and producers can edit) as tabs at the top
- Ideas (`/ideas`: story ideas from Bay Area news and events, new every 2 days; see `ideas.md`)
- Managers (one card per manager area: equipment, livestream, website, social media; see `managers.md`)

**Tools**

- InFocus Drive (opens `drive.infocuspaly.com` in a new tab)
- Teleprompter (opens `teleprompter.infocuspaly.com`)

**At the end of the list:** Admin Dashboard (executive producers, the adviser, and super admin), then Settings (everyone).

**Tabs at the top of a page.** Pages that share one sidebar link show tabs across the top (for example Members | Participation). The sidebar link stays lit on every tab.

**The stage bar.** Every package page (Information, Brainstorming, A-roll/B-roll, Initial Cut, Final Cut, Extension Requests) opens with a bar across the top: one tab per stage with its status and a count of unread feedback on this cycle's package (earlier cycles never count). Later stages are visible but disabled until the previous stage unlocks. On the right: **Cycle guide** (`/information`) and, for students, **Extension requests**.

**Bottom of the sidebar:** your name, a **Passwords** key icon (associate producers and up; see `passwords.md`), and **Sign out**. Super admin, the adviser, and anyone with a limited View as grant can click their name to View as another user (see `accounts-and-admin.md`).

## Portal assistant

Everyone signed in gets a green ✱ in the bottom-right of Portal. It opens a floating popup with **Assistant** (chatbot) and **Messages** (group and direct chat). Unread messages show on the ✱. Ask “where is Groups?” (or another tab or package) and a **Take me there** card can open that page. Reporters cannot look up grades or producer-only surfaces. Associates cannot look up grades. Bare video review and the Class Board hide it so it does not cover the screen.

## Other routes

| Route | Who |
|---|---|
| `/` | Public home page. **Open InFocus Portal** goes to the dashboard (sign-in first if needed) |
| `/information` | Cycle rules for students |
| `/projects/.../review` | Media review (producers / project members) |
| `/grade-editor` | Executives, adviser, super admin |
| `/class-board` | Not in the sidebar. Anyone signed in, or a classroom screen unlocked with the Class Board PIN. Shows the current cycle, livestreams, and calendar |
| `/master-calendar` Anchors & PA button | Executives, adviser, super admin |
| `/live` | Livestream dashboard. Anyone signed in, or signed-out crew with the livestream PIN (see `livestreams.md`) |
| `/equipment` | Equipment checkout (also `equipment.infocuspaly.com`) |
| `/submit-announcement` | Public form, no Portal login |
| `/announcements/shared` | Submitted announcements for invited viewers, opened from an invite link |
| `/g/[token]` | Guest review link |

## Pages you land on

| Route | When |
|---|---|
| `/sign-in` | Not signed in. After sign-in you go back to the page you asked for, or the dashboard |
| `/onboarding` | First sign-in, until you finish it (see `notifications.md`) |
| `/access-denied` | Your email is not on Portal (request access here), or you opened a producer-only page like `/passwords` |
| `/maintenance` | Only while maintenance mode is on. Students are sent here; associate producers and up keep full access. Shows the expected return date and a **Sign out** button. It is off right now |

Old addresses that forward: `/workspaces` → `/dashboard`, `/extensions` → `/extension-requests`, `/activity` → `/settings`. `/workflow` and `/security` are leftover pages from an older design. Nothing in Portal links to them, and they need sign-in.

**Temporarily paused (September 21, 2026):** The associate producer feedback form is disabled until the user requests re-enabling it. The Give Feedback button is hidden and its API rejects new submissions. Existing responses remain available to authorized viewers. When enabled, student stages (Brainstorming, A-roll/B-roll, Initial Cut, Final Cut) have **Give Feedback** beside Refresh. The popup accepts shared anonymous feedback about the assigned associate for current or previous roster cycles. Only executive producers and super admin see saved group responses in Groups → Associates → Feedback; advisers and associates cannot read them.
