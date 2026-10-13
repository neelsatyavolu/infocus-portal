# Accounts and Admin

Route: `/admin`. Visible to executive producers, the adviser, and super admin.

## How someone gets in

On `/sign-in`, choose **Continue with Google** to use your registered Google account. You can also choose **Sign in with email**, enter your registered email address, and enter the six-digit code sent to your inbox. Use the same browser where you requested the code. Codes expire after 10 minutes and work once. Check spam if the email is missing. You can resend after one minute, up to five codes per hour. After five incorrect attempts, request a new code.

Email sign-in uses your existing Portal account and permissions. If your email does not have access, ask a producer to add you in Admin → People.

**Admin password sign-in** (a small link under the email form) is for the technical super admin only. Nobody else has a password, and one can't be set up in Portal; everyone else uses Google or an emailed code. It signs into the super admin's existing account. After 10 wrong tries in 15 minutes it locks for everyone until the 15 minutes pass; Google and email sign-in keep working.

Google and email sign-in keep you signed in on that browser for 30 days. One sign-in covers the Portal, grades, teleprompter, and equipment manage hosts. **Sign out** is at the bottom of the sidebar. The first time you sign in, Portal sends you to `/onboarding` (nickname and notification channels; see `notifications.md`).

**Add a person (preferred):** Admin → People → Full name + email → **Add person**. Optionally email them an invite (on by default). They sign in with that email address. No special paste syntax. The invite email is titled “You're invited to InFocus Portal”. Adding someone also sets up their InFocus Drive account.

**Access request:** The Google sign-in flow directs unregistered users to Access restricted (`/access-denied`) to request access. Users signing in with email who do not have an account should ask a producer to add them. Admins (executive producers and up) review **Access requests** on `/admin`. Pending requests are listed open, with **Approve** / **Deny** on each, and **Approve all** when more than one is waiting; past decisions sit under **Show N reviewed**. Approve creates their account and emails them a sign-in link. Deny also emails them. A request from an email that already has access is approved automatically.

Nicknames are the name shown around Portal (rosters, Groups, calendar, emails). Google's full name stays on the account separately. Edit the nickname on the same People list: type it in the person's row and press **Save** (it appears once you change something).

**Remove** deletes their Portal user, drops any producer role and any approved access request, and removes their InFocus Drive account, so they cannot sign back in until someone adds them again. Work they created stays; the author shows as a deleted user. You cannot remove yourself. Use **Search people** to find someone.

Super admin / adviser can also ask the Portal assistant to add a person or set a nickname; those still need an **Approve** on the chat card.

## People vs other lists

| List | Purpose |
|---|---|
| Admin → People | Who may sign in |
| Members (`/members`) | Producer notes on class members |
| Package Cycle | Who is on which package |
| Producer Team (Admin) | Associate / executive / adviser roles |

People and “registered users” are the same list. Do not add a second account table.

## Producer Team

Pick a person already in People, then choose Associate Producer, Executive Producer, or Adviser. Associate producers are not assigned a News / Feature / Commentary category. Only super admin and the adviser can assign roles.

## Other Admin controls

The Admin page lists its sections down the left on wide screens (a strip across the top on phones): Overview, Access requests, People, Producer Team, Package Cycles, Configuration, and, for super admin and the adviser, Integrations, Backups, and Danger zone.

- **Overview** (users, workspaces, media, storage, comments, active share links) loads in the background. People, access requests, and producer roles show first.
- **Package Cycles → Cycles per semester** — how many cycles exist, 1 to 8 (also editable on `/package-cycles`). It sets the progress sheet, cycle tabs, and the most points in the packages grade category. Executive producers and up can save it.
- **Configuration** — the school year and calendar the whole Portal follows. Executive producers, the adviser, and super admin can change it; nothing here needs a developer.
  - **School years** — for each year: first day of school, first show, and last day of school. Shows run Wednesday and Friday from the first show to the last day, PA runs on Mondays, and nothing is scheduled over the summer. **Add a school year** starts a new one with last year's dates moved forward 52 weeks; set the real dates and **Save school years**. A year marked **Read from Paly's calendar** was added automatically; check its dates and save to confirm it. If nobody adds next year, the Portal assumes the same dates a year later until someone does.
  - **Paly's calendar** — once a day the Portal reads Paly's bell schedule for finals days and for a new school year. The row shows when it last checked, the finals days it found, and any problem. **Sync now** runs the check right away.
  - **Days off and special days** — add each no-school day for the year (date, what happens, optional name). The choices are **No school**, **No PA or show**, **PA day**, and **Show day**. A day set here always wins over the automatic calendar, so this is also how to air a show in a finals week or on another weekday. The list shows every upcoming day that differs from the usual week and where it came from (**Built in**, **Set by hand**, **From Paly's calendar**, **From the school year**). **Remove** is offered on days set by hand; the day then follows the automatic calendar again. Paly's calendar does not list holidays reliably, so those must be added here each year.
- **Package Cycles → Class Board cycle** — which cycle `/class-board` shows. **Current cycle (automatic)** is the default; executive producers and above can pin any cycle.
- **Integrations → YouTube channel** — whether the InFocus YouTube channel is connected for show and package uploads. Super admin and adviser only. If it says the authorization expired (uploads are paused), press **Reconnect YouTube**, choose the **InFocus channel** in Google's sign-in, and allow every permission. Signing in with any other channel is refused. You return to Admin with a confirmation.
- **Integrations → Google Calendar** — the InFocus Google account that sends Meetings calendar invites as Google Calendar events. Super admin and adviser only. Press **Connect Google Calendar** (or Reconnect), sign in as the InFocus Google account, and allow calendar access. It also shows if the last sync with Google failed. Separate from the YouTube channel. See `meetings.md`.
- **Backups** — hourly copies of Portal database data (people, packages, grades, calendar, equipment). Super admin and adviser only. **Backup now** queues an extra copy; refresh in a minute to see it. The three newest show first (**Show N more** for the rest). Download from Admin. Kept 7 days. Not InFocus Drive videos. Restore is download + `psql` into an empty database after `prisma migrate deploy` — there is no restore button.
- **Danger zone** — **Reset all cycles** wipes every package grade, grade history, and Package Cycle roster row, and clears each cycle's focus and stage dates. Type `RESET CYCLES` to confirm. Super admin / adviser only. Projects are not deleted. It cannot be undone.

## View as

Super admin and the adviser (the env accounts) can click their name in the sidebar, search by name or email, and view Portal as any user. Portal opens `/grades` as that person. What you do while viewing counts as that person. View as ends after 12 hours, or press **Stop** in the same dialog. Limited View as grants (env `VIEW_AS_LIMITED_ACTORS`, format `actor=target|target;actor2=target`) let a named account View as only the listed accounts.
