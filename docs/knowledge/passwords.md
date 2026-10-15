# Passwords

Route: `/passwords`. Associate producers, executive producers, advisers, and super admins. Open it from **Passwords** in the account menu (the button with your picture or initials at the top right). Students only see it once an exec shares a login with them (see Sharing). View as a student hides it. Opening `/passwords` without access shows Access restricted.

A shared vault for InFocus logins (YouTube, Instagram, school accounts, and so on). **Search passwords…** sits at the top of the list and matches a login's name, website, or username; press **/** to jump to it and **Esc** to clear it. The count under it shows how many logins there are and how many have 2FA (while you search, how many match). Each login in the list shows its username and website, a shield mark when it has a 2FA code, and (for people who can share) a green tag with a people icon and a number when it's shared (hover it for "Shared with N").

Pick a login to see its details: the website link, then rows for the username (copy), password (show and copy), 2FA code (**Show code**, then copy), and, for producers, notes (show). On a wide screen the list is on the left and the picked login on the right, with **Share** and **Edit** at the top of the details; the first login in the list is picked for you (nothing is shown or logged until you press a button). There, ↑/↓ in the search box or the list move through logins and Enter jumps to the copy buttons. On a phone or narrow window, tap a login to open it in place, with **Share** and **Edit** at the top; tap it again or press Esc to close it, and ↑/↓ move between logins. Only one login's details are open at a time.

Executive producers, advisers, and super admins also get **All** and **Shared** chips under the search box (with counts), with the 2FA count at the end of that row. **Shared** shows only logins shared with someone outside the vault. The page remembers the chip in this browser.

## What each entry holds

- Name and website (entries with "WiFi" in the name show a Wi-Fi icon; entries with a website show that site's icon; others show the first letter)
- Username or email
- Password (hidden until you click the eye; copying it doesn't show it). When adding or changing one, a strength bar rates it and **Suggest strong password** fills in a random 20-character password.
- 2FA: paste the site's setup key or `otpauth://` link once. Portal then shows the current 6-digit code with a countdown. The setup key itself cannot be viewed again, only replaced or removed.
- Notes (recovery codes, security answers, who owns the account)

Revealed passwords and notes hide again after 30 seconds, and when you switch logins, close a login, or save a change.

**Add password** (in the page header) and **Edit** (in a login's details) open the same form. Enter (in a one-line field) or ⌘/Ctrl+Enter saves. **Delete** is at the bottom of the Edit form; press it again (**Delete permanently**) to confirm.

## Import from 1Password

**Import from 1Password** (in the page header; just **Import** on a phone) takes a `.1pux` or `.csv` export (1Password → File → Export). The file is read in your browser; tick the logins you want and only those are uploaded. Items that look already saved (same name and username) start unticked. Archived and deleted items are skipped. If a website or 2FA key in the export can't be used, that part is skipped and the import message says which.

## Sharing with people outside the vault

Executive producers, advisers, and super admins see a **Share** button in a login's details, next to **Edit**. It opens **Share**: pick anyone with a Portal account who isn't a producer (producers already see every login), then **Save**. While a login is shared, a green tag with a people icon and the number of people shows on it in the list, and **Shared with N** in its details.

People a login is shared with get **Passwords** in their account menu. Their Passwords page (**Shared with you**) shows a search box and one card per login shared with them. They can copy the username, password, and 2FA code and open the website. They can't see notes, add, edit, delete, import, or share. Their views are logged like everyone else's. Removing someone from Share takes the login away at once; with nothing left shared, the page shows Access restricted.

Changing who a login is shared with is logged as **Changed sharing**. Deleting a login also removes its shares.

## Security

- Usernames, passwords, 2FA keys, and notes are encrypted (AES-256-GCM) before they reach the database, so database backups don't contain readable passwords.
- Every add, import, edit, delete, and every password, notes, or 2FA-code view is logged. Producers see **Recent activity** for a login in its details: beside the fields when the window is wide enough (the latest 8, with **Show all** for the rest), otherwise under them behind a **Recent activity** toggle (the page remembers whether it's open). The details also say when the login was last saved and by whom.
- Anyone with access can add and edit. Delete is limited to whoever added the entry, plus executive producers, advisers, and super admins.

The Portal assistant cannot read the vault.
