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

- Weeks 1 and 4 (and a trailing 5th week): volunteer — producers pick names.
- Weeks 2 and 3: Randomize fills the two slots. You can still pick names by hand on the dropdowns; that replaces the random assignment and is not recorded as a volunteer.
- Nobody anchors twice in the same month. Volunteers that month are out of the random pool.
- Randomize uses registered class members, not advisers/EPs/super admin. EPs can be picked by hand.
- That week's PA people are skipped for both shows that week.
- Dropping an anchor needs 48 hours' notice.

**PA announcers** — random from people who are not anchoring that month.

**Show manager** — one per SHOW day. Default rotation: first-name order through executive producers (including super admin) and associate producers. Adviser is not in the pool. Override on the calendar or The Show; **Use rotation** clears it.

Nicknames are what the dropdowns show.

## The Show (`/show-roles`)

Producer page to generate crew roles for a show date, set anchors, PA, and show manager. Same roster rules as the calendar. Generate Roles skips EPs and advisers in auto-assign; they stay in the manual picker. Super admin is not listed.

In the **Show Roles Generator**, the show selector includes every saved date, including past shows; the latest four dates also have quick tabs. Selecting a date displays its saved assignments and confirmations. The Member Pool shows each person's last crew, anchor, or associate show-manager assignment as **1 show ago**, **2 shows ago**, etc., or **Never** when none is recorded before the selected show. Counts use saved show dates before the selected date, not calendar days or future assignments. Crew members, anchors, and associate producers who were show manager in the previous two shows are on cooldown, with their counts highlighted in amber. Show-manager duty uses the calendar’s resolved rotation or manual override. Backup assignments do not count toward cooldown.
