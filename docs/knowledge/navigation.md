# Navigation

Portal chrome is dark by default (Light is in Settings → Appearance). Sidebar depends on role. On phones and tablets under 1024px, the sidebar is hidden behind a menu button in the header.

Sidebar category headings use compact spacing, with 0.675rem above each heading.

## Sidebar, top to bottom

Tabs with no note are shown to everyone signed in.

**Top**

- Announcements
- Dashboard (students) or Packages (associate producers and up)
- Grades (`/grades`) — reporters and associate producers. Hidden for executive producers, the adviser, and super admin.

**Production**

- Master Calendar
- Package Cycles (dates)
- InFocus Drive (opens `drive.infocuspaly.com` in a new tab)
- Teleprompter (opens `teleprompter.infocuspaly.com`)
- Managers (one card per manager area: equipment, livestream, website, social media; see `managers.md`)

**The Cycle** — reporters, and associate producers who are on a package roster: Information, Brainstorming, A-roll/B-roll, Initial Cut, Final Cut. Later tabs are visible but disabled until the previous stage unlocks. Each tab shows its stage status and a count of unread feedback.

**Livestreams**

- Livestream Tracker

**Producers**

- Groups, Members, Package Cycle (roster), Publishing Queue, The Show, Participation — associate producers and up
- Meetings (opens `meet.infocuspaly.com`) — associate producers and up. Calls open full screen at `meet.infocuspaly.com/<id>` (see `meetings.md`)
- Grade Editor — executive producers, the adviser, and super admin
- Extension Requests — everyone. A number shows how many requests are waiting on you.

**Announcements**

- Submitted — everyone can read. Associate producers and up can delete. Executive producers and super admin can invite outside viewers.
- PA (assigned announcers and producers can edit)

**Admin**

- Admin Dashboard — executive producers, the adviser, and super admin
- Settings

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

Old addresses that forward: `/workspaces` → `/dashboard`, `/extensions` → `/extension-requests`. `/workflow` and `/security` are leftover pages from an older design. Nothing in Portal links to them, and they need sign-in.

**Temporarily paused (September 21, 2026):** The associate producer feedback form is disabled until the user requests re-enabling it. The Give Feedback button is hidden and its API rejects new submissions. Existing responses remain available to authorized viewers. When enabled, student stages (Brainstorming, A-roll/B-roll, Initial Cut, Final Cut) have **Give Feedback** beside Refresh. The popup accepts shared anonymous feedback about the assigned associate for current or previous roster cycles. Only executive producers and super admin see saved group responses in Groups → Associates → Feedback; advisers and associates cannot read them.
