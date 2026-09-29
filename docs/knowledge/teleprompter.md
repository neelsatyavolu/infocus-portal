# Teleprompter

Host: `teleprompter.infocuspaly.com` (also linked from the Portal sidebar).

Producers build rundown docs with sections (anchors, packages, PA, etc.), reformat copy, and run scroll mode: compositor scroll, playhead, speed, top/bottom fades. In run mode, Space pauses and Space again resumes at the same speed; after a pause, ArrowUp or ArrowDown resumes in that direction at the first speed step, while the horizontal arrows resume in their selected direction.

## Automatic show scripts

A1 introductions and A5 sign-offs use anchors’ full names from the registered-user roster (including users who have not joined a workspace), even when the Master Calendar uses first names or nicknames. The coanchor signs off with “Until next time, I’m [full name].” The anchor follows with “I’m [full name] and this has been InFocus News.” Changing anchors in the Master Calendar or The Show updates those name lines in saved show scripts. Opening or refreshing Teleprompter also repairs older name lines. Other script edits are preserved. Older AI intros that merged both speakers are repaired on refresh. Reformat tidies spacing in A1/A5 without rewriting the dialogue or removing speaker cues. If Teleprompter is already open, use **Refresh** to load the updated names before running the show.

College visits come from every weekly tab in the college-visit sheet except Sample. Only Paly campus visits from the show date up to (but not including) the following show date are included. Without a chosen date, Teleprompter opens the next Wednesday or Friday show, skipping no-school days (for example, after Wednesday, September 30, 2026 it opens Wednesday, October 7, because Friday, October 2 is a Staff Development Day). For 1–3 visits, the announcement includes names, days, and times. For 4 or more, it names every college grouped by day, then directs students to MaiaLearning through ClassLink under Events for visit times and RSVP. Reformat preserves the complete generated college passage; if AI drops a day or changes the passage, the original script is kept. Use the bulletin section’s **Refetch** action to update an existing show’s announcements.

## Package tosses

A3 starts with a `[INSERT PACKAGE TOSS]` placeholder. When Teleprompter opens or refreshes a show, it fills that placeholder with the toss of the first package queued for that show date (read by the coanchor). A second queued package gets its own block read by the anchor. A queued package with no toss yet gets `[INSERT PACKAGE TOSS: headline]`, which is filled in automatically once the group adds its toss. Text a producer has already written in place of a placeholder is never replaced. The fill happens once per placeholder: a package queued or removed after that, or a toss edited after that, has to be changed in the script by hand.

## Studio kiosk

The studio teleprompter Mac (serial label `GH7953223T`) skips Google login via a kiosk token cookie (`infocus_teleprompter_kiosk`). First visit uses `?kiosk=TOKEN`. Kiosk access is the teleprompter host and `/teleprompter` APIs only — not the rest of Portal.
