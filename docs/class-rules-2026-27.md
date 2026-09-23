# InFocus 2026–27 Rules — Implementation Reference

Canonical summary of the rules the app enforces, derived from the *InFocus Master Document 2026-27*. When the document and this file disagree, the document wins — update this file to match.

## Producer roles

`PlatformRole` (`prisma/schema.prisma`):

| Role | Weight | Notes |
|---|---|---|
| `SUPER_ADMIN` | 3 | Hidden technical tier, hardcoded to `PLATFORM_SUPER_ADMIN_EMAIL`. Can assign roles and View as any user. |
| `EXECUTIVE_PRODUCER` | 2 | Heads of Operations & Production, Personnel & Staff, Creative & Content. |
| `ADVISER` | 2 | De facto super admin for platform administration (role assignment, View as, danger zone). Distinct in the approval chain. |
| `ASSOCIATE_PRODUCER` | 1 | Assigned packages in Groups. Not given a News / Feature / Commentary category on Producer Team. |

`isExecutiveProducer()` deliberately **excludes** `ADVISER`: the adviser satisfies stage 2 of the approval chain and never stage 3. `isPlatformSuperAdmin()` includes `ADVISER`. Student `/grades` is hidden for EP, adviser, and super admin. See `src/lib/platform-admin.ts`.

## Package cycles

Stages, in order — no stage may be skipped:

1. Package Pitching
2. Brainstorming & Proof of Contact
3. A-roll/B-roll
4. Initial Cut (Stage 1 approval sends the latest cut straight to stage 2; the adviser decides whether it needs a revision. After sending it back, the Stage 1 producer can still use **Approve anyway** to send the latest version on)
5. Final Cut

Cycle count is configurable in `/admin` or via **Edit Cycles** on `/package-cycles` (default 3, `ProgramSetting.cyclesPerSemester`). Stage dates live on `/package-cycles`.

Regular reporters complete **3 packages in semester 1** and **4 in semester 2**. Associate producers complete **2 in semester 1** and **3 in semester 2**. Requirements cap at how many cycles exist that semester. An AP who skips a cycle is not zeroed unless they still cannot meet the quota after remaining finals have passed. Extra packages they join can replace a weaker counted cycle.

When an associate is a **member** of a package group, they get the student cycle tabs (Brainstorming, A-roll/B-roll, Initial Cut, Final Cut) and work that package as a student. Producer review stays on Groups.

Cycles **1–3** are semester 1. **Cycle 4+ is semester 2 only** — S1 gradebooks (student All Grades and the Grade Editor Student tab) do not list Cycle 4.

Seeded dates (`prisma/seed-cycles-2026-27.ts`): Cycle 1 and Cycle 3 only. **Cycle 2 is deliberately unseeded** — the master document lists its A-roll (Sep 16) and initial cut (Sep 21) before its own pitching date (Oct 2), which appears to be a typo for October. Enter those by hand.

Categories are `NEWS`, `FEATURE`, `COMMENTARY`. Package Cycle flags members who were in the same group last cycle.

## Approval chain

`src/lib/package-approval.ts`, `src/server/package-approval-service.ts`.

```
DRAFT → ASSOCIATE_REVIEW → ADVISER_REVIEW → EXECUTIVE_REVIEW → APPROVED
```

**Approval is anchored to the package (`PackageProgressRow`), not to a media
item.** The chain spans three artifacts — stage 1 and stage
2 review the initial cut, stage 3 the final cut — so keying it to one file
would split a single package's approval across two records and leave the final
cut's chain stuck at `DRAFT`.

### How students upload

- **Initial Cut folder** — one media item per package. `v1` is the first initial cut;
  each revision after producer or adviser feedback adds a version.
  Using versions here keeps that feedback threaded across revisions.
- **Final Cut folder** — a separate media item.
- The progress row links both via `initialCutMediaItemId` and
  `finalCutMediaItemId`, and owns the approval chain.

Gates enforced in the service layer:

- `submitForReview()` requires `initialCutMediaItemId` — a package cannot enter
  the chain with nothing uploaded.
- Executive approval reviews the latest Initial Cut. Final Cut uploads only
  after `APPROVED`.

Sign-offs record `mediaItemId` so it is clear which cut each reviewer saw.
`/api/media/[mediaId]/package-approval` reverse-looks-up the package from a cut;
`/api/package-progress/[rowId]/approval` acts on the package directly.

- **Stage 1** — only the producer **assigned to the package group** on Package Cycle. That can be an associate (`assignedProducerUserId`) or an executive / super-admin (`assignedExecutiveProducerUserId`). An assigned EP or super-admin greenlights Stage 1 the same way an assigned AP does (typical when the usual AP is a student on that package). Other executives cannot skip this stage. If nobody is assigned, fall back to the associate who owns the package's category. A package with no category yet is open to any associate producer. Students keep revising until that assigned producer greenlights. Execs (including the adviser) assign one producer on `/package-progress` (roster: topic, members, assigned producer). Assignable EPs are `EXECUTIVE_PRODUCER` plus `SUPER_ADMIN`. Assigned EP is not a substitute for Stage 3: two distinct executive sign-offs are still required. `/groups` shows every package to EPs, the adviser, and super-admin; associates only see assigned groups (or their category when unassigned). Initial/final cut flags stay wired to media uploads; manual toggles set `initialCutManual` / `finalCutManual`.
- **Stage 2** — only the adviser (`PACKAGE_ADVISER_EMAIL`). Executives cannot advance this stage.
- **Stage 3** — **two** distinct executive producers; **three** when `controversial` is set. The same executive cannot sign off twice. Stage 3 reviews the latest Initial Cut. `APPROVED` unlocks Final Cut; it does not mean airable.
- A denial at any stage sends the package back to `DRAFT` and clears executive sign-offs, so a returned package cannot inherit approvals collected before changes were requested.
- Nothing airs until a producer clicks **Send to queue**. `canPublish()` is no longer tied to approval.
- Social media bypasses the chain and is approved by the Head of Creative & Content.

## Grading

`src/lib/grading.ts`. Weighted **55 / 35 / 10**:

| Category | Weight | Composition |
|---|---|---|
| Packages | 55% | 50 pts per cycle final cut + 20 pts per cycle check-ins + 40 pts livestream credit (5 per hour × 8 hours) |
| Participation | 35% | 50 pts/week — 10 on Mondays (PA), 20 on Tue/Thu class days; Wed/Fri shows none; holidays 0. First gradeable day is **Tuesday, August 18, 2026** (`FIRST_PARTICIPATION_DATE`). Earlier class days stay on the master calendar but do not count. Full marks on Classroom Participation (`/participation`) post immediately. A score below that day’s max needs another producer (not the person who entered it) to approve — the adviser can approve. Pending docked scores stay off the student gradebook. The adviser and other executive producers are emailed when a request is waiting. |
| Portfolio | 10% | Final portfolio out of 100 |

**Null means ungraded and is excluded from both sides of the ratio; `0` means
graded and earned nothing.** This applies to every component — per-cycle final
cuts, per-cycle check-ins, livestream credit, and the portfolio. A category whose
`possible` is 0 is dropped entirely and the remaining weights renormalise.

Conflating the two silently punishes students for cycles that have not happened
and work producers have not marked yet. Each check-in counts once that stage's
deadline has passed; a final cut counts once it has been graded.

`buildGradeSummary()` returns `percentage: null` and `letter: null` when nothing
is gradeable — a day-one student has no grade, not a 0% F.

**Check-ins**: the final cut is *not* a check-in. Four check-ins (pitching, proof of contact, a-roll/b-roll, initial cut) × 5 points = 20 per cycle. After a stage deadline, PoC and Initial Cut receive 5 points for submission and 0 for missing work. **A-roll/B-roll requires producer approval**: submitted work awaiting review or needing revisions receives 0/5 until approved. Pitching has no upload, so the producer mark is the credit signal. Approval still counts if the student submitted and a producer later marked the stage complete. Later stages stay ungraded until their own deadline. Students submit three proof-of-contact images and a brainstorm Google Doc on `/brainstorming`. The assigned producer still reviews that material on `/groups`; approval advances the workflow but is not required for the check-in grade after the deadline.

Executive producers and the adviser can override each check-in with 0–5 points in the Grade Editor cycle tabs. Overrides affect official grades after the stage deadline; choosing Automatic restores automatic scoring. Grade Editor also supports explicit Ungraded and Exempt states for each check-in and Final Cut. Both exclude earned and possible points, even after deadlines; zero remains a graded zero. In typed score fields, `-` means ungraded and `\` means exempt.

**Livestreams** are tracked natively at `/livestreams` (schedule, completion, sign-ups). Full credit is **8 completed hours per semester** (5 pts/hour → 40 pts). Partial scales linearly: 4h = 20 pts. Hours come from attendees on `COMPLETED` events in the current semester window (S1 Aug 13–Dec 18, S2 Jan 5–Jun 3). Producers and appointed livestream managers edit the tracker; all members can view the schedule. All signed-in members, including producers, can request sign-ups except appointed livestream managers (even if they are also producers).

Semester 1 livestream points remain ungraded and excluded from totals until **November 30 at midnight Pacific**. Completed hours remain visible in Grade Editor and student grade views. On release, the existing hours-to-points rule applies; a semester with no completed events remains ungraded. Semester 2 release timing is unchanged.

## Revisions

`src/lib/package-revisions.ts`.

- After the effective deadline (final cut date + approved extension), a package with no final cut that cleared all three stages is **0/50**.
- Once that cut is submitted, **every executive producer** enters a true quality score out of 50. The official quality score is the average, rounded to the nearest tenth. Associate producers do not grade. Late 20%/30% is a separate turn-in penalty.
- After the first graded final cut, a score **below 75%** can take one second revision, capped at **37/50**. The late penalty still applies and is not removed by the second revision.

## Extensions

`src/lib/package-extensions.ts`. The 14-day allowance pool is **abolished**.

- Request-only. A request covers the **entire package group** (the `PackageProgressRow` the
  student is on for that cycle). Every group member must agree before producers can act.
  Any member disagreement denies the request.
- Then **two distinct producer approvals** are required. Any single producer denial blocks it.
- The first approving producer sets the grant: days (1–30, may differ from the request) and which
  group members it covers (`grantedDays`, `grantedUserIds`; empty = whole group). The second
  approval accepts those terms as-is.
- On approval, the group’s package progress `extension` flag is set. Deadlines and late penalties
  use each member’s own granted days (`approvedExtensionDaysFor`); uncovered members get none.
- Past the extension deadline → **20%** reduction.
- More than **14 days** past → **30%**, and a second revision cannot repair it.

Legacy pool code still exists in `src/lib/extensions.ts` and `/extensions`; the new flow is `/extension-requests`.

## Weekly schedule (2026–27)

| Day | Activity |
|---|---|
| **Monday** | PA announcements (short period) |
| **Tuesday** | Class |
| **Wednesday** | Show day (broadcast) |
| **Thursday** | Class |
| **Friday** | Show day (broadcast) |

Holidays / staff days cancel all activity (seeded from the PAUSD 2026–27 calendar in
`src/lib/school-schedule.ts`; overridable via `SchoolCalendarDay` / Admin). Days may
be switched around holidays with schedule overrides (`PA` / `SHOW` / `NONE` / `HOLIDAY`).
Participation grades start **August 18, 2026** — August days before that remain
on the master calendar but are not scored. Show days stay Wednesday and Friday
starting **Friday, September 4, 2026** (`FIRST_SHOW_DATE`); earlier Wed/Fri are
class days, not air dates. Participation is scored on Tuesday and Thursday class meetings.

Subdomains:

- `grades.infocuspaly.com` — student grade dashboard (Home, Packages, Participation, Other, All Grades with what-if)
- Grade Editor **Student** tab — producers open one reporter's Schoology-style All Grades table (same grouping as the student tab; what-if does not save)
- `teleprompter.infocuspaly.com` — teleprompter app
- `infocuspaly.com` — main packages app

## Anchors and the show

`src/show-roles/lib/anchors.js`. Shows run **Wednesday and Friday**.

- Weeks **1 and 4**: anchors volunteer (producers pick names on the master calendar cell). Weeks **2 and 3**: Randomize fills the two slots; producers can still pick names by hand on the calendar or The Show. Manual picks on a random week are not recorded as volunteers.
- Anyone who volunteered that month is excluded from the random pool (`AnchorVolunteer`, keyed by `YYYY-MM`).
- Nobody anchors twice in the same month.
- Week of month is counted by calendar date: days 1–7 are week 1, 8–14 week 2, and so on. A trailing fifth week follows the week-4 (volunteer) rule.
- Monday PA announcers are randomly drawn from people who are not anchoring that month.
- Randomize pulls from registered users who are not advisers, executive producers, or super-admin. EPs can be picked by hand on the dropdowns but are never chosen by Randomize. Unique first names; full name if two people share a first name.
- The Show / show-roles generator loads the same registered-user roster. Generate Roles and role repick skip EPs and advisers; those people stay available in the manual picker. Super-admin is not listed.
- Generator cooldown covers the previous two saved shows before the selected date. Crew roles, anchoring, and show-manager duty by an associate producer all count; backup roles do not. Member recency uses the same assignments and counts shows, not days.
- Each show has one **show manager**. Default is a rotation through executive producers (including super-admin) and associate producers, first-name order from the first air date. Producers can override a date on The Show or the master calendar; later automatic days restart from the next person in the pool so the following show is not a duplicate. **Use rotation** / **Auto** clears the override. The adviser is not in the pool. The resolved name is on SHOW cells and in the Google Doc (SM).
- People assigned to that week’s PA are excluded from random anchors for both shows that week (Wednesday and Friday). Same people do not PA and anchor in the same week.
- Dropping an anchor slot requires **48 hours** notice (`hasSufficientAnchorNotice`).
- Executives (and the adviser / super admin) can open **Anchors & PA** on the master calendar to see how many times each person has been assigned to anchor or PA.

`/api/show-roles/anchor-suggestion` returns read-only guidance for the master calendar. `/api/show-roles/show-manager` saves a per-show manager override. The publishing queue auto-assigns a package to the next upcoming show that has none yet. Producers can drag packages onto a show (max 2). Automatic assignment never stacks two packages on the same show.

## Known gaps

- Equipment kit manifests, return checklists, and damage reports are not built; `EquipmentItem.retailValueCents` exists to back the missing-item invoice but nothing consumes it yet.
- AI-use attestation and conflict-of-interest disclosure fields are not built.
- No voting/decision module (deliberately out of scope).
