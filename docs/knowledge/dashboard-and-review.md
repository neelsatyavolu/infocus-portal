# Dashboard, packages, and activity

## Public homepage

Route: `/`.

The public homepage introduces InFocus as Palo Alto High School's student-run broadcast publication, covering campus news, community stories, and live events. It links to [infocusnews.tv](https://infocusnews.tv) for published work and explains that InFocus Portal is the newsroom's production workspace. Video reports are introduced as “packages” for visitors unfamiliar with the term. The page provides entry points to the Portal, Equipment checkout, Master Calendar, and community announcement submission, followed by an overview of newsroom tools.

## Dashboard / Packages

Route: `/dashboard`.

- **Students** see their cycle snapshot: **Up Next** (each stage of this cycle as Submitted, up next, or locked, with due dates), recent **Activity**, and cards for the estimated grade, Packages, Participation, Livestream hours, this week's participation, Extensions (opens `/extension-requests`), unread producer Feedback, and **Your package** (topic, producer, teammates). Grade cards open `/grades`.
- **Producers** (associates and above) see **Packages** — workspaces and their projects, not the Groups review board. Pick a workspace, sort by Name, Recent, or Size, and switch Grid or List view. Producers with owner or editor access to the workspace can create projects; any producer can delete one (this deletes all its media).

## Projects

Opening a project goes to `/projects/[id]`: folders, uploads, versions, comments. Filter by status (Ready, In Progress, Failed) and sort by Recent, Name, or Status. On a video you can rename, download, move it to a folder, upload a new version, add people, or set its status (**In Review**, **Needs Changes**, **Approved**, **Aired** with an air date; a version must be approved before it is marked aired). Deleted videos go to Recently Deleted, where they can be restored or deleted permanently.

## Review page

`/projects/[id]/review/[mediaId]` plays one video or image. Comments pin to a timestamp (or a point on an image), take replies, and can be edited, deleted, resolved, filtered, and searched. **Import comments (CSV)** adds comments from a file, and **Export comments (CSV)** in the same ⋯ menu downloads every comment and reply on the current version (a file that Import reads back). Playback speed runs 0.5× to 2×, and Space plays or pauses. Package approval (**Approve**, **Approve anyway**, Submit review) also happens here; see `groups-and-review.md`, which also covers the downloaded-range seek bar and **Transcribe**.

## Guest links

People with owner access to the workspace can share a project or one version as a guest link (`/g/[token]`) with no Portal account: **View + Comment** or **View only**, an optional passcode (4–40 characters), and an optional expiry. Links can be revoked. Guests cannot transcribe or import comments.

## Activity

`/activity` used to be a media-review event feed. It now forwards to Settings, where notification preferences live. Package-cycle work is easier to follow from Groups and student cycle tabs.

## Information

`/information` is the student-facing cycle and approval explainer (pitching rules, stages 1–3, no man-on-the-street as the primary package).
