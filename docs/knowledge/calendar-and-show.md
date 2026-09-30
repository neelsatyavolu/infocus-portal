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

**Special shows** — a calendar override can make any weekday a show day and give it a name (for example, Spirit Week: Tue–Fri Oct 6–9 are Day 1–4 recaps, and Wed Oct 14 is the Overall Recap). The name shows on the Master Calendar cell and in the Google Doc. The Publishing Queue does not auto-assign packages to named shows.

## Master Calendar (`/master-calendar`)

Everyone signed in can view the calendar. Producers (associate producer and up) can edit it. It starts at September 2026. Use the arrows or **Today** to change months.

Each weekday cell depends on the day type:

- **Show days:** **Anchors** (two slots, with **Randomize**), **Show manager**, and **Queue** (the packages queued for that show in the Publishing Queue). A special show also shows its name.
- **PA days (Mondays):** **PA announcers** (two slots, with **Randomize**).
- **Spirit Week (Mon Oct 5 – Fri Oct 9):** each day also shows that day's dress-up theme (for example, Tuesday is Salad dressing) and **Filmers** and **Editors** lists. Producers can add any number of people to each list and remove them with ×. The names are saved in the calendar cell and appear in the Google Doc.
- **Class days:** a scenic photo and a notes box. Right-click the photo to **Delete Image** or **Restore Image**.
- **Holidays:** the holiday name.

In a notes box, type `[package]` to search package videos and insert a package pill. Adding a pill marks that video as aired on that date; removing it undoes that. Click a pill to rename it (the file name stays the same) or remove it.

**Sync to Doc** copies the month to the Master Calendar Google Doc. Edits also sync by themselves after a minute with no changes while the page is open, and a daily server pass catches anything left over. The show manager (SM) and special show names appear in the Doc.

**Wipe anchors** (producers) clears every anchor for the month you are viewing, on both the calendar and The Show. PA announcers stay.

**Anchors & PA** (executives, adviser, super admin) — header button. Roster of how many times each person is assigned as an anchor or PA announcer, including upcoming days. Summary tiles filter people with no anchors or no PA. Associates and reporters do not see it.

**Anchors**

- Every show has two Anchors slots. Pick names on the dropdowns, or press Randomize to fill both. Randomize works on any show. Picking a name by hand replaces a random assignment.
- Nobody anchors twice in the same month. The Portal rejects a pick of someone who already anchored that month.
- Randomize uses registered class members, never advisers, EPs, or super admin. EPs can be picked by hand on the calendar. Advisers and super admin are not in the calendar dropdowns.
- Randomize also skips that week's PA announcers (for both shows that week) and anyone marked **Non-anchor** in the generator's Anchor History.
- Someone picked by hand in the first week (days 1–7) or from day 22 on stays out of Randomize for that month, even if you remove them later. **Wipe anchors** clears this.
- Dropping an anchor slot needs 48 hours' notice. This is a class rule; the Portal does not enforce it.

**PA announcers** — Randomize picks from people who are not anchoring that month (and are not marked Non-anchor).

**Show manager** — one per show day. Default rotation: first-name order through executive producers (including super admin) and associate producers. Adviser is not in the pool. Override on the calendar or The Show. **Auto** (calendar) or **Use rotation** (The Show) clears it. After an override, later automatic days continue from the next person, so the next show is not a repeat.

Nicknames are what the dropdowns show.

## The Show (`/show-roles`)

Producer page (associate producer and up) for one show date. It opens on the next show (today, if today is a show day). Tabs switch between the next eight shows and show how many packages each has queued.

- **Show manager** and **Anchors**, with the same rules as the calendar. Changes save to the calendar. The anchor dropdowns grey out anyone who already anchored that month. These dropdowns use the generator roster, which also lists advisers.
- **Packages:** what the Publishing Queue has assigned to this show. Click one to open its Final Cut page.
- **Show roles:** that date's crew assignments.
- **Open script** / **Create script** opens Teleprompter for this show date.
- **Open generator** / **Generate** opens the Show Roles Generator.
- **Upload show** sends the finished show to YouTube (below).

### Upload show (to YouTube)

Any producer (associate producer and up) can press **Upload show** at the top of The Show for the selected show date.

1. **Choose show video.** The file uploads to InFocus Drive (`Package Storage/Shows/<date>/`) with a progress bar. Keep the window open until it finishes.
2. **Review.** Everything is editable before it goes to YouTube:
   - **Thumbnail:** a frame from 17.5 seconds in. Type another time and press **Retake** to change it. If no frame can be grabbed, YouTube picks one.
   - **Title:** `InFocus News | Tuesday, September 22nd, 2026` for the show date.
   - **Goes public:** the show date at 8:30 AM Pacific.
   - **Playlist:** `InFocus News | Season N`. It defaults to the highest season on the channel. The first show of a new semester defaults to the next number, and that playlist is created automatically.
   - **Description:** built from that show's anchors and the reporters and topics of the packages queued for it, for example "Anchors … share campus announcements. InFocus reporters … share news of …". Rewrite the topic part as needed.
3. **Schedule on YouTube.** The video uploads in the background (the window can close), with a progress bar showing how much has reached YouTube. It goes up private, scheduled to go public at the chosen time. When YouTube finishes processing, the Portal sets the thumbnail and adds the video to the playlist. Pressing **Upload show** again shows the status and a YouTube link. **Needs attention** means an administrator must fix it ([setup and recovery](../YOUTUBE-PUBLISHING.md)).

After you schedule it, the Portal locks the upload. Change the title, time, or anything else in YouTube Studio. One upload per show date. Until you press Schedule, you can choose a different file.

### Show Roles Generator (`/show-roles?generator=1`)

Crew roles are Show Director, Graphics Director, Tech Director, Teleprompter, and Floor Director, plus Backup #1 and #2. **Generate Roles** auto-assigns them. It skips EPs and advisers; they stay in the manual picker. Super admin is not listed. Each role has **Re-pick**, **Manual**, and a confirm toggle; **Confirm All** confirms every role.

Other buttons: **New Show**, **Anchor History** (times anchored, last anchored, and a **Non-anchor** checkbox that keeps someone out of Randomize), **Refresh**, **Import JSON**, **Backup**, and **Clear History** (deletes all saved shows except the current one; cannot be undone).

The show selector includes every saved date, including past shows; the latest four dates also have quick tabs. Selecting a date displays its saved assignments and confirmations. The Member Pool shows each person's last crew, anchor, or associate show-manager assignment as **1 show ago**, **2 shows ago**, etc., or **Never** when none is recorded before the selected show. Counts use saved show dates before the selected date, not calendar days or future assignments. Crew members, anchors, and associate producers who were show manager in the previous two shows are on cooldown, with their counts highlighted in amber. Show-manager duty uses the calendar's resolved rotation or manual override. Backup assignments do not count toward cooldown. The generator opens on the next show after today and only accepts new shows on Wednesday or Friday school days, so seeded no-school days (such as Friday, October 2, 2026) are skipped. It does not accept special shows on other weekdays.
