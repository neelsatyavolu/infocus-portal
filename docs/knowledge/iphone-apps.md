# iPhone apps

InFocus has two iPhone apps. Both are in TestFlight while they're tested.

The privacy policy for both apps and the Portal is the public page `/privacy` (https://infocuspaly.com/privacy), linked from the App Store listings.

## InFocus Portal (for class members)

The whole Portal in an iPhone app (bundle `com.infocuspaly.portal`). It shows the same pages as the website, with the same access rules, plus:

- **Sign in with your school account.** The app opens a browser sheet to approve Portal (`/app-sign-in`), the same hand-off as InFocus for Mac. Google doesn't allow its sign-in inside apps, which is why it uses a sheet.
- **Notifications.** After the first sign-in the app asks to send notifications. You then get an iPhone notification for every email Portal sends you, under the same rules as the Mac app (see `notifications.md`). Tapping one opens its page in the app. Settings → **iPhone app notifications** shows the status and has **Test Notification**.
- **Sign out** stops notifications on that iPhone.

Uploads, downloads and video playback work as they do in Safari. Links outside Portal open in a browser sheet. The source is in the `infocus-drive` repo, `ios/`.

## InFocus (for everyone)

The public app (bundle `com.infocuspaly.news`, App Store name "InFocus News"). No account is needed.

- **Home:** the latest show with the announcements read on it, the latest stories, and a banner when InFocus is live.
- **Shows:** every show by season, from the InFocus News YouTube playlists. A show's page plays it and lists its announcements. The list comes from the show's teleprompter **A2** bulletin, and only once the show is public on YouTube.
- **Stories:** every infocusnews.tv story, by category, with search and **Save for later**.
- **Live:** streams on now, upcoming public livestreams (Livestream tracker events marked **Public**, plus scheduled YouTube streams), and recent replays.
- **Submit an announcement:** the same form as `/submit-announcement` (see `announcements.md`).
- **Alerts:** optional notifications for new shows, new stories and streams going live, each toggled in Settings.

The app reads `GET /api/public/shows`, `/api/public/shows/{date}/announcements` and `/api/public/live`, which need no sign-in. The source is in the `infocus-news-app` repo.
