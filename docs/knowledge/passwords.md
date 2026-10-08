# Passwords

Route: `/passwords`. Associate producers, executive producers, advisers, and super admins. Open it from the **key icon** at the bottom of the sidebar, next to sign out. Students only see it once an exec shares a login with them (see Sharing). View as a student hides it. Opening `/passwords` without access shows Access restricted.

A shared vault for InFocus logins (YouTube, Instagram, school accounts, and so on). **Search passwords…** filters the list. Each row has copy buttons for the username, password, and current 2FA code, and a link to the website.

## What each entry holds

- Name and website (entries with "WiFi" in the name show a Wi-Fi icon; entries with a website show that site's icon; others show the first letter)
- Username or email
- Password (hidden until you click the eye or copy button). When adding or changing one, a strength bar rates it and **Suggest strong password** fills in a random 20-character password.
- 2FA: paste the site's setup key or `otpauth://` link once. Portal then shows the current 6-digit code with a countdown. The setup key itself cannot be viewed again, only replaced or removed.
- Notes (recovery codes, security answers, who owns the account)

Revealed passwords and notes hide again after 30 seconds.

## Import from 1Password

**Import from 1Password** takes a `.1pux` or `.csv` export (1Password → File → Export). The file is read in your browser; tick the logins you want and only those are uploaded. Items that look already saved (same name and username) start unticked. Archived and deleted items are skipped. If a website or 2FA key in the export can't be used, that part is skipped and the import message says which.

## Sharing with people outside the vault

Executive producers, advisers, and super admins see a **people icon** on each login. It opens **Share**: pick anyone with a Portal account who isn't a producer (producers already see every login), then **Save**. The icon turns green while a login is shared.

People a login is shared with get the key icon in their sidebar. Their Passwords page (**Shared with you**) lists only the logins shared with them. They can copy the username, password, and 2FA code and open the website. They can't see notes, add, edit, delete, import, or share. Their views are logged like everyone else's. Removing someone from Share takes the login away at once; with nothing left shared, the page shows Access restricted.

Changing who a login is shared with is logged as **Changed sharing**. Deleting a login also removes its shares.

## Security

- Usernames, passwords, 2FA keys, and notes are encrypted (AES-256-GCM) before they reach the database, so database backups don't contain readable passwords.
- Every add, import, edit, delete, and every password, notes, or 2FA-code view is logged. The edit dialog shows recent activity for that entry.
- Anyone with access can add and edit. Delete is limited to whoever added the entry, plus executive producers, advisers, and super admins.

The Portal assistant cannot read the vault.
