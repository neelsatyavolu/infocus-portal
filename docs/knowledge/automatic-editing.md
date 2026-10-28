# How automatic editing works

A Mac in the studio edits each show by itself. It picks the best take of every segment, cuts between the cameras, puts fresh graphics on, levels the sound and checks its own work. A producer watches the finished edit in the Portal, then approves it or sends it back. This page walks through it from recording to YouTube. It's also the **How to** view of the Editing tab (`/editing?view=howto`).

Who can use it: associate producers and up. Everything happens on the **Editing** tab (`/editing`), under The Show.

## The short version

1. Record the show on the TriCaster and export the files to the **Shows** folder on Drive.
2. Wait about 5 minutes for the files to be renamed after the show.
3. Open **Editing**, pick the show, check the ticked recordings, add any instructions and press **Start automatic editing**.
4. About 15 minutes later you get an email that it's ready. Watch it.
5. Tick that the publish date and time are right, then press **Approve & schedule**, or **Send back** with what to change.

If nobody does anything, it's scheduled on YouTube by itself at 8:00 AM on show day.

## 1. Before you record

The editor builds the show from what's in the Portal, so set these up first:

- **Anchors:** put the anchors on the **Master Calendar** for that show date. Their names go on the dual third, spelled from the class list.
- **Announcements:** write them in the show's **Teleprompter** (or schedule them in Announcements). Each announcement card is made from this text, so put the date, time and place in it. The line under **Start automatic editing** says how many announcements the script has, and warns if the show has no script yet or its A2 is empty.
- **Packages:** queue each package for the show in the **Publishing Queue**, with its final cut and its toss (the line the anchor reads to throw to it). The editor drops the package in at the throw, and the YouTube description uses the toss. The line under **Start automatic editing** names the queued packages, and warns if none is queued or one has no final cut yet.

## 2. Record and export

You can record either way:

- **One switched recording:** the TriCaster's program output. It exports as `InFocus Show (12).mov`.
- **All three cameras at once:** the TriCaster records Left, Center and Right separately and exports `InFocus Show Left.mov`, `InFocus Show Center.mov` and `InFocus Show Right.mov`. The editor cuts between them itself.

Restarts are fine. If you redo part of the show, record again and export again; the editor compares every take and keeps the best one. Export everything to the **Shows** folder on Drive.

Every 5 minutes the NAS renames new exports after the show they air in, which is the day after the export:

- `InFocus Show (12).mov` → `InFocus Show 10-23-2026.mov`
- `InFocus Show Left.mov` → `InFocus Show 10-23-2026 Left.mov` (and the same for Center and Right)
- A second recording the same day gets ` (1)`: `InFocus Show 10-23-2026 Left (1).mov`

It waits until a file has finished copying before renaming it. A file still named `InFocus Show (12).mov` or `InFocus Show Left.mov` just hasn't been renamed yet.

## 3. Start the edit

1. Open **Editing**. It opens on the next show; use the show strip to pick another date.
2. Under **Recordings**, the files named after that show are ticked already, oldest first. Camera files get their camera: Left is **Camera L**, Center is **Camera M (two-shot)**, Right is **Camera R**. Other files are on **Auto**, and the editor works out what they are.
3. Check the list:
   - **Preview** plays a file in the page. Some TriCaster files only play in Safari.
   - Tick or untick files, and change a file's role if it's wrong. **Ignore** leaves a file out.
   - Files with EDITED in the name, the untitled `InFocus Show.mov` and copies of another show are never ticked.
4. To tell the editor something about this show, press **Add instructions** and type it, like "Use the later take of the open" or "Leave out the yearbook announcement". It follows these over the house rules, for this show only. To make something permanent, add it to the house rules in Settings. The same box has **Goes public** and **Time (Pacific)**: leave them on show day at 8:30 AM, or change them if this show goes public at another time. **Approve & schedule** and the 8:00 AM auto-schedule then use that time, and a redo keeps it.
5. Press **Start automatic editing**.

If **Start editing by itself** is on (Settings), you don't need to press anything: the edit starts once the show's files have sat unchanged in Drive for 10 minutes.

## 4. While it edits

**This show's edit** shows each step: downloading the recording, finding the takes, making fresh graphics, levelling the audio, rendering, checking the render and uploading to Drive. A normal show takes 12 to 15 minutes. **Cancel** stops it.

What it does:

- **Takes:** keeps the last clean read of each segment and cuts out restarts, stumbles and crew talk.
- **Cameras:** with three camera files, the open, throws and close are on the two-shot, and each announcement is on the side camera of the anchor reading it.
- **Graphics:** replaces anything the switcher burned in. Each announcement gets a fresh card on the set TV, short like past cards. The anchors get a dual third with their full names, and the Follow InFocus card goes in the close. The intro and outro come from the 2026 package.
- **Sound:** every segment peaks at -6 dB, and the anchors are evened out so one mic isn't louder than the other.
- **Checks:** before calling it done, it checks the render (every card in place, no old graphic showing, sound levels right).

## 5. Review it

When it's done, every producer gets one email and a notification that it's ready for review, along with the person who started it and that day's show manager (from the Master Calendar). If it fails, only the starter and the show manager hear.

On the Editing tab:

1. Watch the edit under **Review**. The chapters under the video (Intro, Welcome, each announcement, each package, Sign-off, Outro) jump straight to that part.
2. Read **Check these before scheduling** if it's there. These are things the editor wasn't sure about, like a name it guessed from what the anchors said.
3. Then choose:
   - **Approve & schedule:** schedules it on YouTube at 8:30 AM on show day (or the time picked with the instructions), with the usual title, description, thumbnail and season playlist. First tick **Goes public … That's the right date and time.**; the button stays off until you do. The line beside the button says exactly what it will do. The description lists the chapters with their times (YouTube turns them into chapters) and ends with the show's hashtags.
   - **Change details:** opens the Upload show form with the edit already in it, to change the title, time or playlist first.
   - **Send back:** type what to change under **What needs to change?** (timecodes help, like "At 1:12 the Math Club card is cut off") and press **Send back to the editor**. It fixes the same edit and replies with what it did, and you review the new version. Tick **Remember this for future shows** to make it a house rule.
   - **Redo automatic edit:** throws this edit away and starts over, with an optional note, like "use the later take of the close".

## 6. If nobody approves

- At 6 PM the evening before the show, if it isn't scheduled yet, the starter and the show manager get a reminder.
- After an hour with no answer, every producer gets an email and notification: **The <date> show still needs approval**. It repeats every hour (never between 2 and 6 AM) until someone approves, sends it back, redoes it or schedules it.
- At 8:00 AM on show day it's scheduled on YouTube by itself (at least 15 minutes out), and the starter and show manager are told.
- A send-back makes a new version, and the clock starts again.

## The editing Mac

The edits run on **PH-LAB-INFOCUS-M04**, a MacBook in the studio. Leave it plugged in and logged in as `student`. Locking the screen or closing the lid is fine: it never sleeps. With the logout/shutdown guard installed, the dedicated editor cancels normal logout, restart and shutdown requests while its service is running, including between shows. Maintenance requires stopping the editor service first. A weekday 6:00 PM shutdown on the Mac's power schedule still powers it off. The logout guard can delay that shutdown; it does not remove the schedule. The weekday 7:00 AM power-on stays. A forced shutdown, power loss, system crash or forced administrator restart can still take it offline; someone must log back in afterwards. Personal computers keep their normal logout and shutdown behavior.

**Machines** (`/editing?view=machines`) shows each editing Mac, whether it's online, its version and any problems. The Mac marked **Active** takes new edits. The buttons:

- **Run health check:** checks the Mac now and lists any problems.
- **Update now:** installs the newest version. It also updates itself.
- **Restart** and **Repair:** restart the editor, or reinstall anything missing.
- **Show log:** the latest lines of its log.
- **Keep awake always** / **Normal sleep:** never sleep (even with the lid closed), or back to normal.
- **Make active** and **Unlink:** switch which Mac edits, or remove one.

**Connect AI account:** the editor runs on a Claude, Codex (ChatGPT) or Grok subscription. Pick the Mac and the service, run the command it shows in Terminal on your own computer, and sign in there. The sign-in is sent to that Mac encrypted.

**Setting up a new Mac:** press **Download the setup app**, open it on the new Mac and follow the steps. It installs everything, then shows a code; approve it in the Portal.

## Settings

**Settings** (`/editing?view=settings`):

- **Start editing by itself:** starts each show's edit once its files are in Drive.
- **Schedule clean edits by themselves:** schedules an edit right away when nothing is flagged and every check passed. Flagged edits always wait for review.
- **Editor version:** leave empty to follow the newest version, or type one like `v0.3.1` to pin or roll back.
- **AI account order:** which subscription it tries first.
- **House rules:** decisions the editor follows instead of asking, like name spellings or which take to keep. Remembered send-backs are added here.

## When something goes wrong

- **The edit failed:** the reason is in **This show's edit**. Fix what it says, then **Redo automatic edit**. **Download debug log** has the full log to share when reporting a problem.
- **"The editing machine is offline":** check the studio Mac is on, plugged in and logged in. The edit starts when it's back.
- **"The MacBook is on battery":** plug it in. It won't take edits on battery.
- **"No AI account connected":** connect one under Machines → **Connect AI account**.
- **"An update needs admin approval":** on the studio Mac, open **InFocus Editor Setup**, press **Repair** and enter the admin password. This only happens when an update changes the admin helper.
- **Wrong files ticked, or a file missing:** tick or untick it under Recordings. If a new export isn't listed, wait 5 minutes for it to be renamed, then reload.
- **"No package is queued" or a package flag:** if the anchors throw to a package that isn't queued, the editor puts a placeholder slate there and flags it. Queue the package with its final cut in the **Publishing Queue**, then **Redo automatic edit**.
- **A name or card is wrong:** **Send back** with the right spelling or wording, and tick **Remember this for future shows** so it sticks.
- **The video won't play in the page:** try Safari.
