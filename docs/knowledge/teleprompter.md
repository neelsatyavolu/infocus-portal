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

A full-screen scroll with a playhead arrow near the top. The top bar has a show picker, a section jump menu, a **Paused** tag and the scroll speed (px/s; **REV** when scrolling backward), **Auto**, **Settings** (Script size, Cue size, Reset, Auto follow, and the list of keys), fullscreen, and exit.

### Auto follow

**Auto** is on when run mode opens (turn it off with the **F** key or the **Auto** button, and that computer remembers). It makes the prompter follow the anchor's voice: it listens through the computer's microphone, works out which line is being read, and keeps that line at the arrow. Lines already read fade. The tag in the top bar says what it's doing:

- **Following**: it hears the script and is keeping up.
- **Holding**: it hears talk that isn't the script (banter, an ad-lib) and stays still.
- **Package**: the anchor finished a toss to `{ROLL PACKAGE}` (or another `ROLL`, `SOT`, `PKG` or `PLAY` cue). It waits there and moves when the anchor reads the start of the next story, so the package's own audio can't move it. After 15 seconds it also accepts a full sentence from later in the show, in case the next story was cut.
- **Searching**: it lost the place for a few seconds and looks across the whole show; reading a sentence of script picks it back up.
- **Auto failed**: the microphone or the speech model stopped (hover for the reason; Settings shows it too). The script holds still: take over by hand, or press **F** twice to restart Auto.

While Auto starts (the microphone permission, then the speech model: about 150 MB for Fast, 210 MB for Accurate, downloaded the first time on a computer and cached after), the whole screen says **Don't start yet** with the download progress. It flashes **Ready** when it's listening; start reading then. **Cancel** turns Auto off and scrolls by hand. If Auto can't start, the screen says why until you close it.

Turn Auto on once before the show on the studio computer, so the model is already downloaded and the microphone already allowed.

Taking over by hand always works: Space stops the script where it is, and any arrow key or touch button scrolls by hand from there at the last scroll speed (↑ and ↓ adjust it). Either one turns Auto off; press **F** to turn it back on, and it follows from the line at the arrow. With Auto on, clicking a word makes it follow from that word, and the section menu jumps there and keeps following. Switching shows turns Auto off.

### Voice commands

While Auto is on, the crew can steer by voice. Start with **"Teleprompter,"** (after a pause, or right after the anchor finishes a sentence), then one command:

| Say | Does |
|---|---|
| Teleprompter, go to the top | Top of the show |
| Teleprompter, go to the first (second, third, last) announcement | That announcement in the bulletin |
| Teleprompter, go to A3 / the open / the announcements / the package / the thank yous / the closing | That section |
| Teleprompter, go to spirit week | The story that starts with those words |
| Teleprompter, next / back | Next story; back to the start of this one (or the one before) |
| Teleprompter, line back | Up a line |
| Teleprompter, pause / resume | Hold still / follow again |
| Teleprompter, undo | Undo the last jump |

The top bar shows what it did (**✓ Top**) or **? Didn't catch that** for a few seconds. "Teleprompter" only counts at the start of a sentence, so talking *about* the teleprompter ("the teleprompter is slow") does nothing, and while the script itself says "teleprompter" nearby, commands are ignored. "Prompter, …" also works.

**Settings → Auto follow** picks the microphone, the channel (**Both**, or **Input 1** / **Input 2** on a two-input audio interface), a **Second microphone** (for example one USB mic per anchor; both are mixed together, and a two-input interface with **Both** does the same), and the model (**Fast**, the default, or **Accurate**, which is slower). The meter shows the input level; it turns green while it hears someone talking, and the white mark is where it starts counting sound as speech (it adjusts to the room by itself). Speech recognition runs in Chrome on that computer: audio isn't sent anywhere. Use Chrome; the first use asks for microphone permission.

| Key | Action |
|---|---|
| Space | Pause. Space again resumes at the same speed. |
| ↑ | Faster forward (one speed step). After a pause, starts forward at the first step. |
| ↓ | Slower. Going past zero reverses. After a pause, starts in reverse at the first step. |
| ← | Scroll backward at the current speed. |
| → | Scroll forward at the current speed. |
| F | Auto follow on or off. |
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

A4 starts with a `[INSERT THANK YOU NAMES]` placeholder. The same refresh replaces it with the first names of every member of the packages queued for that show (nickname if set, else first name), e.g. "Thank you Abby, Otto, and Sage!". It also fills once: a line a producer already wrote is never replaced, and a package queued after the fill has to be added by hand.

Spirit Week recap shows have no package. For a show named "Spirit Week Day N Recap", A3 starts with "Yesterday's theme was [theme] - let's watch the InFocus Spirit Week Day N recap." instead of the placeholder. The Overall Recap gets "Let's watch the InFocus Spirit Week Overall Recap." This only applies when the show's script is first created.

## Studio kiosk

The studio teleprompter Mac skips Google login with a kiosk token. The first visit uses `?kiosk=TOKEN`, which saves a cookie on that machine. Kiosk access is the teleprompter host and `/teleprompter` APIs only, not the rest of Portal.
