# Master Calendar and The Show

## Weekly rhythm (2026–27)

| Day | Activity |
|---|---|
| Monday | PA announcements (none on Mondays with no class, e.g. Sep 28, 2026) |
| Tuesday | Class |
| Wednesday | Show (from Sep 4, 2026) |
| Thursday | Class |
| Friday | Show |

First broadcast: **Friday, September 4, 2026**. Earlier Wed/Fri are class days. Seeded PAUSD no-school days cancel activity (for example, Friday, October 2, 2026). The Show, Teleprompter, and the Publishing Queue skip no-school days when they pick the next show.

**Finals weeks:** there are no shows, no PA, and no participation points in a finals week: Monday to Friday of any week that has a finals day. The Portal reads the finals days from Paly's bell schedule once a day and marks those weeks on the calendar as **Finals week**, so nobody has to enter them each year (2026–27: Dec 14–18, May 24–28, and Jun 1–4). A day set by hand in **Admin → School year → School calendar → Days off and special days** always wins over the automatic one, so set a finals-week day to **Show day** to air a show then. Two places do not skip finals weeks, summer, or hand-set days yet: the run-date count on the announcement submit form, and The Show's generator when it picks its opening date.

**School years and summer:** each school year's first day, first show, second-semester first show, and last day are set in **Admin → School year → School calendar** (see Accounts and admin). Weekdays between two school years are **Summer break**: no PA, no shows, no participation. Wednesdays and Fridays before a year's first show, and in second semester before its first show (January 8 in 2026–27), are not show days.

**Special shows:** a calendar override can make any weekday a show day and give it a name (for example, Spirit Week: Tue–Fri Oct 6–9 are Day 1–4 recaps, and Wed Oct 14 is the Overall Recap). The name shows on the Master Calendar cell and in the Google Doc. The Publishing Queue does not auto-assign packages to named shows.

## Master Calendar (`/master-calendar`)

Everyone signed in can view the calendar. Producers (associate producer and up) can edit it. It starts at September 2026. The month you are viewing is the page title; use the arrows or **Today** beside it to change months (on the current month, **Today** jumps to today's day). The month is kept in the link (`/master-calendar?month=2026-11`), so reloading or sharing it opens the same month.

**The month.** On a wide window the month is a grid, one column per weekday. In the grid, two or more days off in a row that week with the same name and no notes of their own (for example, a break or **Finals week**) are one short bar with the dates and the name printed once; each day in the bar can still be clicked on its own. Today and a day off with its own notes keep their own cell. On a phone or a narrower window, and also while the Day panel is open beside the month until the window is wide enough for both, the month is a list instead: one row per weekday in date order, grouped by week, with the current week marked **This week**. The list starts at this week: weeks that are already over fold behind **Show earlier weeks** at the top (a class day shows its photo on the right, and every day off keeps its own row). Each day shows a short summary:

- **Show days:** **Anchors**, **SM** (show manager; producers see "auto" when it comes from the rotation), and **Queue** (up to two packages queued for that show in the Publishing Queue, then "+N more"). A special show also shows its name as a tag.
- **PA days (Mondays):** **PA** (the two announcers).
- **Spirit Week (Mon Oct 5 – Fri Oct 9):** the day's dress-up theme (for example, Tuesday is Salad dressing) and **Crew** counts (for example, "Brunch 1 · Lunch 3 · Editors 2"). Open the day to see the names.
- **Class days:** a scenic photo and the day's notes.
- **Birthdays (any school day):** **Bday** and the names of people whose birthday it is, from Settings → Profile → **Birthday**. A birthday on a weekend or a day off moves back to the nearest school day before it, with the real date beside the name (for example, "Otto (Sun, Nov 8)"). That can be in the month before (a Sunday, November 1 birthday shows on Friday, October 30). The Day panel lists them under **Birthdays** for everyone. Birthdays aren't written into the calendar cell or the Google Doc.
- **Holidays and finals weeks:** the day's name (for example, **No School** or **Finals week**), or the notes a producer wrote for that day. A day off with its own notes also gets a **Holiday** tag on the month; the Day panel always shows the **Holiday** tag.
- A tag also marks a day that breaks the usual pattern (for example, **Show** on a Tuesday).

For producers, an upcoming show or PA day with an empty slot says **Needed**, and the header sums it up ("2 shows need anchors", "1 PA day needs announcers", or **Cast complete**). Past days never count.

**The Day panel.** Click or tap a day to open it in the Day panel. Where it opens depends on the window's width:

- **Wide window:** beside the month, never over it. Producers keep it docked there, already open on the first upcoming day that still needs people (otherwise today, or the month's first weekday); **Hide day panel** in its header folds it away, and **Show day panel** next to the month arrows brings it back. With the panel hidden, and for everyone else, clicking a day opens the panel beside the month for that day; **Show day panel** keeps it docked. The browser remembers the choice. While the panel is beside it, the month shows as the list until the window is wide enough for the grid and the panel together.
- **Medium window:** the month is already the list, and the panel opens as a drawer over the right side of it (the list stays as it is).
- **Phone or narrow window:** a sheet that covers the page, below the top bar and above the tab bar.

**Previous day** / **Next day** in its header (or the **K** / **J** keys) step through the month's weekdays; **×** or **Esc** closes it when it was opened for a day. Viewers see everything read-only, including the full Spirit Week crew lists. Producers edit the day there:

- **Show days:** **Anchors** (two slots, with **Randomize**), **Show manager** (with **Use rotation** after an override), and the **Queue**.
- **PA days:** **PA announcers** (two slots, with **Randomize**).
- **Spirit Week:** **Lunch filmers** and **Editors** lists. Monday and Friday also have **Brunch filmers**; Tuesday through Thursday, lunch filmers film brunch too. Wednesday (Oct 7) also has **Night rally filmers** for the night rally. Add people with **Add** after each list (any number per list) and remove them with ×. The names are saved in the calendar cell and appear in the Google Doc.
- Filmers picked before the brunch/lunch split show as **Filmers (unsorted)**. Adding one of them to a brunch, lunch, or night rally list takes them off the unsorted list; × removes them outright. The unsorted list disappears once it is empty.
- **Class days:** **Delete image** or **Restore image** for the scenic photo (right-clicking a class day on the board, or a long press on some phones, opens the same choice), and a **Notes** box.
- **Holidays:** a **Notes** box with the holiday text.

A day that is saving shows **Saving…**; one that failed shows **Not saved**, and the reason appears in the Day panel (or at the top of the page when that day isn't open).

In a notes box, type `[package]` to search package videos and insert a package pill. Adding a pill marks that video as aired on that date; removing it undoes that. Click a pill to rename it (the file name stays the same) or remove it.

**Sync to Doc** (producers, in the header beside the month arrows) copies the month to the Master Calendar Google Doc. Edits also sync by themselves after a minute with no changes while the page is open, and a daily server pass catches anything left over. A tag in the header shows the state: **Not in Doc yet** (edits waiting to sync; it names the months when they are not the one you are viewing), **Syncing…**, **In Doc**, or **Sync failed** (the reason shows at the top of the page). The show manager (SM) and special show names appear in the Doc.

**Wipe anchors…** (producers, in the **⋯** menu beside Sync to Doc) clears every volunteer and random anchor for the month you are viewing, on both the calendar and The Show, after you confirm. PA announcers stay.

**Anchors & PA** (executives, adviser, super admin) is in the **⋯** menu beside Sync to Doc. It lists how many times each person is assigned as an anchor or PA announcer, including upcoming days. Summary tiles filter people with no anchors or no PA. Associates and reporters do not see it.

**Anchors**

- Every show has two Anchors slots. Pick names on the dropdowns, or press Randomize to fill both. Randomize works on any show. Picking a name by hand replaces a random assignment.
- Randomize never picks someone who already anchored that month. A producer can still pick them by hand on the calendar or The Show.
- Randomize uses registered class members, never advisers, EPs, or super admin. EPs and super admin can be picked by hand on the calendar. Advisers are not in the calendar dropdowns.
- Randomize also skips that week's PA announcers (for both shows that week) and anyone marked **Non-anchor** in the generator's Anchor History.
- Someone picked by hand in the first week (days 1–7) or from day 22 on stays out of Randomize for that month, even if you remove them later. **Wipe anchors** clears this.
- Dropping an anchor slot needs 48 hours' notice. This is a class rule; the Portal does not enforce it.

**PA announcers:** Randomize picks from people who are not anchoring that month (and are not marked Non-anchor).

**Show manager:** one per show day. Default rotation: first-name order through executive producers (including super admin) and associate producers. Adviser is not in the pool. Override on the calendar or The Show. **Use rotation** (on either page) clears it; the calendar's Day panel shows an **Auto** tag while the rotation is in use. After an override, later automatic days continue from the next person, so the next show is not a repeat.

**Confirming the roles:** a show is filmed in 1st period on the school day before it airs (Tuesday for Wednesday, Thursday for Friday). When that 1st period ends (from Paly's bell schedule, usually 10:30 AM; 10:30 AM the day before if the schedule can't be read), the show manager gets an email listing that show's anchors and crew roles, with a link to the show on The Show. There, a show that has been filmed (or is filmed today) has an **Are the show roles right?** banner at the top with a **Roles are correct** button; any producer can press it, and **Show roles** then shows who checked. Until someone does, the email repeats every 3 hours, with none sent from 9 PM to 7 AM Pacific. Only the most recent filmed show is reminded; once the next show is filmed, reminders move to that show.

Nicknames are what the dropdowns show. Each name dropdown (here and on The Show) has a search box: type part of a name to filter, then use the arrow keys and Enter, or click.

## The Show (`/show-roles`)

Producer page (associate producer and up) for one show date. It opens on the next show (today, if today is a show day). The header shows the date and when it airs (**Live today**, **Live in N days**, or **Aired N days ago**), with **Upload show** (below) and **Open script** / **Create script** (opens Teleprompter for this show date). A **No show this day** tag appears when the calendar no longer has a show on a coming date (from tomorrow through the eighth upcoming show); the line under the title then just says how far away the date is.

- **Show strip:** one cell for each of the next eight shows, with its package count and show manager; the open show has a green underline. Picking one switches at once and puts the date in the link (`/show-roles?date=YYYY-MM-DD`), so reloading or sharing keeps that show. A show that already aired (from an emailed link) gets its own cell, marked **Aired**.
- **Are the show roles right?:** on a show day, from the day before the show (shows are filmed the school day before they air) until someone confirms, a banner at the top asks the show manager to check the cast and crew and press **Roles are correct**. Fix anchors and the show manager on this page, and crew roles with **Open generator**. After filming, the show manager is emailed every 3 hours until the roles are confirmed. Once confirmed, Show roles shows **Checked after filming by …** (separate from the generator's per-role **Confirmed** tags). While a change saves, the show strip waits until it's done.
- **Cast:** **Show manager** (tagged **Rotation**, which rotates across EPs and APs, or **Manual**; **Use rotation** returns a hand-picked show to the rotation) and **Anchors** (**Anchor 1** and **Anchor 2**) with **Randomize**, with the same rules as the calendar. Changes save to the calendar, and a **Saving** tag shows while they do. The anchor dropdowns grey out anyone who already anchored that month. These dropdowns use the generator roster, which also lists advisers and super admin.
- **Show roles:** that date's crew, each marked **Confirmed** or **Pending** with the generator's confirmations, and an **N/5 confirmed** count. **Open generator** opens the Show Roles Generator (below).
- **Packages:** what the Publishing Queue has assigned to this show, out of two (**1 of 2**, **Full**), with a dashed **Open slot** for each one left. Click a package to open its Final Cut page; **Publishing queue →** opens the queue to add one.
- **Automatic editing:** one line for this show's automatic edit: **Not started**, **Editing: <step>**, **Ready for review**, **Scheduled** or **Failed**. **Open Editing →** opens the Editing tab (below) on this show.

### Upload show (to YouTube)

Any producer (associate producer and up) can press **Upload show** at the top of The Show for the selected show date.

1. **Choose show video.** The file uploads to InFocus Drive (`Package Storage/Shows/<date>/`) with a progress bar, and the thumbnail frame appears beside it. Keep the window open until it finishes; it can't be closed during the upload.
2. **Review.** Everything is editable before it goes to YouTube:
   - **Thumbnail:** a frame from 16.5 seconds in. Type another time and press **Retake** to change it. If no frame can be grabbed, YouTube picks one.
   - **Title:** `InFocus News | Tuesday, September 22nd, 2026` for the show date.
   - **Goes public:** the show date at 8:30 AM Pacific.
   - **Playlist:** `InFocus News | Season N`. It defaults to the highest season on the channel. The first show of a new semester defaults to the next number, and that playlist is created automatically.
   - **Description:** built from that show's anchors (full names) and the packages queued for it: each package's toss story, then "Reported by …" with its reporters' full names (with no written toss, what the anchors said at the throw in the automatic edit). After that come the edit's chapters as timestamps ("0:00 Intro", "0:11 Welcome", …; YouTube turns them into chapters, so there are at least three, each at least 10 seconds), and the hashtags #InFocusNews #Paly #StudentNews. Rewrite any of it as needed.
3. **Schedule on YouTube.** The video uploads in the background (the window can close), with a progress bar showing how much has reached YouTube. It goes up private, scheduled to go public at the chosen time. When YouTube finishes processing, the Portal sets the thumbnail and adds the video to the playlist. Pressing **Upload show** again shows the status as a tag beside the title (**Uploading**, **Processing**, **Finalizing**, **Scheduled** or **Needs attention**) and an **Open on YouTube** button. **Needs attention** means an administrator must fix it ([setup and recovery](../YOUTUBE-PUBLISHING.md)).

After you schedule it, the Portal locks the upload. Change the title, time, or anything else in YouTube Studio. One upload per show date. Until you press Schedule, you can choose a different file.

### Show Roles Generator (`/show-roles?generator=1`)

Opened from **Open generator** on The Show's Show roles card. The generator opens on its own current show, whichever date The Show had open; pick the show inside the generator. **Back to The Show** returns to the date The Show had open.

Crew roles are Show Director, Teleprompter, and Floor Director, plus Backup #1 and #2. There is no Graphics Director or Tech Director: shows are edited automatically (see Editing). **Generate Roles** auto-assigns them. It skips EPs, advisers, and super admin; they stay in the manual picker. Each role has **Re-pick**, **Manual**, and a confirm toggle; **Confirm All** confirms every role.

Other buttons: **New Show**, **Anchor History** (times anchored, last anchored, and a **Non-anchor** checkbox that keeps someone out of Randomize), **Refresh**, **Import JSON**, **Backup**, and **Clear History** (deletes all saved shows except the current one; cannot be undone).

The show selector includes every saved date, including past shows; the latest four dates also have quick tabs. Selecting a date displays its saved assignments and confirmations. The Member Pool shows each person's last crew, anchor, or associate show-manager assignment as **1 show ago**, **2 shows ago**, etc., or **Never** when none is recorded before the selected show. Counts use saved show dates before the selected date, not calendar days or future assignments. Crew members, anchors, and associate producers who were show manager in the previous two shows are on cooldown, with their counts highlighted in amber. Show-manager duty uses the calendar's resolved rotation or manual override. Backup assignments do not count toward cooldown. The generator opens on the next show after today and only accepts new shows on Wednesday or Friday school days, so seeded no-school days (such as Friday, October 2, 2026) are skipped. It does not accept special shows on other weekdays.

## Editing (`/editing`)

Producer page (associate producer and up) for automatic editing. It's a tab of The Show, between **The Show** and **Publishing Queue**, and the sidebar's The Show item stays lit on it. An editing machine (the team MacBook, or for now someone's own laptop) cuts the show on its own: it picks the takes, replaces every old switcher graphic with fresh ones, levels the audio and checks the result.

- **Header:** the show date being edited, and a tag for the active editing machine on every view: **Editor online · <machine> · <version>** (with **busy** while it edits), **Editor offline · <machine> · last seen …**, **Editor needs attention · …**, or **No editor linked**. An edit started while it's offline waits until it's back.
- **Show strip:** the same show strip as The Show. It opens on the same show The Show opens on, and the date is in the link (`/editing?date=YYYY-MM-DD`).
- **Views:** **Show**, **Machines**, **Settings** and **How to**. The view is in the link too (`/editing?view=machines`, `/editing?view=settings`, `/editing?view=howto`); without one it opens on Show. **How to** is the step-by-step guide, the same text as `automatic-editing.md`.

Emails and notifications about an automatic edit (ready for review, failed, scheduled, and the 6 PM reminder) link to that show on the Editing tab.

### Show view

One show's automatic edit, in cards:

- **This show's edit:** where it stands (**Not started**, **Editing: <step>**, **Ready for review**, **Scheduled** or **Failed**). While it runs, a live line shows the step (finding the takes, making graphics, rendering, checking, uploading) and **Cancel** stops it. If it failed, the reason is here. At review or after a failure, **Redo automatic edit** throws this edit away and edits the show again; it opens a box for an optional note to the editor (for example, "use the later take of the close"), then **Redo the edit**.
  - **Debug log:** once a run ends (ready, failed or cancelled), **Download debug log** fetches that version's editor log and AI transcript (for example **Debug log (v3)**); **Earlier versions** lists the logs from earlier fixes. Share it when reporting a problem.
- **Start an edit** (until the show is edited or sent to YouTube): the recordings in Drive `Shows/` and its subfolders, newest first. Open a folder to see its files, or tick the folder to take all of them.
  - **Ticked already:** every 5 minutes the NAS renames TriCaster exports after their airing date (the day after the export): `InFocus Show <airing date>.mov` for a switched recording, `InFocus Show <airing date> Left.mov` / `Center` / `Right` for the three cameras recorded together, with ` (1)`, ` (2)` for repeats. The files named after this show's airing date are ticked, oldest first.
  - **Never ticked:** files with EDITED in the name, the untitled `InFocus Show.mov`, and a file exactly the size of another date's file. That last one is marked "Same size as …: probably a copy of another show".
  - **Picking:** up to 12 files. A file still copying to Drive can't be picked yet.
  - **Older files:** the list shows the 6 newest files (and any older ones already ticked); **Show N older** shows the rest and **Show fewer** folds them away again. Folders work as before.
  - **Preview:** plays that file right in the list, one at a time. If the browser can't play it (some TriCaster files only play in Safari), it says so.
  - **Roles:** a camera file starts on its camera (Left **Camera L**, Center **Camera M** (two-shot), Right **Camera R**); any other file starts on **Auto**, and the editor works out from the pictures and sound which files are switched program feeds, which are camera feeds and which were recorded together. You can set a file to **Program**, **Camera M**, **Camera L** or **Camera R** yourself, or **Ignore** to leave it out. The arrows change the order.
  - With **Start editing by itself** on, the card says which files auto-start will use and when.
  - **Add instructions** (optional) opens **Instructions for the editor**: anything about this show, up to 500 characters (for example "Use the later take of the open"). The editor follows them over the house rules for this edit only, and they show on **This show's edit** while it runs and at review. Under the instructions, **Goes public** and **Time (Pacific)** start on the show date at 8:30 AM; a changed date and time (in the future) is saved with the edit, shown on **This show's edit**, kept by **Redo automatic edit**, and used by Approve, **Change details** and the 8:00 AM auto-schedule.
  - **Announcements:** the line under Start says how many announcements the show's Teleprompter script has in A2. It warns (with a link to the script) when the show has no script yet, so the editor will use the announcements as submitted, or when A2 is empty. Like the package line, it doesn't stop the edit.
  - **Packages:** the line under Start names the packages queued for the show in the Publishing Queue. It warns (with a link to the Publishing Queue) when none is queued, or when a queued package has no final cut yet, since the editor can't use it. It doesn't stop the edit: some shows have no package. If the anchors throw to a package that isn't queued, the editor puts a placeholder there and flags it, asking for the package; that flag leads the review email, and the review card links to the Publishing Queue.
  - Press **Start automatic editing**. Packages come from the Publishing Queue for that show; anchors' names come from The Show. The editor also gets the class list by full name (for name bars and to tell who is on air) and the announcement cards from recent shows' edits, so new cards match them.
- **Review** (once it's edited): the edited show plays, with its chapters underneath (Intro, Welcome, each announcement's card title, "Package: …", Sign-off, Outro; click one to jump there), its version and anything the editor flagged for a person to check (**Check these before scheduling**). When it's ready, every producer, the person who started it and that date's show manager (from the Master Calendar) get one email and a notification. If it fails, the starter and show manager do, and they get a reminder at 6 PM the evening before the show if it still isn't scheduled. For an edit that auto-start began, the show manager stands in for the starter.
  - **Approve & schedule** schedules it on YouTube with the usual title, time (or the one picked with the instructions) and playlist. Above it, **Goes public … That's the right date and time.** must be ticked first; if the time changes before you press Approve (for example after **Change details**), the box unticks, and an approval for an old time is refused with "The publish time changed since this page loaded." The line next to the button says what it will do (for example "Schedules “InFocus News | Friday, October 23rd, 2026” for Fri, Oct 23, 8:30 AM."). If there's no season yet, or the publish time has passed, the line says so instead and you schedule it with **Change details**.
  - **Change details** opens Upload show right here with the edited file already in place, to change the title, time or playlist before **Schedule on YouTube**.
  - **Send back:** under **What needs to change?**, type what's wrong (timecodes help, e.g. "At 1:12 the Math Club card is cut off") and press **Send back to the editor**. The editor changes the same edit and replies with what it did; the requests and replies stay in the card and the new version replaces the preview. Tick **Remember this for future shows** to add it to the house rules. Send back works until the show is scheduled.
  - **Which machine:** a send-back runs on the machine that made the edit, because its files are there. If that machine is offline, the edit card says **Waiting for … to come online**. If it was unlinked, it fails; use **Redo automatic edit**.
  - **If nobody approves:** the card says so under **Approve & schedule**. Once an edit has waited an hour with nobody approving, sending it back, redoing it or scheduling it, every producer gets an email and notification (**The <date> show still needs approval**), and again every hour after that (never between 2 and 6 AM Pacific) until someone does. Only edits for today's or tomorrow's show get these. At 8:00 AM on show day it's scheduled with the usual title, time and playlist (at least 15 minutes out if 8:30 is too close), and the person who started it and the show manager hear it was scheduled automatically. If that fails, they and the producers get the reason; schedule it with **Change details**. A new version after **Send back** starts the hour again.
- **What the editor found:** what it worked out from the files, for example "2 recordings: r1 multicam (M, L, R), r2 multicam (M, L, R)".

### Machines view

#### Linking an editing machine

Setting up a machine means opening the InFocus Editor app on it and pressing **Link to Portal**. Nobody types a password or token. On a Mac that doesn't have it yet, press **Download the setup app** at the top of **Editing machines** (Machines view), open it on that Mac and follow the steps: it installs everything, then shows the code.

1. The app shows a code and an **Open Portal** button, which opens the Editing tab's Machines view with **Link the editor Mac '…'?** (`/editing?link=CODE`; older links to `/show-roles?link=CODE` go there too). If you weren't signed in, you come back to it after signing in.
2. Check the code matches, keep **Make it the active editor now** ticked (or untick it to add the machine without switching), and press **Approve**. **Cancel** turns it down.
3. The machine finishes setting up by itself. A link code lasts 15 minutes.

#### Editing machines

Each linked machine shows:
- its name, and **Dedicated** (the team MacBook) or **Personal** (someone's laptop)
- online or last seen, its version, and any problems
- its AI accounts
- an **Active** badge on the one machine that takes new edits

Buttons:
- **Make active:** switch new edits to that machine. An edit already running finishes where it is.
- **Unlink:** the machine stops working at once. Waiting fixes for its edits fail; use Redo.
- **Run health check**, **Update now**, **Restart**, **Repair** (reinstalls missing tools) and **Show log:** the machine runs them within about a minute, and the latest result shows under its buttons.
- **Keep awake always** / **Normal sleep:** the Mac never sleeps (on battery or power, lid open or closed), restarts after a power cut, never logs out by itself and doesn't restart for macOS updates; or it goes back to normal. A dedicated machine is set to keep awake when it's set up.

#### Connect AI account

Editing machines run on a Claude, Codex (ChatGPT) or Grok subscription, not an API key. Each machine lists its accounts as **Connected** or **Not connected**, with what it reports.

1. In the **Connect AI account** card, pick the machine (the active one is chosen already) and **Claude**, **Codex** or **Grok**.
2. Copy the command shown and run it in Terminal on your own computer. You sign in there with the subscription's usual sign-in.
3. The sign-in is encrypted on your computer so only that machine can read it, and sent through the Portal. Its row shows **Waiting for sign-in**, then **Installing**, then **Connected**. If it shows **Failed**, the reason is beside it; make a new code.

A code works once and lasts 10 minutes. The Portal never sees the sign-in itself, and deletes the encrypted copy once the machine has it (or after an hour).

### Settings view

**Editor settings:**
- **Start editing by itself:** once the files named after an upcoming show are in Drive `Shows/`, the edit starts without anyone pressing Start. It waits until every file has been unchanged for 10 minutes, and with several files, 10 more after the newest one (exports arrive one after another).
- **Schedule clean edits by themselves:** an edit with nothing flagged and every check passed is scheduled on YouTube with the usual title and time. Flagged edits always wait for review.
- **Editor version:** empty follows the newest release; type one like `v0.3.1` to pin it or roll back.
- **AI account order:** which subscription the editor tries first, then next.

**House rules:** decisions the editor follows instead of asking. It starts from the editor's built-in rules; **Save rules** stores your version, and remembered fixes are added to it. **Go back to the built-in rules** drops your version.
