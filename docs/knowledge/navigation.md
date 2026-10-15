# Navigation

Portal chrome is dark by default (Light is in Settings → Appearance & playback → Theme). Sidebar depends on role. On phones and tablets under 1024px, a tab bar sits at the bottom of the screen: Dashboard (or Packages), then up to three of My package, Groups, The Show, Calendar and Grades (whichever you have, in that order), and **More**, which opens the full sidebar. The ✱ button sits just above it. The iPhone app keeps its own navigation instead.

Sidebar category headings use compact spacing, with 0.675rem above each heading.

## Top bar

- The InFocus logo (in the sidebar; on phones and tablets, at the left of the top bar) goes to the dashboard.
- Breadcrumbs (for example, workspace / project / video) show on pages two or more levels deep; each is a link back up. Top-level pages show none, since the page title says where you are. When the trail is too long (often on phones), it scrolls sideways.
- **Search…** (a magnifier icon on phones; or ⌘K on a Mac, Ctrl+K on Windows) opens a command palette. Type a page name and press Enter to jump to any page you can open.
- **Account menu** (your picture, top right): your name and email, **View as…** (super admin, the adviser, and anyone with a limited View as grant; see `accounts-and-admin.md`), **Passwords** (associate producers and up, or anyone an exec shared a login with; see `passwords.md`), and **Sign out**.
- While viewing as someone, your picture in the top bar gets an amber ring, and a notice at the top of each page offers **Switch user** and **Stop viewing**.

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

**Class**

- Announcements, with **Submitted** (everyone can read; associate producers and up can delete; executive producers and super admin can invite outside viewers) and **PA** (assigned announcers and producers can edit) as tabs at the top
- Ideas (`/ideas`: story ideas from Bay Area news and events, new every 2 days; see `ideas.md`)
- Managers (opens **Manager tools**, one row per manager area: equipment, livestream, website, social media; see `managers.md`)

**Production**

- The Show (associate producers and up), with **Publishing Queue** as a tab at the top.
- Livestream Tracker (everyone).

**Tools**

- InFocus Drive (opens `drive.infocuspaly.com` in a new tab)
- Teleprompter (opens `teleprompter.infocuspaly.com`)

**Pinned at the bottom of the sidebar:** Admin Dashboard (executive producers, the adviser, and super admin), then Settings (everyone). Your name, **Passwords** and **Sign out** are in the account menu in the top bar.

**Tabs at the top of a page.** Pages that share one sidebar link show tabs across the top (for example Members | Participation). The sidebar link stays lit on every tab.

**The stage bar.** Every package page (Cycle guide, Brainstorming, A-roll/B-roll, Initial Cut, Final Cut, Extension Requests) opens with a bar across the top: one segment per stage with its number, its status (an icon and a word), its name, and a count of unread feedback on this cycle's package (earlier cycles never count). A green dot on a stage means its status changed (approved, revisions, a new review stage) since you last opened it in this browser. Each stage's top rule turns solid green once it is done; the page you are on has a green tint and underline. Later stages are visible but disabled until the previous stage unlocks. On the right: **Cycle guide** (`/information`) and, for students, **Extension requests** (icons only on narrower screens). On phones the four stages fill one row with short stage names and only the status icon (the unread count and green dot sit beside the stage number), and **Cycle guide** and **Extension requests** sit in a small row just under it.

**Sidebar statuses.** A small mark on the right of a sidebar item says something needs you or changed (screen readers hear it in words). Counts line up in one column:

- **My package**: unread feedback on this cycle's package. A second line names the stage with one tag when there is something to act on: **Revisions**, **Extension** (a student has an extension request to answer), or **Due today** / **Due tomorrow** / **Due Thu** when the stage closes within 72 hours and is still open.
- **Groups** (executive producers, the adviser, and super admin): groups that need you, the same rule as the Groups page's Needs you.
- **Extension Requests** (producers): requests waiting on you.
- **Meetings** (producers): a red **Live** tag while a meeting you can see is live.
- **People** (producers): participation changes waiting for approval (not your own). **Participation** shows the same count as a tab.
- **Livestream Tracker** (producers and livestream managers): livestream sign-up requests waiting.
- **Grades**: a green dot when a grade was released since you last opened Grades.
- **Admin Dashboard**: access requests waiting.

On the narrow icon sidebar (project and group stage pages), a dot on the icon stands for any of these, and hovering says what. On phones, tab icons carry the count or dot, and **More** gets a dot when something outside the tab bar changed.

## Portal assistant

Everyone signed in gets a green ✱ in the bottom-right of Portal. It opens a floating popup (a full-screen sheet on phones) with **Assistant** (chatbot) and **Messages** (group and direct chat). Unread messages show on the ✱. Ask “where is Groups?” (or another tab or package) and a **Take me there** card can open that page. Reporters cannot look up grades or producer-only surfaces. Associates cannot look up grades. Bare video review and the Class Board hide it so it does not cover the screen.

## Other routes

| Route | Who |
|---|---|
| `/` | Public home page. **Open InFocus Portal** goes to the dashboard (sign-in first if needed) |
| `/information` | **Cycle guide**: cycle rules for students (also in the stage bar) |
| `/projects/.../review` | Media review (producers / project members) |
| `/grade-editor` | Executives, adviser, super admin |
| `/class-board` | Not in the sidebar. Anyone signed in, or a classroom screen unlocked with the Class Board PIN. Shows the current cycle, livestreams, and calendar |
| `/master-calendar` **Anchors & PA** button (in the toolbar; in the ⋯ menu on phones) | Executives, adviser, super admin |
| `/live` | Livestream dashboard. Anyone signed in, or signed-out crew with the livestream PIN (see `livestreams.md`) |
| `/equipment` | Equipment checkout (also `equipment.infocuspaly.com`) |
| `/submit-announcement` | Public form, no Portal login |
| `/announcements/shared` | Submitted announcements for invited viewers, opened from an invite link |
| `/g/[token]` | Guest review link |
| `/privacy` | Public privacy policy for Portal and the InFocus apps, no login. Linked in the footer of every public page |
| `/support` | Public help page for Portal and the InFocus apps, no login. Linked in the footer of every public page |

## Pages you land on

| Route | When |
|---|---|
| `/sign-in` | Not signed in. After sign-in you go back to the page you asked for, or the dashboard |
| `/onboarding` | First sign-in, until you finish it (see `notifications.md`) |
| `/access-denied` | Your email is not on Portal (request access here), or you opened a producer-only page like `/passwords` |
| `/maintenance` | Only while maintenance mode is on. Students are sent here; associate producers and up keep full access. Shows the expected return date and a **Sign out** button. It is off right now |

Old addresses that forward: `/workspaces` → `/dashboard`, `/extensions` → `/extension-requests`, `/activity` → `/settings`. `/workflow` and `/security` are leftover pages from an older design. Nothing in Portal links to them, and they need sign-in.

**Temporarily paused (September 21, 2026):** The associate producer feedback form is disabled until the user requests re-enabling it. The Give feedback button is hidden and its API rejects new submissions. Existing responses remain available to authorized viewers. When enabled, student stages (Brainstorming, A-roll/B-roll, Initial Cut, Final Cut) have **Give feedback** beside the Refresh icon button in the page header. The popup accepts shared anonymous feedback about the assigned associate for current or previous roster cycles. Only executive producers and super admin see saved group responses in Groups → Associates → Feedback; advisers and associates cannot read them.
