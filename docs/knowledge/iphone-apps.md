# iPhone apps

InFocus has two iPhone apps. Both are in TestFlight while they're tested.

The infocuspaly.com homepage has a **Get the apps** section (both iPhone apps and InFocus for Mac). Until Apple approves the iPhone apps it says "Coming soon to the App Store"; on release day set `IPHONE_APPS_RELEASED` to true in `src/lib/app-links.ts`.

The privacy policy for both apps and the Portal is the public page `/privacy` (https://infocuspaly.com/privacy), linked from the App Store listings.

## InFocus Portal (for class members)

A native iPhone app for the Portal (bundle `com.infocuspaly.portal`), with the same access rules as the website. The tabs depend on your role: **Home** · **Packages** (students) or **Groups** (producers) · **Calendar** · **Messages** · **More**.

- **Home:** what's due next with a countdown, your package this cycle, your grade snapshot and recent activity (`GET /api/app/home`).
- **Packages:** your cycle's stages. Upload A-roll/B-roll, Initial Cut and Final Cut from Photos or Files straight to InFocus Drive, watch cuts, and read and post feedback. Brainstorming takes the doc link and proof-of-contact images.
- **Groups:** the same tiles, pills and visibility as the website. Review a stage, then Approve (with optional feedback) or Send back with a note.
- **Calendar:** agenda and month views of the Master Calendar with your own jobs marked, day details, The Show's upcoming cast, and the announcements feed (like, comment, mark read).
- **Messages:** package group chats and direct messages, with unread counts on the tab.
- **More:** Grades (overall, packages, participation by week, livestream hours, portfolio), Extensions (request, agree as a teammate, and approve or deny as a producer), Equipment (your gear, requests, and manager approvals and returns), Livestreams (schedule, sign-up requests, manager review), Settings, and every other Portal page.

Producer tools that aren't native yet open the matching Portal page inside the app. These include Grade Editor, Master Calendar editing, cast tools, Final Cut grading and timecoded review.

- **Sign in with your school account.** The app opens a browser sheet to approve Portal (`/app-sign-in`), the same hand-off as InFocus for Mac. Google doesn't allow its sign-in inside apps, which is why it uses a sheet.
- **Notifications.** After the first sign-in the app asks to send notifications. You then get an iPhone notification for every email Portal sends you, under the same rules as the Mac app (see `notifications.md`). Tapping one opens its page in the app. Settings → **iPhone app notifications** shows the status and has **Test Notification**.
- **Sign out** stops notifications on that iPhone.

Portal pages opened inside the app show without the website's sidebar and header (the app sets the `infocus_embedded` cookie). Links outside Portal open in a browser sheet. The source is in the `infocus-drive` repo, `ios/`.

### App Review account

Apple's reviewers can't use a school account, so Portal has one demo account for them, set only in the server environment (`APP_REVIEW_EMAIL`, `APP_REVIEW_CODE`; see `docs/ENVIRONMENT.md`). It signs in with **Sign in with an email code**, using the fixed code from the App Store Connect review notes instead of a mailed one. The usual code limits still apply.

The account is walled off from the class:

- It sees only its own workspace, **App Review Sample**: one sample project with drawn mockups and a few comments, all fictional. It never sees InFocus News or any workspace open to all members.
- Its menu is **Dashboard** and **Settings**. Every other page sends it back to its dashboard, and every other API answers 403 (checked in `middleware.ts`). It has no assistant or messages.
- It is a reviewer in that workspace, so it can comment but can't upload or create projects.
- It never appears in any people list: rosters, pickers, Members, gradebooks, cast and anchor randomizers, counts.
- In Settings it can turn on iPhone notifications and send itself a test notification.

Set it up once with `npx tsx scripts/seed-app-review.ts` (with `APP_REVIEW_EMAIL` and the production database URL in the environment). `--remove` deletes the account and its workspace. Remove the account before unsetting `APP_REVIEW_EMAIL`: once the email is unset, it is no longer hidden from people lists.

## InFocus (for everyone)

The public app (bundle `com.infocuspaly.news`, App Store name "InFocus News"). No account is needed.

- **Home:** the latest show with the announcements read on it, the latest stories, and a banner when InFocus is live.
- **Shows:** every show by season, from the InFocus News YouTube playlists. A show's page plays it and lists its announcements. The list comes from the show's teleprompter **A2** bulletin, and only once the show is public on YouTube.
- **Stories:** every infocusnews.tv story, by category, with search and **Save for later**.
- **Live:** streams on now, upcoming public livestreams (Livestream tracker events marked **Public**, plus scheduled YouTube streams), and recent replays.
- **Submit an announcement:** the same form as `/submit-announcement` (see `announcements.md`).
- **Alerts:** optional notifications for new shows, new stories and streams going live, each toggled in Settings.

The app reads `GET /api/public/shows`, `/api/public/shows/{date}/announcements` and `/api/public/live`, which need no sign-in. The source is in the `infocus-news-app` repo.
