# Teleprompter

Host: `teleprompter.infocuspaly.com` (also linked from the Portal sidebar). The Show's **Open script** / **Create script** opens it for that show date.

Signed-in members with access to the InFocus workspace can create, edit, and run scripts. The script list is on the left: **New script**, **Refresh**, and per script **Rename** and **Delete**. In a script, use **Add section** (a label such as `A1` and the script text), **Reformat** (AI cleanup of the whole script, or one section), **Copy section**, **Edit section**, and **Delete section**. **Run** opens run mode.

## Run mode

A full-screen scroll with a playhead arrow near the top. The top bar has a show picker, a section jump menu, **Font settings** (Script Size, Cue Size, Reset), fullscreen, and exit.

| Key | Action |
|---|---|
| Space | Pause. Space again resumes at the same speed. |
| ↑ | Faster forward (one speed step). After a pause, starts forward at the first step. |
| ↓ | Slower. Going past zero reverses. After a pause, starts in reverse at the first step. |
| ← | Scroll backward at the current speed. |
| → | Scroll forward at the current speed. |
| Esc | Leave run mode. |

After a Space pause, ← and → do not restart the scroll; use Space or ↑/↓.

## Automatic show scripts

When Teleprompter opens, it creates a script for the next show if there is none yet (titled `InFocus Show - M/D/YYYY`). Without a chosen date, it opens the next Wednesday or Friday show after today, skipping no-school days (for example, after Wednesday, September 30, 2026 it opens Wednesday, October 7, because Friday, October 2 is a Staff Development Day). On a show day, use The Show's **Open script** to get that day's script.

The script has five sections: **A1** open, **A2** bulletin, **A3** package, **A4** thank-you names, and **A5** closing.

A1 introductions and A5 sign-offs use anchors’ full names from the registered-user roster (including users who have not joined a workspace), even when the Master Calendar uses first names or nicknames. The coanchor signs off with “Until next time, I’m [full name].” The anchor follows with “I’m [full name] and this has been InFocus News.” Changing anchors in the Master Calendar or The Show updates those name lines in saved show scripts. Opening or refreshing Teleprompter also repairs older name lines. Other script edits are preserved. Older AI intros that merged both speakers are repaired on refresh. Reformat tidies spacing in A1/A5 without rewriting the dialogue or removing speaker cues. If Teleprompter is already open, use **Refresh** to load the updated names before running the show.

The A2 bulletin takes up to four submitted announcements that run on that show date (not Schoology-only ones), formatted with Gemini. Dated announcements come before permanent ones, and those ending soonest come first. Use A2's **Refetch bulletin** action to update an existing show's announcements.

College visits come from every weekly tab in the college-visit sheet except Sample. Only Paly campus visits from the show date up to (but not including) the following show date are included. For 1–3 visits, the announcement includes names, days, and times. For 4 or more, it names every college grouped by day, then directs students to MaiaLearning through ClassLink under Events for visit times and RSVP. Reformat preserves the complete generated college passage; if AI drops a day or changes the passage, the original script is kept.

## Package tosses

A3 starts with a `[INSERT PACKAGE TOSS]` placeholder. When Teleprompter opens or refreshes a show, it fills that placeholder with the toss of the first package queued for that show date (read by the coanchor). A second queued package gets its own block read by the anchor. A queued package with no toss yet gets `[INSERT PACKAGE TOSS: headline]` (the Final Cut headline, or the topic if there is none), which is filled in automatically once the group adds its toss. Text a producer has already written in place of a placeholder is never replaced. The fill happens once per placeholder: a package queued or removed after that, or a toss edited after that, has to be changed in the script by hand.

## Studio kiosk

The studio teleprompter Mac skips Google login with a kiosk token. The first visit uses `?kiosk=TOKEN`, which saves a cookie on that machine. Kiosk access is the teleprompter host and `/teleprompter` APIs only — not the rest of Portal.
