# Settings, notifications, onboarding

## Onboarding (`/onboarding`)

First sign-in sends you here before any other page. It is laid out like Settings: **Profile** → **Nickname** (required, up to 60 characters; the name Portal shows, Google keeps your account name), then **Notifications** with an **Email** card (on/off and an optional **Send to** address) and a **Browser** card (on/off), each with its own **Send me** switches for Announcements, Comments, and Grades. A channel's Send me switches can be changed only while it is on. **View as** skips onboarding. The browser switch here only saves your choice; turn on **Browser** in Settings → Notifications on each device you want notified. While **Finish onboarding** can't be pressed, the reason shows beside it (no nickname yet, or Email on with no address to send to). If your saved choices fail to load, an error shows with **Try again** (until you change something), and you can still finish with the choices on screen.

## Settings (`/settings`)

Sections are listed down the left on wide screens (a strip across the top on phones), in the order below. Most changes save at once; only the nickname and the notification address have a **Save** button.

The list shows a tag beside a section when something needs a look. **Notifications** shows one once your settings load: **On**, **Off** (every channel is off), **Blocked**, **Not set up** or **Not registered** (this browser or the InFocus app can't show them yet), or **Error**. **PINs** and **Signature** show **Not set** or **Error**, and **Profile** shows **Error**, only when that applies. On phones, where the strip can hide a tag, the page header lists the warnings and errors as links to their sections.

- **Notifications**: one card per channel, each with its own **Send me** list (Announcements, Comments, Grades).
  - **Email**: on/off, **Send to** (optional; blank uses your account email) with **Save**, the Send me switches, and **Send test** (only while Email is on). New accounts start with email on and Grades off.
  - **Browser** (on the web): on/off, the Send me switches, and **Send test**. Turning it on asks the browser for permission and registers that device; do it on each device you want notified. The switch is for your whole account: turning it off stops browser notifications on every device. The test only shows a notification on this device. **Blocked** means this browser blocks Portal's notifications (allow them in its site settings); **Unsupported** means it can't show them.
  - **Mac app notifications** / **iPhone app notifications** (only inside the InFocus Mac app or the InFocus Portal iPhone app, in place of the Browser card): status, **Turn on** (asks macOS or iOS; shown until you answer), **Open Mac/iPhone settings**, and **Send test** (sent through Apple to every Mac and iPhone you're signed in on). It has no switches of its own: its Send me list shows the Email settings it follows; see below.
- **Appearance & playback** (saved in that browser): **Theme**, Dark (default) or Light, also shared across the Portal subdomains (grades, teleprompter, equipment); the teleprompter run mode and video players stay dark. **Default view** (Grid or List), **Autoplay videos on open**, and **Start with sound on**. From October 15 through October 31 five more switches appear: **Halloween** (the Halloween package's pumpkin-and-purple colors and logos, spooky background music, cobwebs in the corners, and visitors: pumpkins to click and smash, candy to catch, bats, a ghost, a spider, a black cat, a witch on a broom, glowing eyes and a skeleton hand; on by default; the switch shows how many pumpkins this browser has smashed and how much candy it has caught), **Spooky sounds**, **Spooky music** and **Surprise BOOs** (something jumps out with a loud "BOO!": a ghost, a jack-o'-lantern, a spider, eyes in the dark or a bat swarm; the first within seconds of opening the Portal, then every 60–90 seconds; never during a video or teleprompter run mode) and **Hauntings** (every 25–45 seconds something strange happens to the page for a few seconds: the lights flicker or go out except for a flashlight on the pointer, blood drips, handprints, a cracked screen, static, a glitch, a shadow walking past, a heading that briefly reads "I SEE YOU", fog, and the like, or a sound such as footsteps, a howl, thunder or a distant scream; everything stays clickable, and nothing happens during a video, a dialog, typing or teleprompter run mode; the tab title calls you back while you're on another tab). The music starts after your first click on a page, pauses while a video plays, the teleprompter is in run mode or the tab is in the background, and also has a quick mute button just left of the ✱ button. Typed outside a text box, b-o-o sends out a burst of ghosts, t-r-e-a-t showers candy, t-r-i-c-k shakes the page, s-c-a-r-e sets off a BOO and h-a-u-n-t sets off a haunting. The first time a browser opens the Portal in the season, a Halloween welcome explains all this, hints at the hidden tricks and points here to turn things off; it has no off switch of its own and shows once per browser. Through November (Nov 1–30) three Thanksgiving switches appear instead: **Thanksgiving** (harvest gold, maple and cranberry colors in place of the greens, and visitors: falling leaves to catch, pies to eat, a small turkey strutting along the bottom and gusts of wind; on by default; the switch shows how many leaves this browser has caught and pies it has eaten), **Harvest sounds** and **Giant turkey** (every 4–7 minutes, the first 45–90 seconds in, a turkey as tall as the window walks in from the right, stares at you, lunges to eat you and walks off to the left; click-through; never during a video, a dialog or teleprompter run mode, or with reduced motion). Typed outside a text box, g-o-b-b-l-e calls the giant turkey, p-i-e rains pies and t-h-a-n-k-s blows a gust of leaves. A one-time toast welcomes each browser to the season, and another greets it on Thanksgiving Day. Super admins also get **Preview Thanksgiving** whenever it isn't November, which turns the theme on in their own browser only.
- **Profile**: **Nickname**, how you appear in Portal. Signing in with Google does not overwrite it. Beside it, the Google account you sign in with. Below them, **Birthday**: pick a month and a day (no year), then **Save**; **Remove** takes it off. It shows on the Master Calendar for everyone signed in (see `calendar-and-show.md`). It's optional.
- **PINs** (only shown to people who can see a PIN):
  - **Class Board PIN** (super admins and the adviser only). It opens `/class-board` only. See `class-board.md`.
  - **Livestream dashboard PIN** (producers and appointed livestream managers only). Six digits, **Create PIN** / **New PIN**. It opens `/live` without signing in, until midnight, and is separate from the Class Board PIN. See `livestreams.md`.
- **Signature** (executive producers and the super admin only, signed in as themselves; hidden while using View as): draw your signature with a mouse, trackpad, pen, or finger, then **Save signature**. It prints above your name on Package of the Cycle certificates. **Redraw** replaces it; **Remove** takes it off, leaving a blank line for you. See `package-cycles.md`.
- **InFocus for Mac**: depends on the device. In a Mac browser: what the Mac app does (Mac notifications, Portal in its own window, Drive in Finder) and **Download for Mac** with three install steps. Inside the app: a note that you're already using it. On other devices: what it does, and to open Settings on a Mac to download it. See `drive-and-media.md`.
- **Apps & links**: links to the grades dashboard, teleprompter, and InFocus Drive, plus the weekly schedule.
- **About**: who built the Portal and how, a link to its public GitHub repository (MIT license), and how to suggest changes or contribute (GitHub, or email neel@xanom.co). The same text is the About section at the bottom of the public home page.

## Mac and iPhone notifications

The InFocus Mac app and the InFocus Portal iPhone app get a notification for **every email Portal sends you**, at the same moment, with the same rules: if your email settings would skip an email (for example Grades off), there's no Mac notification either. The title is the email's subject (or a shorter one for package events), and clicking it opens the email's link in the app. Exceptions, email only: sign-in codes, account invites, access-request decisions, and the Settings test email. Turn the whole app on or off in macOS System Settings → Notifications → InFocus, or on iPhone in Settings → Notifications → InFocus Portal. A Mac or iPhone stops getting notifications when you sign out of the app.

## What Portal emails and pushes

Browser push goes only to devices registered with **Browser** on in Settings → Notifications. Every email here except sign-in codes, invites, and access decisions also reaches the InFocus Mac app (see **Mac and iPhone notifications** above). Only announcements, grades, and the legacy video-uploaded email follow your email switches; the other emails below are sent to whoever needs to act, whatever those switches say.

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
| Package ready on YouTube | Website managers | Email that the infocusnews.tv story is scheduled, with a link to review it; or, if it couldn't be posted, the watch link and embed code (see `publishing-queue.md`) |
| Added in Admin or by the assistant | The new person | Invite email (optional) |
| Access request decided | The requester | Email |
| Email sign-in | You | Six-digit code, expires in 10 minutes |
| Submitted announcements shared | The invited address | Email with an expiring link |
| Legacy video finished processing | Producers and workspace admins | Email if Email is on |
| Meeting in 15 minutes, and in 5 minutes | Producers (only the picked people when some were picked; invite-only meetings: only the people on them) | Browser and app push, opens the call |
| Meeting calendar invite, update or cancellation | Addresses on the Meetings calendar invite list (invite-only meetings: only addresses linked to the people on them) | Google Calendar's own email, from the InFocus Google account |
| Someone waiting to join a meeting | That meeting's hosts | Browser and app push, at most every 2 minutes per person |
| Meeting notes ready (after the meeting ends) | InFocus Producer Meeting: every producer, whether they came or not. Any other meeting: only the people who were let in (not anyone removed) | Email with the summary and a link to the notes and transcript, plus app push. Once per meeting (a new part sends the updated notes again). Skipped for people who turned email off |

“Assigned producer” means the package's associate producer, else its executive producer, else the associate producer for its category. Student emails go to your notification address when you set one. Messages (group and direct chat) never email or push.

## Review reminders

If an Initial Cut stage sits unreviewed for 12 hours, its reviewers get an email and push: the assigned associate producer for Stage 1, the adviser for Stage 2, and every executive producer and super admin who hasn't approved yet for Stage 3. The reminder repeats every 12 hours until the stage is reviewed. The clock starts at the latest upload or the previous stage's approval. Packages sent back for revisions (waiting on the students) are skipped, and only the active and later cycles are checked. An hourly job sends them.

## Slack

- **Announcements** on `/announcements` are read from the class Slack announcements channel.
- **Proof of contact**: each proof upload posts to the class proof-of-contact Slack channel as the Portal bot (members, topic, cycle, and the proof images), replacing that package's earlier post.
- Opening Portal refreshes Slack announcements and reposts any missing proof-of-contact posts (at most once a minute).

## Scheduled jobs you might notice

- **Hourly**: review reminders (above) and a database backup (Admin → System → Backups, kept 7 days).
- **Every minute**: meeting reminders, 15 and 5 minutes before the start (see `meetings.md`). Meeting calendar changes reach Google Calendar in the background.
- **Every 10 minutes**: alerts for the public InFocus iPhone app (new show, new story, a stream going live; see `iphone-apps.md`).
- **Every 15 minutes**: Portal checks for queued packages and shows due to upload to YouTube on their air date. While an upload is in progress it checks every minute until it finishes. Starting a show upload begins right away.
- **Daily**: the next 21 days of InFocus Producer Meetings are added to Meetings; equipment overdue emails (morning, Pacific); any Master Calendar edits not yet copied to the Google Doc are synced; media left in trash for 7 days is deleted for good; older versions of a video are removed once its current version is a week old.
- **Every 2 days**: a new set of story ideas on the Ideas tab, written in the afternoon (4:30pm Pacific in daylight time, 3:30pm in standard time). Nobody is notified; see `ideas.md`.
