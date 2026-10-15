# Teleprompter

Host: `teleprompter.infocuspaly.com` (also linked from the Portal sidebar). The Show's **Open script** / **Create script** opens it for that show date.

Signed-in members with access to the InFocus workspace can create, edit, and run scripts.

- **Page header:** which show it is and when the scripts last synced. On a show day that has a script, it says **Today's show** with today's date; otherwise **Next show** (or **Show on** for a chosen date). **New script** and **Refresh** are here (and the workspace picker, in the Portal, for people in more than one workspace).
- **Scripts list** (left; **Hide scripts** folds it away, **Show scripts** brings it back, and the page remembers that): each script shows its show date, section count, and one tag: **Today**, **Next show**, **To fill · n** (sections that still have an `[INSERT …]` placeholder), or **No sections**. A green dot means it changed since you last opened it in this browser; changed sections inside the script get the same mark. A script's **⋯** menu has **Rename script** and **Delete script**. **Show n more** lists older scripts. On phones and narrow windows, the open script is a card at the top; tap it to open the **Scripts** list.
- **Script toolbar:** **Add section** (a label such as `A1` and the script text), **Reformat all** (AI cleanup of the whole script), and **Run**. On phones and narrow windows, Add section and Reformat all are in the script card's **⋯** menu.
- **Rundown:** every section by label and beat (a column on wide screens, a row of chips above the script otherwise). Click one to jump to it. **Expand all** / **Collapse all** opens or folds every section.
- **Sections** open by default; click a section's header to fold it. Tags show **To fill**, **Empty**, **Editing**, or **Reformatting** progress. `[INSERT …]` placeholders are highlighted in the text. Each section has **Copy section** and **Edit section**, and a **⋯** menu with **Reformat section**, **Refetch bulletin** (A2 only), and **Delete section**.
- **Editing** happens in place: **Label** and **Script**, then **Save** (or Cmd+Enter / Ctrl+Enter). Esc or **Cancel** stops editing; with unsaved changes it asks first, and so does switching scripts or workspaces, refreshing, starting a new script, or editing another section.
- **Run** (or the R key) opens run mode. It is unavailable while a script has no sections or a section is being edited (run mode shows saved text).

## Run mode

A full-screen scroll with a playhead arrow near the top. The top bar has a show picker, a section jump menu, a **Paused** tag and the scroll speed (px/s; **REV** when scrolling backward), **Font settings** (Script size, Cue size, Reset, and the list of keys), fullscreen, and exit.

| Key | Action |
|---|---|
| Space | Pause. Space again resumes at the same speed. |
| ↑ | Faster forward (one speed step). After a pause, starts forward at the first step. |
| ↓ | Slower. Going past zero reverses. After a pause, starts in reverse at the first step. |
| ← | Scroll backward at the current speed. |
| → | Scroll forward at the current speed. |
| Esc | Leave run mode. |

After a Space pause, ← and → do not restart the scroll; use Space or ↑/↓.

On phones and tablets (touch screens), a bar under the script has the same controls as buttons: scroll backward, slower, pause/resume, faster, and scroll forward. It does not appear on mouse-and-keyboard displays.

## Automatic show scripts

When Teleprompter opens, it creates a script for the next show if there is none yet (titled `InFocus Show - M/D/YYYY`). Without a chosen date, it opens the next Wednesday or Friday show after today, skipping no-school days (for example, after Wednesday, September 30, 2026 it opens Wednesday, October 7, because Friday, October 2 is a Staff Development Day). On a show day, use The Show's **Open script** to get that day's script.

The script has five sections: **A1** open, **A2** bulletin, **A3** package, **A4** thank-you names, and **A5** closing.

A1 introductions and A5 sign-offs use anchors’ full names from the registered-user roster (including users who have not joined a workspace), even when the Master Calendar uses first names or nicknames. The coanchor signs off with “Until next time, I’m [full name].” The anchor follows with “I’m [full name] and this has been InFocus News.” Changing anchors in the Master Calendar or The Show updates those name lines in saved show scripts. Opening or refreshing Teleprompter also repairs older name lines. Other script edits are preserved. Older AI intros that merged both speakers are repaired on refresh. Reformat tidies spacing in A1/A5 without rewriting the dialogue or removing speaker cues. If Teleprompter is already open, use **Refresh** in the page header to load the updated names before running the show.

The A2 bulletin takes up to four submitted announcements that run on that show date (not Schoology-only ones), formatted with Gemini. Dated announcements come before permanent ones, and those ending soonest come first. Use **Refetch bulletin** in A2's **⋯** menu to update an existing show's announcements.

College visits come from every weekly tab in the college-visit sheet except Sample. Only Paly campus visits from the show date up to (but not including) the following show date are included. For 1–3 visits, the announcement includes names, days, and times. For 4 or more, it names every college grouped by day, then directs students to MaiaLearning through ClassLink under Events for visit times and RSVP. Reformat preserves the complete generated college passage; if AI drops a day or changes the passage, the original script is kept.

## Package tosses

A3 starts with a `[INSERT PACKAGE TOSS]` placeholder. When Teleprompter opens or refreshes a show, it fills that placeholder with the toss of the first package queued for that show date (read by the coanchor). A second queued package gets its own block read by the anchor. A queued package with no toss yet gets `[INSERT PACKAGE TOSS: headline]` (the Final Cut headline, or the topic if there is none), which is filled in automatically once the group adds its toss. Text a producer has already written in place of a placeholder is never replaced. The fill happens once per placeholder: a package queued or removed after that, or a toss edited after that, has to be changed in the script by hand.

Spirit Week recap shows have no package. For a show named "Spirit Week Day N Recap", A3 starts with "Yesterday's theme was [theme] - let's watch the InFocus Spirit Week Day N recap." instead of the placeholder. The Overall Recap gets "Let's watch the InFocus Spirit Week Overall Recap." This only applies when the show's script is first created.

## Studio kiosk

The studio teleprompter Mac skips Google login with a kiosk token. The first visit uses `?kiosk=TOKEN`, which saves a cookie on that machine. Kiosk access is the teleprompter host and `/teleprompter` APIs only — not the rest of Portal.
