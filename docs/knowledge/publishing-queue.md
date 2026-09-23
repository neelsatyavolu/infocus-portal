# Publishing Queue

Route: `/publishing-queue`. Producer-only.

A Final Cut upload does **not** auto-queue. A producer clicks **Send to queue**.

**Auto-assign** fills the next upcoming show that currently has no package.

Producers can **drag** a package onto a show. Max **2** packages per show. Auto-assign never stacks two on the same show.

After a show day has passed, that date leaves the live queue. **Past shows** opens those air dates (newest first) and their packages. Producers can still move, download, or remove them.

Queue cards keep the video title and thumbnail above the YouTube status, air-date selector, and action buttons. Controls wrap on narrow screens, including in **Past shows**.

**Add package** can queue a custom titled video (cycle 0, not a roster group).

## YouTube and website managers

**Managers** lets producers appoint registered members as website managers. Managers receive an email when a package is ready on YouTube, with its title, air date, watch link, and embed code. The email also opens a package page with video playback and **Copy embed code**. This assignment does not grant producer permissions or access to Groups.

When YouTube publishing is configured, queued packages upload automatically as **unlisted** on their assigned air date (Pacific time; default start is midnight). Uploading and YouTube processing take time. Emails are sent only after the video is processed, unlisted, and embeddable. Queue cards show publication status and errors; published packages remain accessible from **Past shows**.

Only dates on or after the configured activation date are eligible. Failed transfers retry using the same upload session. Each package publishes once, using the Final Cut version selected when its upload begins. Replacing a Final Cut or moving an already published package does not create another YouTube video. Removing a queued package pauses an unfinished upload; it does not delete an existing YouTube video. Changing the air date during upload requires an operator to reconcile the upload before resuming.

Emails go to the managers assigned when the video becomes ready. Adding a manager later does not resend old notifications. A publication with no managers still publishes, but sends no emails. Managers use the email's package link; the full queue remains producer-only.

Removing a manager also cancels any still-pending emails to them. Already delivered emails and their unlisted YouTube links cannot be recalled.

If the queue says automatic publishing is not configured, an administrator must complete [YouTube setup](../YOUTUBE-PUBLISHING.md). An expired upload session or uncertain email delivery needs administrator reconciliation to avoid duplicates.
