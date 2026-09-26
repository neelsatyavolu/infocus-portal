# Livestreams

Route: `/livestreams`.

Semester 1 hours accumulate immediately, but livestream grades stay **—** and are excluded from totals until **November 30 at midnight Pacific**. Grade Editor and student grade views still show **x/8 hours completed** during that time.

The schedule lists today and upcoming livestreams first; livestreams from earlier days move to the bottom. The schedule’s Crew column shows attendees by first name.

Full credit: **8 completed hours per semester** (5 pts/hour → 40 pts in the Packages category). Hours come from attendees on **COMPLETED** events in the semester window (S1 Aug 13–Dec 18, S2 Jan 5–Jun 3). Appointed livestream managers instead earn **10 pts per COMPLETED livestream they manage** in the semester (the event's Manager field), so **4 managed livestreams = 40 pts**; extra managed events are not extra credit, and zero-hour (credit-cancelled) events do not count.

The **Completion** tab hides execs only: EPs, the adviser, and the super admin. Associate producers still need livestream credit and stay listed. Manager rows show a **Manager** tag and **x / 4 managed** instead of hours.

Everyone can view the schedule. All signed-in members, including producers, can request sign-up unless they are appointed livestream managers. Appointed livestream managers cannot request sign-up, even if they are also producers. Producers and appointed livestream managers create events, mark complete, and manage attendees.

## Adjust credit

Producers and appointed livestream managers can open **Edit** on a livestream and change **Default credit hours** for the crew. Under **Individual credit hours**, enter a person’s hours (0–24), use **0** to remove their credit, or leave blank to use the event default. Individual overrides are absolute hours, not percentages.

**Cancel credit** sets the event default to **0**, awarding no credit to anyone even if individual overrides exist. Save to apply. The event and attendance remain recorded. Restore a positive default to award credit again; saved individual overrides then apply again. Only **Completed** events award credit; Scheduled and Cancelled events award none. Adjustments feed completion totals and official grade calculations.

## Livestream dashboard

Route: `/live`. Producers and appointed livestream managers open it from **Dashboard** at the top of `/livestreams`. Anyone else can open `/live` signed out with the **livestream dashboard PIN**; producers and managers see and replace it in **Settings → Livestream dashboard PIN**. A PIN session lasts until midnight Pacific and only opens the dashboard. Replacing the PIN ends every PIN session. The PIN locks after 20 wrong tries in 15 minutes.

Pick a livestream (from 12 hours ago through the next 45 days), then use one of three tabs:

- **Thumbnail**: template **A · Matchup** (games) or **C · Event** (everything else), in **YouTube** 1280 × 720, **Instagram post** 1080 × 1350, or **Instagram story** 1080 × 1920. Fields fill in from the event title, start time, and location. **Download PNG** saves the image. Instagram versions add “Live on YouTube · @infocusnews”; stories keep the top and bottom 250px clear.
- **Scoreboard**: drives OBS source 1. Sports: **Basketball** (bar with a green tier for Bonus and timeouts), **Football** (clock in the middle, down and distance above the team with the ball, three timeout pips per team, restored at halftime), **Volleyball** (a row per team with sets won, serve dot, and highlighted points; **End set** records the set), and **Other** (free-text period, a clock that counts up or down with a set period length, and a note on the strip). Team names can be up to 20 characters; long names shrink on the bug to fit. Tap a score or the clock to type a new value (for example 4:32 or 45.5); **−10s / −1s / +1s / +10s** nudge the clock, the arrows beside the quarter step back or forward, and **Space** starts or stops the clock when you're not typing. **Position** puts the bug at the bottom (default) or top. **Call timeout** shows a tag for 8 seconds (football also takes a timeout pip; **+** gives one back). **Throw flag** turns football's down tab yellow until you tap it again, set a new down, or someone scores (it clears itself after 2 minutes). In football, **+6** plays a green TOUCHDOWN plate with the team name over the bug for about 5 seconds; **−1** right after cancels it, and **Touchdown animation** on the Football card turns it off. A finished volleyball set shows for 10 seconds. Scoring clears football's down. Switching sport clears the score but keeps team names and colors.
- **Live image**: drives OBS source 2. Pick a graphic (Starting soon, Commentators, Player spotlight, Halftime, Be right back, Final score) to queue it, fill in its fields, then **Push to OBS**. **Clear** sets the source back to transparent. Halftime and Final score read the score from the scoreboard.

Each livestream has two OBS Browser Source links, both 1920 × 1080 with a transparent background: `/live/<key>/scoreboard` and `/live/<key>/image`. They are read-only and need no sign-in, so the key is the secret. Signed-in producers and managers can press **Make new OBS links** to replace the key; the old links stop working. Overlays check for changes every second.
