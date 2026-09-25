# Master Calendar and The Show

## Weekly rhythm (2026–27)

| Day | Activity |
|---|---|
| Monday | PA announcements |
| Tuesday | Class |
| Wednesday | Show (from Sep 4, 2026) |
| Thursday | Class |
| Friday | Show |

First broadcast: **Friday, September 4, 2026**. Earlier Wed/Fri are class days.

## Master Calendar (`/master-calendar`)

Weekday grid. Producers edit SHOW and PA cells: anchors, PA announcers, show manager, scenic, notes. Syncs a Google Doc.

**Anchors & PA** (executives, adviser, super admin) — header button. Roster of how many times each person is assigned as an anchor or PA announcer, including upcoming days. Summary tiles filter people with no anchors or no PA. Associates and reporters do not see it.

**Anchors**

- Every show has two Anchors slots. Pick names on the dropdowns, or press Randomize to fill both. Picking a name by hand replaces a random assignment.
- Nobody anchors twice in the same month.
- Randomize uses registered class members, not advisers/EPs/super admin. EPs can be picked by hand.
- That week's PA people are skipped for both shows that week.
- Dropping an anchor needs 48 hours' notice.

**PA announcers** — random from people who are not anchoring that month.

**Show manager** — one per SHOW day. Default rotation: first-name order through executive producers (including super admin) and associate producers. Adviser is not in the pool. Override on the calendar or The Show; **Use rotation** clears it.

Nicknames are what the dropdowns show.

## The Show (`/show-roles`)

Producer page to generate crew roles for a show date, set anchors, PA, and show manager. Same roster rules as the calendar. Generate Roles skips EPs and advisers in auto-assign; they stay in the manual picker. Super admin is not listed.

### Upload show (to YouTube)

Any producer (associate producer and up) can press **Upload show** at the top of The Show for the selected show date.

1. **Choose show video.** The file uploads to InFocus Drive (`Package Storage/Shows/<date>/`) with a progress bar. Keep the window open until it finishes.
2. **Review.** Everything is editable before it goes to YouTube:
   - **Thumbnail:** a frame from 17.5 seconds in. Type another time and press **Retake** to change it.
   - **Title:** `InFocus News | Tuesday, September 22nd, 2026` for the show date.
   - **Goes public:** the show date at 8:30 AM Pacific.
   - **Playlist:** `InFocus News | Season N`. It defaults to the highest season on the channel. The first show of a new semester defaults to the next number, and that playlist is created automatically.
   - **Description:** built from that show's anchors and the reporters and topics of the packages queued for it, for example "Anchors … share campus announcements. InFocus reporters … share news of …". Rewrite the topic part as needed.
3. **Schedule on YouTube.** The video uploads in the background (the window can close), with a progress bar showing how much has reached YouTube. It goes up private, scheduled to go public at the chosen time. When YouTube finishes processing, the Portal sets the thumbnail and adds the video to the playlist. Pressing **Upload show** again shows the status and a YouTube link.

After you schedule it, the Portal locks the upload. Change the title, time, or anything else in YouTube Studio. One upload per show date. Until you press Schedule, you can choose a different file.

In the **Show Roles Generator**, the show selector includes every saved date, including past shows; the latest four dates also have quick tabs. Selecting a date displays its saved assignments and confirmations. The Member Pool shows each person's last crew, anchor, or associate show-manager assignment as **1 show ago**, **2 shows ago**, etc., or **Never** when none is recorded before the selected show. Counts use saved show dates before the selected date, not calendar days or future assignments. Crew members, anchors, and associate producers who were show manager in the previous two shows are on cooldown, with their counts highlighted in amber. Show-manager duty uses the calendar’s resolved rotation or manual override. Backup assignments do not count toward cooldown. The generator opens on the next show after today and only accepts new shows on Wednesday or Friday school days, so seeded no-school days (such as Friday, October 2, 2026) are skipped.
