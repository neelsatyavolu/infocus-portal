# Notifications Reference

This file documents how notifications currently appear in InFocus for each category (`announcements`, `comments`, `grades`) and channel (`browser`, `email`).

## Browser Notifications

| Category | Sent today? | What user sees | Click behavior |
| --- | --- | --- | --- |
| Announcements | Yes | **Title:** `New Announcement`<br>**Body:** first 120 chars of announcement content (trimmed to 117 + `...` if longer) | Opens `/announcements` |
| Comments | No | No browser push payload is currently sent for comments. | N/A |
| Grades | Yes | **When published:**<br>**Title:** `Grade published`<br>**Body:** `Package Cycle {cycleNumber}: {totalPoints}/40 ({percentage}%)`<br><br>**When updated (already published):**<br>**Title:** `Grade updated`<br>**Body:** `Package Cycle {cycleNumber}: {totalPoints}/40 ({percentage}%)` | Opens `/grades` |

## Email Notifications

| Category | Sent today? | What user sees |
| --- | --- | --- |
| Announcements | Yes | **Subject:** `New announcement from {authorName}`<br>**Body text:**<br>`{authorName} posted a new announcement:`<br>`{preview}`<br>`View in InFocus: {announcementUrl}`<br><br>`preview` is trimmed to 160 chars (157 + `...` if longer). |
| Comments | No | No email notification is currently sent for comments. |
| Grades | Yes | **When published:**<br>**Subject:** `Your Package Cycle {cycleNumber} grade is published`<br>**Body text:**<br>`Your grade for Package Cycle {cycleNumber} is now available.`<br>`Score: {totalPoints}/40 ({percentage}%)`<br>`View in InFocus: {gradeUrl}`<br><br>**When updated (already published):**<br>**Subject:** `Your Package Cycle {cycleNumber} grade was updated`<br>**Body text:**<br>`Your grade for Package Cycle {cycleNumber} was updated.`<br>`Score: {totalPoints}/40 ({percentage}%)`<br>`View in InFocus: {gradeUrl}` |

## Notes

- Comment notification toggles exist in settings (`emailCommentsEnabled`, `browserCommentsEnabled`), but comment notification delivery is not implemented yet.
- Grade notifications are only sent when grade preferences are enabled for that channel.
- Announcement notifications are sent to other users (not the author), respecting channel/category preferences.
- Notification behavior should stay aligned across browser and email channels when new categories are added.

<!-- edited 2 -->
