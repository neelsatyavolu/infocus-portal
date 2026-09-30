# Package cycles and Package Cycle roster

Two different pages:

| Page | Route | What it is |
|---|---|---|
| Package Cycles | `/package-cycles` | Stage dates for each cycle, plus Package of the Cycle winners |
| Package Cycle | `/package-progress` | Roster: topic, members, assigned producer |

Cycle count is set in Admin or Edit Cycles on `/package-cycles` (default 3, max 8).

## Package Cycles page (`/package-cycles`)

One card per cycle: the current cycle first (**Active**), then upcoming ones (**Planned**), then cycles whose Final Cut date has passed (**Closed**). Each card lists the five stage dates. A stage shows **Completed** once its date has passed, a countdown such as **in 8d** before that, or **TBD** with no date. Open cycles also show a **Next Stage** box with the next date ahead.

Any producer (associate and up) can click **Edit Cycles**, change dates, and click **Save Cycle** on that card. Only executive producers, the adviser, and super admin can change **Cycles this semester** (1–8) there. Lowering the count hides the extra cycles but keeps their data.

## Package of the Cycle

Up to **2** packages per cycle can win Package of the Cycle. Executive producers vote on the Groups Final Cut tab, next to grading, once the package has a Final Cut. A package wins only when **every** Final Cut grader (all executive producers plus super admin) has voted for it. Withdrawing a vote removes the award. Once two packages have won a cycle, no one can vote for a third.

Winners are listed at the top of `/package-cycles` for everyone, newest cycle first. Each winning member can download their own certificate there (and from their Final Cut page); producers can download any winner's certificate.

## Semester split

- Cycles **1–3** = semester 1
- Cycle **4+** = semester 2 only (S1 gradebooks do not list cycle 4)

## Stages (no skipping)

1. Package Pitching
2. Brainstorming & Proof of Contact
3. A-roll/B-roll
4. Initial Cut
5. Final Cut

Student-facing copy: `/information`.

## Roster (`/package-progress`)

Producers only. Executives, the adviser, and super admin edit the chart. Associates view only. Students are sent to Access denied.

Each row: topic, interviews, notes, members, **one** assigned producer (shown as **AP** or **EP**).

- Editors open the page already editing; changes save automatically. **Cancel Edit** switches to a read-only view, and **Edit Roster** (or clicking a row) switches back. **Add Group** adds a row; right-click a row and choose **Delete row** to remove it.
- Right-click a row and choose **Move to Cycle N** to move the package to another cycle. It keeps its members, uploads, comments, approvals, chats, and extension requests. Cuts already marked done stay done; files already uploaded stay in the old cycle's Drive folder, and new uploads go to the new cycle. The move is refused if a member is already in a group in that cycle. Grades are per member per cycle and do not move.
- Bottom tabs switch cycles. The header counts groups, groups with members, and groups with an assigned producer.
- Consecutive groupmates are flagged with **Same group last cycle: A and B** (students may not repeat the same partners next cycle). It is a warning; Portal does not block the save.
- Assignable producers: associates plus executives and super admin.
- Stage completion is not edited here; it lives on `/groups`.
- An AP who is a **member** of the group gets student cycle tabs for that package.

Quota: reporters 3 packages S1 / 4 S2; associates 2 S1 / 3 S2, capped at how many cycles exist that semester.
