# Announcements

One **Announcements** link in the sidebar opens three tabs at the top of the page: **Announcements** (the class feed), **Submitted**, and **PA**.

## Class feed (`/announcements`)

Posts from the class Slack #announcements channel, grouped by day, for signed-in Portal users. Each post links to Slack (the arrow right after the post's time), and attached files open through the Portal. Slack posts do not send Portal email or push notifications.

Posts that arrived since your last visit carry a **New** tag (remembered per browser; the first visit shows none). On wide screens a **Days** list beside the feed jumps to any day, folded by month. If Slack can't be reached, the error shows at the top and the last posts the Portal loaded stay below it.

## Submit (`/submit-announcement`)

Public form (no Portal login). Anyone can request an InFocus announcement / Friday Schoology update. Members review before it airs. The public InFocus iPhone app has the same form (More → Submit an announcement, or the card on Home); its requests land in the same inbox.

The form asks for email, full name, who you are (Paly student, PAUSD employee, parent/guardian, or community member), where it should run (**InFocus only**, **Schoology Update only**, or **Both**), the announcement text, start and end dates, an optional Google Drive media link, and notes. You must agree to the announcement policy. An announcement can run for at most **four consecutive show days**. InFocus may accept, reject, or edit it for grammar, clarity, and unprotected speech.

The form has four numbered sections: **About you**, **Announcement**, **When it runs**, and **Submit**. A **How it works** panel (where announcements run and the Schoology deadline) sits beside the form on wide screens and above it on phones. The announcement box shows a character count (up to 4,000 characters), and **⌘Enter** (Mac) or **Ctrl+Enter** in that box submits the form.

## Submitted (`/announcements/submitted`)

Inbox of those requests, open to everyone signed in. Sections: **Permanent**, **Air today**, **Air tomorrow**, **Upcoming**, **Schoology only**, **Ended** (collapsed; click its title to open it), and **Other**. Copy one announcement or a whole section (**Copy all**). **Submit** opens the public form. The header shows how many there are in all, how many air today and tomorrow (permanent ones count on show days), and when the list was last updated.

The chips under the header (each with its count) show one section at a time; the choice is remembered for that browser tab and falls back to **All** when the section is empty. The round-arrow button refreshes the list. On phones, **College Visits** and **Invite** are in the **⋯** menu.

The scholarship resource notice is for **both InFocus and Schoology** and appears in **Permanent** with no expiration and is eligible for PA and teleprompter scripts (dated announcements take priority when slots are limited). Producers (associate producer and up, including the adviser) can **Delete** a submission after confirming (Delete is greyed out while the list refreshes). Deleted submissions disappear from the inbox, shared view, and future script selection, including Google Sheet imports; existing saved scripts are unchanged.

Executive producers and super admin can **Invite** extra viewers: a link that lasts 30 days or 1 year, copied or emailed to up to 20 addresses (only the first 20 are used). The new link also shows in a read-only **Share link** box in the dialog. The link opens a read-only view (`/announcements/shared`, marked **Read-only**) without signing in; if the link is invalid or expired, the page says to ask the producer who sent it for a new link. **College Visits** (left of Invite) opens the college-visit Google Sheet in a new tab.

## PA (`/announcements/pa`)

Open **Announcements → PA** for the current or next PA script. PA runs at the start of second period on Mondays (start of fifth period on Monday, September 28, 2026, which runs the Friday 5–7 bell schedule), skipping school holidays and finals weeks and respecting Master Calendar schedule overrides. Monday's script stays current all day in Pacific time; the page advances the next day.

Summer Mondays do not generate scripts: the school years in Admin → School year → School calendar mark summer weekdays off, and the page then shows the first PA Monday of the next year (it looks up to 120 days ahead).

When the college-visit sheet supplies a bulletin, it replaces submitted college-visit lists, including lists labeled “college rep visits” or “college representative visits.” This prevents those older lists from appearing alongside the current sheet visits. Existing saved scripts keep their copy until an editor regenerates them.

The script follows the PA opening, alternating announcement slots, and closing. The date and the two assigned announcers' full registered names fill automatically from Master Calendar. Missing assignments show name placeholders. When an assigned announcer or producer opens an untouched script, announcements for the PA date auto-fill using the show teleprompter’s selection and Gemini broadcast formatting, including its college-visit source. Announcements alternate between the two speakers. Review the generated wording before reading. If Gemini is unavailable, original wording is used with a warning; if no announcements are available, placeholders remain and Refresh can retry. Scripts with edits are never automatically replaced. Assigned announcers and producers can use **Regenerate** to fetch and format announcements again. Confirming replaces the entire shared script (including custom opening/closing and unsaved edits) and saves it with the current assigned names. If no announcements load, the existing script and draft are kept. Concurrent saves are protected by the same version check as Save.

Everyone signed in can read the script. Assigned announcers and producers (including the adviser) can edit and **Save**. Refresh picks up calendar assignment changes and others' saved edits. Generated name lines update without replacing announcement copy or custom introductions. If an assigned calendar name is ambiguous, a producer should select the person's unique name on Master Calendar before that person can edit.

The page header shows the PA date and reading time; on phones, tablets and small laptops it also says who is on the mic, ending with a **Master Calendar** link (wide screens show the **On the mic** panel beside the script instead). **Regenerate** and Refresh sit in the script's header next to its status (Saved, Unsaved changes, Couldn't regenerate…). A short note explains the auto-fill and links to **Open Submitted**: in an **Announcements to read** panel beside the script on wide screens, under the script elsewhere. Editors get a save bar that stays at the bottom of the screen while they scroll the script, and **⌘S** (Mac) or **Ctrl+S** saves too. A failed save or regenerate shows its reason in that bar, beside **Save**.

Save before leaving the page. Refresh (the round-arrow button in the script's header) is disabled while you have unsaved changes (point at it to see why); **Discard changes** lets you reload. Following a Portal link (a tab or the sidebar) with unsaved changes asks first: **Keep editing** or **Discard and leave**. **Master Calendar** and **Open Submitted** open in a new tab, so your draft stays open. If another person saved first, your save is rejected and your draft stays in the editor. Copy your draft before discarding and refreshing, then merge your changes into the latest script.

## In the iPhone app

The InFocus Portal iPhone app shows the same #announcements feed (`GET /api/announcements/slack`), Submitted grouped exactly like the web page (`GET /api/announcements/submitted/grouped`: same sections, copy text, delete for producers, invite links for executives), and the PA script editor (same `/api/announcements/pa`, which also returns the reading time).
