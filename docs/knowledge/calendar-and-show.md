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

**School years and summer:** each school year's first day, first show, and last day are set in **Admin → School year → School calendar** (see Accounts and admin). Weekdays between two school years are **Summer break**: no PA, no shows, no participation. Wednesdays and Fridays before a year's first show are not show days.

**Special shows:** a calendar override can make any weekday a show day and give it a name (for example, Spirit Week: Tue–Fri Oct 6–9 are Day 1–4 recaps, and Wed Oct 14 is the Overall Recap). The name shows on the Master Calendar cell and in the Google Doc. The Publishing Queue does not auto-assign packages to named shows.

## Master Calendar (`/master-calendar`)

Everyone signed in can view the calendar. Producers (associate producer and up) can edit it. It starts at September 2026. The month you are viewing is the page title; use the arrows or **Today** beside it to change months (on the current month, **Today** jumps to today's day). The month is kept in the link (`/master-calendar?month=2026-11`), so reloading or sharing it opens the same month.

**The month.** On a wide window the month is a grid, one column per weekday. In the grid, two or more days off in a row that week with the same name and no notes of their own (for example, a break or **Finals week**) are one short bar with the dates and the name printed once; each day in the bar can still be clicked on its own. Today and a day off with its own notes keep their own cell. On a phone or a narrower window, and also while the Day panel is open beside the month until the window is wide enough for both, the month is a list instead: one row per weekday in date order, grouped by week, with the current week marked **This week** (a class day shows its photo on the right, and every day off keeps its own row). Each day shows a short summary:

- **Show days:** **Anchors**, **SM** (show manager; producers see "auto" when it comes from the rotation), and **Queue** (up to two packages queued for that show in the Publishing Queue, then "+N more"). A special show also shows its name as a tag.
- **PA days (Mondays):** **PA** (the two announcers).
- **Spirit Week (Mon Oct 5 – Fri Oct 9):** the day's dress-up theme (for example, Tuesday is Salad dressing) and **Crew** counts (for example, "Brunch 1 · Lunch 3 · Editors 2"). Open the day to see the names.
- **Class days:** a scenic photo and the day's notes.
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

**Sync to Doc** (producers, in the row under the header) copies the month to the Master Calendar Google Doc. Edits also sync by themselves after a minute with no changes while the page is open, and a daily server pass catches anything left over. A tag in the header shows the state: **Not in Doc yet** (edits waiting to sync; it names the months when they are not the one you are viewing), **Syncing…**, **In Doc**, or **Sync failed** (the reason shows at the top of the page). The show manager (SM) and special show names appear in the Doc.

**Wipe anchors…** (producers, same row; on a phone it is in the **⋯** menu) clears every volunteer and random anchor for the month you are viewing, on both the calendar and The Show, after you confirm. PA announcers stay.

**Anchors & PA** (executives, adviser, super admin) is in the same row as Sync to Doc and Wipe anchors (on a phone, in the **⋯** menu). It lists how many times each person is assigned as an anchor or PA announcer, including upcoming days. Summary tiles filter people with no anchors or no PA. Associates and reporters do not see it.

**Anchors**

- Every show has two Anchors slots. Pick names on the dropdowns, or press Randomize to fill both. Randomize works on any show. Picking a name by hand replaces a random assignment.
- Nobody anchors twice in the same month. The Portal rejects a pick of someone who already anchored that month.
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

### Upload show (to YouTube)

Any producer (associate producer and up) can press **Upload show** at the top of The Show for the selected show date.

1. **Choose show video.** The file uploads to InFocus Drive (`Package Storage/Shows/<date>/`) with a progress bar, and the thumbnail frame appears beside it. Keep the window open until it finishes; it can't be closed during the upload.
2. **Review.** Everything is editable before it goes to YouTube:
   - **Thumbnail:** a frame from 16.5 seconds in. Type another time and press **Retake** to change it. If no frame can be grabbed, YouTube picks one.
   - **Title:** `InFocus News | Tuesday, September 22nd, 2026` for the show date.
   - **Goes public:** the show date at 8:30 AM Pacific.
   - **Playlist:** `InFocus News | Season N`. It defaults to the highest season on the channel. The first show of a new semester defaults to the next number, and that playlist is created automatically.
   - **Description:** built from that show's anchors and the reporters and topics of the packages queued for it, for example "Anchors … share campus announcements. InFocus reporters … share news of …". Rewrite the topic part as needed.
3. **Schedule on YouTube.** The video uploads in the background (the window can close), with a progress bar showing how much has reached YouTube. It goes up private, scheduled to go public at the chosen time. When YouTube finishes processing, the Portal sets the thumbnail and adds the video to the playlist. Pressing **Upload show** again shows the status as a tag beside the title (**Uploading**, **Processing**, **Finalizing**, **Scheduled** or **Needs attention**) and an **Open on YouTube** button. **Needs attention** means an administrator must fix it ([setup and recovery](../YOUTUBE-PUBLISHING.md)).

After you schedule it, the Portal locks the upload. Change the title, time, or anything else in YouTube Studio. One upload per show date. Until you press Schedule, you can choose a different file.

### Show Roles Generator (`/show-roles?generator=1`)

Opened from **Open generator** on The Show's Show roles card. The generator opens on its own current show, whichever date The Show had open; pick the show inside the generator. **Back to The Show** returns to the date The Show had open.

Crew roles are Show Director, Graphics Director, Tech Director, Teleprompter, and Floor Director, plus Backup #1 and #2. **Generate Roles** auto-assigns them. It skips EPs, advisers, and super admin; they stay in the manual picker. Each role has **Re-pick**, **Manual**, and a confirm toggle; **Confirm All** confirms every role.

Other buttons: **New Show**, **Anchor History** (times anchored, last anchored, and a **Non-anchor** checkbox that keeps someone out of Randomize), **Refresh**, **Import JSON**, **Backup**, and **Clear History** (deletes all saved shows except the current one; cannot be undone).

The show selector includes every saved date, including past shows; the latest four dates also have quick tabs. Selecting a date displays its saved assignments and confirmations. The Member Pool shows each person's last crew, anchor, or associate show-manager assignment as **1 show ago**, **2 shows ago**, etc., or **Never** when none is recorded before the selected show. Counts use saved show dates before the selected date, not calendar days or future assignments. Crew members, anchors, and associate producers who were show manager in the previous two shows are on cooldown, with their counts highlighted in amber. Show-manager duty uses the calendar's resolved rotation or manual override. Backup assignments do not count toward cooldown. The generator opens on the next show after today and only accepts new shows on Wednesday or Friday school days, so seeded no-school days (such as Friday, October 2, 2026) are skipped. It does not accept special shows on other weekdays.
