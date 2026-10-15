# Accounts and Admin

Route: `/admin` (**Admin Dashboard**, pinned at the bottom of the sidebar). Visible to executive producers, the adviser, and super admin.

## How someone gets in

On `/sign-in`, choose **Continue with Google** to use your registered Google account. You can also choose **Sign in with email**, enter your registered email address, and enter the six-digit code sent to your inbox. Use the same browser where you requested the code. Codes expire after 10 minutes and work once. Check spam if the email is missing. You can resend after one minute (the button counts down, for example **Resend in 0:42**, then reads **Resend code**), up to five codes per hour. After five incorrect attempts, request a new code. While you wait for a code, **Continue with Google** stays below the code box, and **Use a different email** goes back to the email box with your address still typed.

Email sign-in uses your existing Portal account and permissions. If your email does not have access, ask a producer to add you in Admin → People.

**Admin password sign-in** (a small link at the bottom of the sign-in box; **Back to sign-in options** closes it) is for the technical super admin only. Nobody else has a password, and one can't be set up in Portal; everyone else uses Google or an emailed code. It signs into the super admin's existing account. After 10 wrong tries in 15 minutes it locks for everyone until the 15 minutes pass; Google and email sign-in keep working.

Google and email sign-in keep you signed in on that browser for 30 days. One sign-in covers the Portal, grades, teleprompter, and equipment manage hosts. **Sign out** is in the account menu (your picture at the top right). The first time you sign in, Portal sends you to `/onboarding` (nickname and notification channels; see `notifications.md`).

**Add a person (preferred):** on Admin's **Overview** or **People** tab, press **Add person** in the page header, enter Full name + email, and press **Add person** in the dialog. Optionally email them an invite (on by default). They sign in with that email address. The invite email is titled “You're invited to InFocus Portal”. Adding someone also sets up their InFocus Drive account.

**Access request:** The Google sign-in flow directs unregistered users to Access restricted (`/access-denied`) to request access. That page shows the email (and name) the request will use; press **Request access**, and a **Requested** tag confirms it was sent. Users signing in with email who do not have an account should ask a producer to add them. Admins (executive producers and up) review **Access requests** on `/admin` (the **Overview** tab). The Overview tab and the **Admin Dashboard** sidebar link show how many are waiting. Pending requests are listed open, with **Approve** / **Deny** on each, and **Approve all** when more than one is waiting; past decisions sit under **Show N reviewed**. Approve creates their account and emails them a sign-in link. Deny also emails them. A request from an email that already has access is approved automatically.

Nicknames are the name shown around Portal (rosters, Groups, calendar, emails). Google's full name stays on the account separately. Edit the nickname on the same People list (Admin's **People** tab): type it in the person's row and press **Save** (it appears inside the field once you change something) or Enter; Esc undoes the change.

**Remove** (the trash icon at the end of a person's row, then **Delete** to confirm) deletes their Portal user, drops any producer role and any approved access request, and removes their InFocus Drive account, so they cannot sign back in until someone adds them again. Work they created stays; the author shows as a deleted user. You cannot remove yourself. Use **Search people** to find someone (press `/` to jump to it). On phones the list shows the first 25 people; **Show N more** shows the rest.

Super admin / adviser can also ask the Portal assistant to add a person or set a nickname; those still need an **Approve** on the chat card.

## People vs other lists

| List | Purpose |
|---|---|
| Admin → People | Who may sign in |
| Members (`/members`) | Producer notes on class members |
| Package Cycle | Who is on which package |
| Admin → People → Producer Team | Associate / executive / adviser roles |

People and “registered users” are the same list. Do not add a second account table.

## Producer Team

Producer Team sits on Admin's **People** tab, beside the People list (below it on narrow screens). Pick a person already in People, then choose Associate Producer, Executive Producer, or Adviser, and press **Save role**. To change someone's role, pick them and save the new one. The team is listed by role (Advisers, Executive producers, Associate producers). Associate producers are not assigned a News / Feature / Commentary category. Only super admin and the adviser can assign roles.

## Other Admin controls

Admin has tabs across the top: **Overview**, **People**, **School year**, and, for super admin and the adviser, **System**. It reopens the tab you used last on that browser. Old links to a section (for example `/admin#backups` or `/admin#configuration`) still open the right tab and scroll to it. The Overview tab shows how many access requests are waiting, and a tab with something broken shows a warning icon. On every tab but Overview, the line under the title lists what needs attention (access requests waiting, YouTube uploads paused, Google Calendar not connected or its sync failed, the last backup failed, Paly's calendar check failed), each a link to where it is fixed; past two items, **+N more** opens Overview.

**Overview**

- **Status**: one tile each for the YouTube channel, Google Calendar, Backups, and Paly's calendar: a tag saying whether it works, and (except on phones) a short detail. Press a tile to open the section where it is fixed. Executive producers see only Paly's calendar.
- **Access requests**: the queue described above.
- **Platform totals** (users, workspaces, media, storage, comments, active share links) load in the background; the rest of Admin shows first.

**People**: the People list and the Producer Team (above).

**School year**

- **Package Cycles → Cycles per semester**: how many cycles exist, 1 to 8 (also editable on `/package-cycles`). It sets the progress sheet, cycle tabs, and the most points in the packages grade category. Executive producers and up can save it.
- **Package Cycles → Class Board cycle**: which cycle `/class-board` shows. **Current cycle (automatic)** is the default; executive producers and above can pin any cycle. It saves as soon as you pick one (**Saved** shows beside it).
- **School calendar**: the school year and calendar the whole Portal follows. Executive producers, the adviser, and super admin can change it; nothing here needs a developer.
  - **Paly's calendar**: once a day the Portal reads Paly's bell schedule for finals days and for a new school year. The School calendar heading has a tag for how the last check went, and below it when it last checked, the finals days it found, and any problem. **Sync now** beside it runs the check right away.
  - **School years**: each year's first day of school, first show, and last day of school. Shows run Wednesday and Friday from the first show to the last day, PA runs on Mondays, and nothing is scheduled over the summer. **Add a school year** starts a new one with last year's dates moved forward 52 weeks; set the real dates and **Save school years** (**Unsaved changes** shows until you do). A year tagged **From Paly's calendar** was added automatically, and the panel shows **Check dates** until it is confirmed; check its dates and save to confirm it. If nobody adds next year, the Portal assumes the same dates a year later until someone does.
  - **Days off and special days**: add each no-school day for the year (date, what happens, optional name) and press **Save day**. The choices are **No school**, **No PA or show**, **PA day**, and **Show day**. A day set here always wins over the automatic calendar, so this is also how to air a show in a finals week or on another weekday. The list shows every upcoming day that differs from the usual week and where it came from (**Built in**, **Set by hand**, **From Paly's calendar**, **From the school year**). **Remove** (a trash icon at the end of the row) is offered on days set by hand; the day then follows the automatic calendar again. Paly's calendar does not list holidays reliably, so those must be added here each year.

**System** (super admin and adviser only)

- **Integrations → YouTube channel**: whether the InFocus YouTube channel is connected for show and package uploads. Super admin and adviser only. If it says the authorization expired (uploads are paused), press **Reconnect YouTube**, choose the **InFocus channel** in Google's sign-in, and allow every permission. Signing in with any other channel is refused. You return to Admin's **System** tab with a confirmation.
- **Integrations → Google Calendar**: the InFocus Google account that sends Meetings calendar invites as Google Calendar events. Super admin and adviser only. Press **Connect Google Calendar** (or Reconnect), sign in as the InFocus Google account, and allow calendar access. It also shows if the last sync with Google failed. Separate from the YouTube channel. See `meetings.md`.
- **Backups**: hourly copies of Portal database data (people, packages, grades, calendar, equipment). Super admin and adviser only. The heading has a tag for how the latest backup went, and a **Last run** line gives its time and size, or why it failed. **Backup now** queues an extra copy; refresh in a minute to see it. The three newest show first (**Show N more** for the rest). Download from Admin. Kept 7 days. Not InFocus Drive videos. Restore is download + `psql` into an empty database after `prisma migrate deploy`; there is no restore button.
- **Danger zone**: **Reset all cycles** wipes every package grade, grade history, and Package Cycle roster row, and clears each cycle's focus and stage dates. Type `RESET CYCLES` to confirm. Super admin / adviser only. Projects are not deleted. It cannot be undone.

## View as

Super admin and the adviser (the env accounts) can open the account menu (their picture at the top right) and choose **View as…**, search by name or email, and view Portal as any user. Portal opens `/grades` as that person. What you do while viewing counts as that person. While viewing, your picture in the top bar gets an amber ring and a notice at the top of the page has **Switch user** and **Stop viewing**. View as ends after 12 hours, or press **Stop** in the same dialog. Limited View as grants (env `VIEW_AS_LIMITED_ACTORS`, format `actor=target|target;actor2=target`) let a named account View as only the listed accounts.
