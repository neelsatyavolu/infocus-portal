# Ideas

Route: `/ideas` (sidebar → Production → **Ideas**). Everyone signed in sees the same page: reporters, associate producers, executive producers, the adviser, and super admin.

Ideas is a list of suggested story ideas to help a group decide what to pitch. It does not replace pitching, and nothing on it is assigned to anyone. Pitching and approval still happen in class and on Groups (see `groups-and-review.md` and `student-work.md`).

## What you see

- A new set of about 12 ideas every 2 days. The top of the page shows the date and how many local stories the set came from.
- Ideas are grouped the same way packages are pitched: **News**, **Feature**, and **Commentary**.
- Each idea has a title, a short pitch, a **Paly angle** (how it connects to students and who you might interview), and **Based on** links to the news stories or event listings it came from. Links open the original site in a new tab.
- **Past ideas** lists every earlier set by date, grouped by month. Click a date to read that set. The newest is marked **Latest**. On a phone the list sits below the ideas.

## Where the ideas come from

Portal reads public news and event feeds from around the Bay Area: Palo Alto and the Peninsula, the South Bay, San Francisco, the East Bay, region-wide outlets, and events listings. It only reads headlines and short summaries from the last 3 days, never full articles. An AI model (gpt-oss-120b on Cloudflare Workers AI) then suggests stories a student crew could localize.

- The ideas are written by AI, so details can be wrong. Open the linked stories and check the facts before you pitch.
- The links always point to real stories Portal read. The AI cannot add its own links.
- The AI is told to skip graphic violence, sexual content, and crime stories about private people or minors.
- Nobody can edit, hide, or request ideas from the page, and no one is notified when a new set arrives.

## When new ideas arrive

Once a day in the afternoon (4:30pm Pacific in daylight time, 3:30pm in standard time) Portal checks whether the newest set is at least 2 days old. If it is, it writes a new one. If a run fails (for example most news sites were unreachable), there is no new set that day and Portal tries again the next afternoon.

## For admins

- The source list is fixed in code (`src/lib/idea-feeds.ts`). To add or remove a source, ask whoever maintains Portal.
- Ideas shares Cloudflare's free daily AI allowance with Meetings notes (see `meetings.md`). Writing a set takes one AI request, capped at about 660 neurons out of 10,000 a day. Portal makes at most one request a day (normally one every 2 days) and never retries a failed one the same day. It runs just before the allowance resets, so it does not take from the evening's meetings.
- If the Workers AI token is missing (`docs/ENVIRONMENT.md`), no ideas are written and the page says there are none yet.
