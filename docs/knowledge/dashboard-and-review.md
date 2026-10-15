# Dashboard, packages, and activity

## Public homepage

Route: `/`.

The public homepage introduces InFocus as Palo Alto High School's student-run broadcast publication, covering campus news, community stories, and live events. It links to [infocusnews.tv](https://infocusnews.tv) for published work and explains that InFocus Portal is the newsroom's production workspace. Video reports are introduced as “packages” for visitors unfamiliar with the term. The page provides entry points to the Portal, Equipment checkout, Master Calendar, and community announcement submission, followed by an overview of newsroom tools.

## Dashboard / Packages

Route: `/dashboard`.

- **Students** see a header with what to do next (the current stage and its due date, with an **Open** button for that stage), then **My package** (topic, teammates, producer, a bar for each stage marked Submitted, Now or Later with due dates, check-ins, unread producer feedback, and extension days left, which opens `/extension-requests`), a **Grade** card (estimated letter and percent, Packages, Participation, and Livestream hours; opens `/grades` or `/livestreams`), **This week** (participation by day), and recent **Activity**.
- **Producers** (associates and above) see **Packages** — workspaces and their projects, not the Groups review board. Pick a workspace (top bar), sort by Name, Recent, or Size (page header), and switch Grid or List view (top bar). If they are on a package roster, a **My package** card on the right links to their current stage; recent **Activity** sits below it. Producers with owner or editor access to the workspace can create projects; any producer can delete one (this deletes all its media).

## Projects

Opening a project goes to `/projects/[id]`: folders, uploads, versions, comments. Filter by status (Ready, In Progress, Failed) and sort by Recent, Name, or Status. On a video you can rename, download, move it to a folder, upload a new version, add people, or set its status (**In Review**, **Needs Changes**, **Approved**, **Aired** with an air date; a version must be approved before it is marked aired). Deleted videos go to Recently Deleted, where they can be restored or deleted permanently. On a phone or narrow window the Assets sidebar becomes a scrolling row of chips at the top of the project (the project, every folder, Videos, Recently Deleted) with a **+** button to create a folder.

## Review page

`/projects/[id]/review/[mediaId]` plays one video or image. Comments pin to a timestamp (or a point on an image), take replies, and can be edited, deleted, resolved, filtered, and searched. **Import comments (CSV)** adds comments from a file, and **Export comments (CSV)** in the same ⋯ menu downloads every comment and reply on the current version (a file that Import reads back). Playback speed runs 0.5× to 2×, and Space plays or pauses. In the comment box, Enter sends and Shift+Enter adds a line; on a phone or tablet keyboard Enter adds a line and **Send** posts. On a phone or tablet held upright, the player stays pinned at the top and the comment box stays docked at the bottom while the comments scroll. Package approval (**Approve**, **Approve anyway**, Submit review) also happens here; see `groups-and-review.md`, which also covers the downloaded-range seek bar and **Transcribe**.

## Guest links

People with owner access to the workspace can share a project or one version as a guest link (`/g/[token]`) with no Portal account: **View + Comment** or **View only**, an optional passcode (4–40 characters), and an optional expiry. Links can be revoked. Guests cannot transcribe or import comments.

## Activity

`/activity` used to be a media-review event feed. It now forwards to Settings, where notification preferences live. Package-cycle work is easier to follow from Groups and student cycle tabs.

## Information

`/information` is the student-facing cycle and approval explainer (pitching rules, stages 1–3, no man-on-the-street as the primary package).
