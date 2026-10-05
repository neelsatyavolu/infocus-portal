# Drive, uploads, and playback

**InFocus Drive** (`drive.infocuspaly.com`) is the NAS file browser. New Portal uploads use `MEDIA_STORAGE_PROVIDER=NAS`. Bunny is legacy only.

On Drive, choose **Continue with Google** or **Sign in with email**. For email sign-in, enter your registered email address, and enter the six-digit code sent to your inbox on the same page. Codes expire in 10 minutes and work once. Check spam if needed. Resend after one minute, up to five codes per hour; five incorrect guesses require a new code. Drive keeps its existing account permissions. Manual NAS username/password sign-in remains available. This does not change Finder/SMB passwords.

Package-cycle student files live at:

`Package Storage / Cycle N / {group name} / {stage folder} / file`

The group name is the topic, or the members' last names. Stage folders are `A-roll B-roll`, `Initial Cut`, and `Final Cut`. Custom packages added from the Publishing Queue go under `Package Storage / Publishing Queue`. The producer Packages library (projects on `/dashboard`) lives under `Package Cycles`.

On campus, Finder can mount `smb://<drive-lan-ip>`. Off campus: Cloudflare WARP.

**InFocus for Mac** is one app for Portal and Drive. It replaces the InFocus Drive Mac app, and existing installs update into it. Opening it shows Portal in a native window (tabs, Cmd+N for a new window). It keeps Drive mounted in Finder from the menu bar, and Mac notifications arrive for Portal emails (see `notifications.md`). **Sign in with Google** in the app opens your browser twice: once to approve Portal (`/app-sign-in`), then once to approve Drive. Sign out from the app menu signs out of both and stops notifications on that Mac.

To install it: **Settings → InFocus for Mac → Download for Mac** (shown on Macs; macOS 13 or later). Open the download, click **Open** if macOS asks, then **Move to Applications** (the app copies itself there, or to your own Applications folder without admin rights, and moves the download to the Trash). On first open it asks whether to allow notifications (**Allow**), then you sign in. It updates itself after that. On an iPhone, iPad or Windows computer the section just says it's available for Mac; inside the app it says you're already using it.

A-roll uploads allow up to **30 GB per file**; B-roll uploads allow up to **15 GB per file** (1 GB = 1,024³ bytes). Choose A-roll or B-roll before selecting files, or right after dragging files onto the upload box. These limits apply in both student cycle tabs and Groups. Files of 8 MB or more upload in chunks to InFocus Drive, and a dropped chunk is retried. Image uploads in projects allow up to 10 MB. Proof-of-contact images can start at up to 25 MB; the browser shrinks them to 3.5 MB or less before upload.

## Playback

Many camera originals are not browser-safe (Sony XAVC 4:2:2 10-bit, ProRes). Portal plays a Drive H.264/AAC proxy (`/api/service/file?web=1`) and thumbs from `/api/service/thumbnail`. Original download stays unproxied. Drive videos play directly in the browser (no quality menu); the seek bar shows what has already downloaded. Tile posters are saved beside the video as `{name}.poster.jpg`.

**Transcripts:** **Transcribe** on the review page saves each version's transcript beside the video on Drive as `{name}.transcript.json` and reuses it. Videos over 2 GB cannot be transcribed. See `groups-and-review.md`.

Details: `docs/NAS-STORAGE.md`.

## Guest review

People with owner access to the workspace can mint guest links (`/g/[token]`) for a project or one version, without a Portal account: View + Comment or View only, optional passcode and expiry. See `dashboard-and-review.md`.
