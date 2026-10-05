# Settings, notifications, onboarding

## Onboarding (`/onboarding`)

First sign-in sends you here before any other page. Set a nickname (required, up to 60 characters; the name Portal shows, Google keeps your account name) and notification channels: email on/off, an optional notification email address, browser on/off, and Announcements / Comments / Grades for each. **View as** skips onboarding. The browser switch here only saves your choice; turn on **Browser notifications** in Settings to register a device.

## Settings (`/settings`)

Sections are listed down the left on wide screens (a strip across the top on phones); each one is a panel of rows with the setting on the left and its control on the right.

- **Profile**: **Nickname**, how you appear in Portal. Signing in with Google does not overwrite it. Below it, the Google account you sign in with.
- **Signature** (executive producers and the super admin only, signed in as themselves; hidden while using View as): draw your signature with a mouse, trackpad, pen, or finger, then **Save signature**. It prints above your name on Package of the Cycle certificates. **Redraw** replaces it; **Remove** takes it off, leaving a blank line for you. See `package-cycles.md`.
- **Appearance**: **Theme**, Dark (default) or Light. Saved in that browser and shared across the Portal subdomains (grades, teleprompter, equipment). The teleprompter run mode and video players stay dark. Also **Default view** (Grid or List).
- **Playback**: autoplay videos on open, start with sound on.
- **Notifications**:
  - **Email** on/off and **Send test**. **Send email to another address** is optional (blank uses your account email). New accounts start with email on and Grades off.
  - **Browser** on/off and **Send test**. Turning it on asks the browser for permission and registers that device; do it on each device you want notified. The test only shows a notification on this device.
  - **Mac app notifications** / **iPhone app notifications** (only inside the InFocus Mac app or the InFocus Portal iPhone app, which replace the Browser row): status, **Turn on** (asks macOS or iOS), **Open Mac/iPhone settings**, and **Send test** (sent through Apple to every Mac and iPhone you're signed in on). There are no per-category switches here; see below.
  - A **Send me** grid: Announcements, Comments, and Grades switches for each channel (Email and Browser).
- **PINs** (only shown to people who can see a PIN):
  - **Class Board PIN** (super admins and the adviser only). It opens `/class-board` only. See `class-board.md`.
  - **Livestream dashboard PIN** (producers and appointed livestream managers only). Six digits, **Create PIN** / **New PIN**. It opens `/live` without signing in, until midnight, and is separate from the Class Board PIN. See `livestreams.md`.
- **InFocus for Mac**: what the Mac app does (Mac notifications, Portal in its own window, Drive in Finder) and **Download for Mac** with three install steps. See `drive-and-media.md`.
- **Apps & links**: links to the grades dashboard, teleprompter, and InFocus Drive, plus the weekly schedule.

## Mac and iPhone notifications

The InFocus Mac app and the InFocus Portal iPhone app get a notification for **every email Portal sends you**, at the same moment, with the same rules: if your email settings would skip an email (for example Grades off), there's no Mac notification either. The title is the email's subject (or a shorter one for package events), and clicking it opens the email's link in the app. Exceptions, email only: sign-in codes, account invites, access-request decisions, and the Settings test email. Turn the whole app on or off in macOS System Settings → Notifications → InFocus, or on iPhone in Settings → Notifications → InFocus Portal. A Mac or iPhone stops getting notifications when you sign out of the app.

## What Portal emails and pushes

Browser push goes only to devices with **Browser notifications** on. Every email here except sign-in codes, invites, and access decisions also reaches the InFocus Mac app (see **Mac notifications** above). Only announcements, grades, and the legacy video-uploaded email follow your email switches; the other emails below are sent to whoever needs to act, whatever those switches say.

| Event | Who gets it | How |
|---|---|---|
| New announcement posted in Portal (no screen posts one today; the `/announcements` feed comes from Slack and sends nothing) | Everyone else with a Portal account | Email if Email + Announcements are on (people who never saved settings get it too); push if Browser + Announcements are on |
| Cycle grade published, or a published grade changes | That student | Email if Email + Grades are on. Push if Browser + Grades are on, for grades saved in the Grade Editor (publishing Final Cut grades from Groups sends email only) |
| Producer comment on a student stage | Package members (not the author) | Email; push if Comments is on. A-roll feedback comes as “needs changes” |
| Check-in approved; Initial Cut approved at Stage 1, 2, or 3; sent back for revisions | Package members (not the reviewer) | Email and push. Stage 3 approval reminds them to upload the Final Cut, with the due date unless they have an extension |
| Brainstorm materials ready, or proof of contact makes them ready | Assigned producer | Email and push |
| A-roll uploaded | Assigned producer | Email and push, at most once a day per package |
| Initial Cut uploaded or re-uploaded | Reviewer for the package's current stage | Email and push |
| Stage 1 approves | The adviser (Stage 2) | Email and push |
| Stage 2 approves | Executive producers and super admin, not the adviser (Stage 3) | Email and push |
| Final Cut uploaded | Assigned producer and every Final Cut grader | Email and push |
| Stage unreviewed for 12 hours | That stage's reviewers | Email and push (see below) |
| Executive grants an extension | The other executives, adviser, and super admin | Email |
| Extension approved | Each chosen student | Email |
| Participation dock submitted | Executives, the adviser, and super admin (not the requester) | Email |
| Equipment request; item out 72 hours | Equipment managers; borrower and managers daily | Email (see `equipment.md`) |
| Package ready on YouTube | Website managers | Email with watch link and embed code (see `publishing-queue.md`) |
| Added in Admin or by the assistant | The new person | Invite email (optional) |
| Access request decided | The requester | Email |
| Email sign-in | You | Six-digit code, expires in 10 minutes |
| Submitted announcements shared | The invited address | Email with an expiring link |
| Legacy video finished processing | Producers and workspace admins | Email if Email is on |
| Meeting in 15 minutes, and in 5 minutes | Producers (only the picked people when some were picked; invite-only meetings: only the people on them) | Browser and app push, opens the call |
| Meeting calendar invite, update or cancellation | Addresses on the Meetings calendar invite list (invite-only meetings: only addresses linked to the people on them) | Google Calendar's own email, from the InFocus Google account |
| Someone waiting to join a meeting | That meeting's hosts | Browser and app push, at most every 2 minutes per person |

“Assigned producer” means the package's associate producer, else its executive producer, else the associate producer for its category. Student emails go to your notification address when you set one. Messages (group and direct chat) never email or push.

## Review reminders

If an Initial Cut stage sits unreviewed for 12 hours, its reviewers get an email and push: the assigned associate producer for Stage 1, the adviser for Stage 2, and every executive producer and super admin who hasn't approved yet for Stage 3. The reminder repeats every 12 hours until the stage is reviewed. The clock starts at the latest upload or the previous stage's approval. Packages sent back for revisions (waiting on the students) are skipped, and only the active and later cycles are checked. An hourly job sends them.

## Slack

- **Announcements** on `/announcements` are read from the class Slack announcements channel.
- **Proof of contact**: each proof upload posts to the class proof-of-contact Slack channel as the Portal bot (members, topic, cycle, and the proof images), replacing that package's earlier post.
- Opening Portal refreshes Slack announcements and reposts any missing proof-of-contact posts (at most once a minute).

## Scheduled jobs you might notice

- **Hourly**: review reminders (above) and a database backup (Admin → Backups, kept 7 days).
- **Every minute**: meeting reminders, 15 and 5 minutes before the start (see `meetings.md`). Meeting calendar changes reach Google Calendar in the background.
- **Every 10 minutes**: alerts for the public InFocus iPhone app (new show, new story, a stream going live; see `iphone-apps.md`).
- **Every 15 minutes**: Portal checks for queued packages and shows due to upload to YouTube on their air date. While an upload is in progress it checks every minute until it finishes. Starting a show upload begins right away.
- **Daily**: the next 21 days of InFocus Producer Meetings are added to Meetings; equipment overdue emails (morning, Pacific); any Master Calendar edits not yet copied to the Google Doc are synced; media left in trash for 7 days is deleted for good; older versions of a video are removed once its current version is a week old.
