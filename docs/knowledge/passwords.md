# Passwords

Route: `/passwords`. Associate producers, executive producers, advisers, and super admins. Open it from the **key icon** at the bottom of the sidebar, next to sign out. Students never see it, and View as a student hides it.

A shared vault for InFocus logins (YouTube, Instagram, school accounts, and so on).

## What each entry holds

- Name and website (entries with "WiFi" in the name show a Wi-Fi icon; entries with a website show that site's icon; others show the first letter)
- Username or email
- Password (hidden until you click the eye or copy button). When adding or changing one, a strength bar rates it and **Suggest strong password** fills in a random 20-character password.
- 2FA: paste the site's setup key or `otpauth://` link once. Portal then shows the current 6-digit code with a countdown. The setup key itself cannot be viewed again, only replaced or removed.
- Notes (recovery codes, security answers, who owns the account)

Revealed passwords and notes hide again after 30 seconds.

## Import from 1Password

**Import from 1Password** takes a `.1pux` or `.csv` export (1Password → File → Export). The file is read in your browser; tick the logins you want and only those are uploaded. Items that look already saved (same name and username) start unticked. Archived and deleted items are skipped. If a website or 2FA key in the export can't be used, that part is skipped and the import message says which.

## Security

- Usernames, passwords, 2FA keys, and notes are encrypted (AES-256-GCM) before they reach the database, so database backups don't contain readable passwords.
- Every add, import, edit, delete, and every password, notes, or 2FA-code view is logged. The edit dialog shows recent activity for that entry.
- Anyone with access can add and edit. Delete is limited to whoever added the entry, plus executive producers, advisers, and super admins.

The Portal assistant cannot read the vault.
