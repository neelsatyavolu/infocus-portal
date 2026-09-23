# Accounts and Admin

Route: `/admin`. Visible to executive producers, the adviser, and super admin.

## How someone gets in

On `/sign-in`, choose **Continue with Google** to use your registered Google account. You can also choose **Sign in with email**, enter your registered email address, and enter the six-digit code sent to your inbox. Use the same browser where you requested the code. Codes expire after 10 minutes and work once. Check spam if the email is missing. You can resend after one minute, up to five codes per hour. After five incorrect attempts, request a new code.

Email sign-in uses your existing Portal account and permissions. If your email does not have access, ask a producer to add you in Admin → People.

**Add a person (preferred):** Admin → People → Full name + email → **Add person**. Optionally email them an invite (on by default). They sign in with that email address. No special paste syntax.

**Access request:** The Google sign-in flow directs unregistered users to Access restricted (`/access-denied`) to request access. Users signing in with email who do not have an account should ask a producer to add them. Admins review Access Requests on `/admin` (approve all, or one by one). Approve emails them a sign-in link and creates their account.

Nicknames are the name shown around Portal (rosters, Groups, calendar, emails). Google's full name stays on the account separately. Edit the nickname on the same People list.

**Remove** deletes their Portal user. Work they created stays; the author shows as a deleted user.

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

- **Usage cards** (users, workspaces, media, storage) load in the background. People, access requests, and producer roles show first.
- **Package cycles per semester** — how many cycles exist (also editable on `/package-cycles`).
- **Backups** — hourly copies of Portal database data (people, packages, grades, calendar, equipment). Super admin and adviser only. Download from Admin. Kept 7 days. Not InFocus Drive videos. Restore is download + `psql` into an empty database after `prisma migrate deploy` — there is no restore button.
- **Danger zone** — wipe package grades, history, and progress for cycles 1–4. Type `RESET CYCLES`. Super admin / adviser only. Projects are not deleted.

## View as

Super admin can click their name in the sidebar and view Portal as any user. Limited View as grants (env `VIEW_AS_LIMITED_ACTORS`, format `actor=target|target;actor2=target`) let a named account View as only the listed accounts.
