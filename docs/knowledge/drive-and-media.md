# Drive, uploads, and playback

**InFocus Drive** (`drive.infocuspaly.com`) is the NAS file browser. New Portal uploads use `MEDIA_STORAGE_PROVIDER=NAS`. Bunny is legacy only.

On Drive, choose **Continue with Google** or **Sign in with email**. For email sign-in, enter your registered email address, and enter the six-digit code sent to your inbox on the same page. Codes expire in 10 minutes and work once. Check spam if needed. Resend after one minute, up to five codes per hour; five incorrect guesses require a new code. Drive keeps its existing account permissions. Manual NAS username/password sign-in remains available. This does not change Finder/SMB passwords.

Package-cycle student files live at:

`Package Storage / Cycle N / {group name} / {stage folder} / file`

On campus, Finder can mount `smb://<drive-lan-ip>`. Off campus: Cloudflare WARP.

A-roll uploads allow up to **30 GB per file**; B-roll uploads allow up to **15 GB per file** (1 GB = 1,024³ bytes). Choose the clip type before selecting files. These limits apply in both student cycle tabs and Groups. Large files upload in chunks to InFocus Drive.

## Playback

Many camera originals are not browser-safe (Sony XAVC 4:2:2 10-bit, ProRes). Portal plays a Drive H.264/AAC proxy (`/api/service/file?web=1`) and thumbs from `/api/service/thumbnail`. Original download stays unproxied.

Details: `docs/NAS-STORAGE.md`.

## Guest review

Projects can mint guest links (`/g/[token]`) with optional passcode and expiry, without a Portal account.
