# Cycle Dates and Package Cycle roster

Two different pages:

| Page | Route | Open it from | What it is |
|---|---|---|---|
| Cycle Dates (formerly Package Cycles) | `/package-cycles` | **Calendar** in the sidebar, then the **Cycle Dates** tab | Stage dates for each cycle, plus Package of the Cycle winners |
| Package Cycle | `/package-progress` | **Producing → Package Cycle** in the sidebar | Roster: topic, members, assigned producer |

Cycle count is set in Admin or under **Edit cycles** on `/package-cycles` (default 3, max 8).

## Cycle Dates page (`/package-cycles`)

Under the title, one line names the soonest deadline across all open cycles (for example "Next: Cycle 2 Initial Cut · Fri, Oct 16 · in 3d"), or says that every cycle has closed or that no dates are set yet. **Refresh** (the circular-arrow button) reloads the dates. Each date closes at 11:59 PM Pacific.

**Stage dates** is a table with one row per cycle and one column per stage, so the same stage lines up across cycles: the current cycle first (**Active**, tinted green), then upcoming ones (**Planned**), then cycles whose Final Cut date has passed, under a **Closed** label. Cycle 4 and later carry an **S2** tag. On phones and other narrow screens each cycle is a block that lists its five stages, and closed cycles fold under **Closed cycles** (the browser remembers whether it is open). A stage shows **Completed** once its date has passed, a countdown such as **in 8d** (or **Today**) before that, or **TBD** with no date. Each open cycle's next stage has a **Next** tag with its countdown (on narrow columns the tag shows just the countdown), and the page's soonest deadline (the one named under the title) is the amber tag.

Any producer (associate and up) can click **Edit cycles**. On wide screens each cycle's dates turn into date fields in the same table. On tablets, most laptops and phones, each cycle becomes a card with its five date fields, and closed cycles fold under **Closed cycles**, as in the schedule. Change dates, then click **Save** on that row (**Save cycle** on a card) or press Enter in any of its date fields. A changed cycle shows an **Unsaved** tag (the header counts them), then **Saved** after it saves; a failed save shows the error under that cycle. A date earlier than the stage before it shows a warning (**Earlier than** that stage on a card, **Before** that stage in the table), but still saves. **Refresh** keeps unsaved dates. **Done editing** leaves edit mode; with unsaved dates it first asks **Discard unsaved changes?** (**Keep editing** or **Discard changes**).

Only executive producers, the adviser, and super admin can change **Cycles this semester** (1–8), in the box above the stage dates while editing (beside them on very wide screens): type the number, then **Save count**. Lowering the count hides the extra cycles but keeps their data.

## Package of the Cycle

Up to **2** packages per cycle can win Package of the Cycle. Executive producers vote in the **Package of the Cycle** panel on the Groups Final Cut tab (in the side column under Feedback, above grading), once the package has a Final Cut: **Vote for Package of the Cycle**, or **Withdraw my vote**. A package wins only when **every** Final Cut grader (all executive producers plus super admin) has voted for it. Withdrawing a vote removes the award. Once two packages have won a cycle, no one can vote for a third.

Winners are listed under **Package of the Cycle** on `/package-cycles` for everyone, newest cycle first: below the stage dates, or beside them on very wide screens. The section only appears once a package has won. Each winning member can download their own certificate there (and from their Final Cut page); producers can download any winner's certificate.

The certificate is a landscape US Letter PNG (11 × 8.5 in at 200 dpi). It has three signature lines, one for each executive producer, in name order (people with the executive producer role first; the super admin only fills a line no executive producer takes). Signers are whoever holds the role when the certificate is downloaded. Each line shows that person's full name and **Executive Producer**, with the signature they drew in **Settings → Signature** above it. Until someone draws one, their line is blank so it can be signed by hand. There is no adviser line.

## Semester split

- Cycles **1–3** = semester 1
- Cycle **4+** = semester 2 only (S1 gradebooks do not list cycle 4)

## Stages (no skipping)

1. Package Pitching
2. Brainstorming & Proof of Contact
3. A-roll/B-roll
4. Initial Cut
5. Final Cut

Student-facing copy: the **Cycle guide** (`/information`), linked from the stage bar at the top of every package page.

## Roster (`/package-progress`)

Producers only. Executives, the adviser, and super admin edit the chart. Associates view only. Students are sent to Access denied.

Each row: topic, interviews, notes, members, **one** assigned producer (shown as **AP** or **EP**). A group with no producer shows an **Unassigned** tag, and one with no members a **No members** tag. Interviews and notes show their first line; click one to read the whole note (editors type in it there, and it saves when the box closes).

- Editors open the page already editing; changes save automatically. The header tag shows **Saves automatically** until the first edit, then **Saving…**, then **All changes saved**, or **Not saved**. When a save fails, a **Changes didn't save** note under the controls has a **Try again** button. The **View | Edit** switch above the table changes mode, and clicking a row in View switches to Edit. **Add group** (top right, next to **Open Groups**; in the middle of the page when the cycle has no groups yet) adds a row and puts the cursor in its topic. Enter saves the topic; Shift+Enter adds a line break. Associates see a **View only** tag.
- Editors can right-click a row, or tap the **⋯** button at the end of the row, to open its menu. **Move to → Cycle N** moves the package to another cycle. It keeps its members, uploads, comments, approvals, chats, and extension requests. Cuts already marked done stay done; files already uploaded stay in the old cycle's Drive folder, and new uploads go to the new cycle. The move is refused if a member is already in a group in that cycle. Grades are per member per cycle and do not move. **Open in Groups** opens the group's current stage. **Delete group** asks first, then removes the group with its members, chat, feedback, approvals, proof of contact, scores, and extension requests (uploaded files stay in Drive).
- The cycle picker above the table (or the **[** and **]** keys) switches cycles. Switching cycles while a save is still landing, or after one failed, asks first. **Refresh** (the circular-arrow button) reloads the roster; after a failed save it asks first too, because it drops the edits that did not save. The header shows the cycle's **Active**, **Planned**, or **Closed** tag and its dates (Pitch to Final Cut).
- Filter chips above the table: **All**, **No producer**, **No members**, **Same group last cycle**, and **Assigned to me**, each with a count (every chip except **All** hides when nothing matches). Next to them on wider screens: how many groups have members and how many have a producer. The chosen filter is remembered in that browser.
- Consecutive groupmates are flagged with **Same group last cycle: A and B** (full names; students may not repeat the same partners next cycle). The **Add members** picker also marks each person who shared last cycle's group with someone already in the group (**Same group last cycle as A**). It is a warning; Portal does not block the save.
- Assignable producers: associates plus executives and super admin.
- The **Stage** column shows each group's current stage and extension tags (read only); click it to open that stage in Groups. Stage completion is not edited here; it lives on `/groups`.
- An AP, EP, or super admin who is a **member** of the group gets student cycle tabs for that package (**My package** in the sidebar, and the stage bar on its pages).

Quota: reporters 3 packages S1 / 4 S2; associates 2 S1 / 3 S2, capped at how many cycles exist that semester.
