# Publishing Queue

Route: `/publishing-queue`. Producers manage it; they open it as the **Publishing Queue** tab under **The Show**. Appointed website managers can open it read-only (also from **Managers → Website**).

A Final Cut upload does **not** auto-queue. A producer clicks **Send to queue** in the decision bar at the top of the package's Final Cut tab (`/groups/<package>/final-cut`). The same button reads **Remove from queue** once it is queued. The Final Cut stage in the group's stage bar then reads **QUEUED**, with **Airs** and the show date on a wide screen.

**Auto-assign** fills the next upcoming show that currently has no package. It skips **special shows** (a show day with a calendar name, like "Spirit Week Day 1 Recap"). Their names appear under the date, with a star. Producers can still drag a package onto one.

**Hold** (EP, adviser, super admin): each upcoming show has a **Hold** button. Hold a show you will air without its file yet (a recap, say): give it a name (default "Recap") and it becomes a special show, so auto-assign skips it, and the name also appears on the master calendar. Packages already on it stay. Drag the package (or a custom upload) onto it once you have the file. **Release** on a special show clears its calendar name, so auto-assign can fill it again. It is the same calendar name as Admin → Calendar days.

Producers can **drag** a package onto a show (by its thumbnail or title, on a computer). Max **2** packages per show. Auto-assign never stacks two on the same show. Each show shows its count (for example `1/2`).

The header has **Managers** (producers), **Past shows**, and **Add package** (producers). After a show day has passed, that date leaves the live queue. **Past shows** opens those air dates (newest first) and their packages. Producers can still move, publish, download, or remove them there.

Summary tiles sit under the header. Click one to jump to what it counts:

- **Next show:** the next show day and how many packages it has. An **Empty** tag (producers) means a regular show still needs a package.
- **Open shows** (producers): regular show days with no package yet, special shows still open, and packages without a show.
- **Projected overflow** (producers): how many packages this school year will make that no show day is left to air by the last day of school. It assumes one package per show. The year's total is the average package count of finished cycles times the year's cycles (two semesters of cycles), counting finished cycles at their real size. Packages already aired come off, and custom packages still queued are added. Show days left exclude special (named or held) shows and 2 more per semester for shows that end up airing no package; held shows count toward those 2. Hover the line under the number for the average and the year's total. The tile only counts; it doesn't jump anywhere.
- **YouTube** (**On YouTube** for website managers): how many packages are on YouTube and how many are uploading or processing. When an upload failed, producers see how many failed instead (for example **1 failed**); clicking jumps to the first one, opening **Past shows** when it is there. It says **Not set up** when YouTube publishing is not configured.

**Upcoming shows** lists every show day: the date (with a **Today** or **Next** tag on the first), its count, and its packages. An empty show reads **Drop a package here** (producers) or **No package yet**, and a show with one package has a **Room for one more** slot (producers). On a phone, an empty show is one line with an **Open** tag (**Empty** for producers on a regular show). Packages with no show are listed above it under **No show assigned**.

Each package row shows the thumbnail, the topic (producers: it opens the package's Final Cut page, except on custom packages), the Final Cut headline when the students gave one, the cycle and members (**Custom** for a custom package), and a YouTube status tag (**Pending**, **Uploading**, **Processing**, **On YouTube**, **Failed**). A package queued before its Final Cut is uploaded also shows a **No final cut** tag, and has no Publish or Download until the file is in; the show editor and YouTube skip it until then. A failed upload also shows its full error. Each row's **⋯** menu (producers) has:

- **Move to another show…:** pick a show from the list (the keyboard and phone way to drag). Full shows are greyed out; the current one is marked.
- **Publish to YouTube** (when YouTube publishing is configured, until the upload starts): after a confirmation, uploads the package now as unlisted instead of waiting for its air date.
- **Download final cut:** downloads the Final Cut file.
- **Open package page:** opens `/publishing-queue/<package>` with its YouTube status tag and air date and, once published, the video, the date it was published, **Watch on YouTube**, and the embed code with **Copy embed code**. **Back to Publishing Queue** returns to the queue.
- **Remove from queue:** takes the package off the queue.

**Add package** has two tabs. **Packages** lists packages that are not queued yet, including ones with no Final Cut yet (tagged **No final cut**; one holds its show until the file is uploaded) (with a filter when the list is long); click **Add** on one, and the dialog stays open so you can add several. **Upload a video** queues any video with a title you type (cycle 0, not a roster group): click **Choose video**, then **Add custom package**. The file uploads to InFocus Drive. Each one lands on the next empty show, and a message names that show.

The Master Calendar and The Show list each show's queued packages.

## YouTube and website managers

The **Managers** button (producers) lets producers appoint registered users as website managers, or remove them. When a package is ready on YouTube, the Portal posts it to infocusnews.tv by itself: the headline, the package members (plus any reporter the toss names who isn't on the roster) as the story's writers, the video in the story's Video/Embed box, YouTube's full-size thumbnail as the featured image (hidden on the story page; the Portal waits up to two hours after the video goes up for YouTube to make it, then settles for the smaller one), a category the Portal picks with AI, and a publish time of 9:05 AM on the show date (right away if that has passed). Managers then get a **Scheduled** email with the publish time and a link to review the story in WordPress, where they can change the category or anything else. If the Portal can't post it, or posting isn't set up, managers instead receive an email with its title, air date, watch link, and embed code to post it by hand. The email also opens a package page with video playback and **Copy embed code**. Website managers can also open the queue **read-only** (a **Read only** tag sits in the header): they see which packages air on each show (including **Past shows**) and a **Recently on YouTube** list, and click any package row to open its page. They cannot add, move, download, or remove packages, see unqueued packages, or manage the manager list. This assignment does not grant producer permissions or access to Groups.

When YouTube publishing is configured, queued packages upload automatically as **unlisted** on their assigned air date (Pacific time; default start is midnight). Producers can start one earlier with **Publish to YouTube**; the activation date does not apply to a manual publish. The YouTube title is the Final Cut headline, or the package topic when there is no headline. Uploading and YouTube processing take time. Emails are sent only after the video is processed, unlisted, and embeddable. Queue rows show publication status and errors; published packages remain accessible from **Past shows**.

Only dates on or after the configured activation date are eligible. Failed transfers retry using the same upload session. Each package publishes once, using the Final Cut version selected when its upload begins. That must be the version that was current when a producer queued the package (or last moved it); if the Final Cut changed after that, YouTube and the show editor skip the package until a producer sends it to the queue again. A package queued before its Final Cut was in publishes the cut that lands. Replacing a Final Cut or moving an already published package does not create another YouTube video. Removing a queued package pauses an unfinished upload; it does not delete an existing YouTube video. Changing the air date during upload requires an operator to reconcile the upload before resuming.

Emails go to the managers assigned when the video becomes ready. Adding a manager later does not resend old notifications. A publication with no managers still publishes, but sends no emails. Managers use the email's package link or the read-only queue; editing the queue remains producer-only.

Removing a manager also cancels any still-pending emails to them. Already delivered emails and their unlisted YouTube links cannot be recalled.

If the queue's **YouTube** tile says **Not set up**, an administrator must complete [YouTube setup](../YOUTUBE-PUBLISHING.md). An expired upload session or uncertain email delivery needs administrator reconciliation to avoid duplicates.

**Export CSV** on the publishing queue downloads every queued and past show with its packages (producers and website managers).
