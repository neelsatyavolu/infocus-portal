# Meetings

Private video meetings for producers, with notes written on the InFocus Drive.


## Where meetings live

- Meetings have their own address: **meet.infocuspaly.com**. The Meetings tab is at the top (`meet.infocuspaly.com`), the InFocus Producer Meeting at **meet.infocuspaly.com/producers**, and each meeting at `meet.infocuspaly.com/<meeting id>`.
- Copy link, calendar invites and link previews all use these addresses. Old `infocuspaly.com/meet/…` and `/meetings` links still work: they move to the meet address.
- The InFocus Portal iPhone app keeps opening meetings inside the app, as before.
- **Past** on the Meetings tab is grouped by day, newest first, and shows the 5 most recent meetings. **Show older meetings** opens 10 more at a time (up to the last 30), and **Show fewer** collapses it again.
- Signing in from a meet link brings you back to that meeting.
## Who

- **Producers only** (associate producers and up). Reporters without a producer role don't see Meetings.
- **Any producer** can start a meeting ("Start now") or schedule one.
- **Hosts:** executive producers, the adviser, super admin, and whoever started the meeting.

## Execs-only meetings

- Executive producers, the adviser, and super admin can schedule a meeting for **Execs only** (Schedule → Who can join → Execs only).
- Only executive producers, the adviser, and super admin can see it, join it, or read its notes and transcript. Other producers can't see that it exists.
- Every exec is a host. Reminders and "waiting to join" pushes go to execs only.
- Calendar invites go only to invite-list addresses linked to an exec.
- Who can join is set when the meeting is created and can't be changed later.

## Invite-only meetings

- Only executive producers, the adviser, and super admin can create an **invite-only** meeting ("Only people I choose"). They pick at least one producer to invite.
- Only the creator and the invited producers can see it, join it, or read its notes. Everyone else, including uninvited executives, can't see that it exists.
- **Hosts:** the creator and any invited executives.
- The creator or an invited executive can change who's invited while the meeting is scheduled or live. If someone is taken off the list during the call, they're removed and the encryption key changes.
- Reminders and "waiting to join" pushes go only to people on the meeting.
- The InFocus Producer Meeting is always open to every producer.

## Schedule

- The **InFocus Producer Meeting** repeats every Sunday, Monday and Wednesday at 9:15 PM Pacific for 60 minutes. The next 21 days are always listed.
- A host can **move** or **cancel** one occurrence. A moved occurrence stays moved; a cancelled one stays cancelled.
- A live meeting can't be moved or cancelled. Use **End for everyone**.
- **Stable link:** `meet.infocuspaly.com/producers` always opens the current InFocus Producer Meeting (the live one, otherwise the next one). Before it opens, the page says when it opens.
- **Reminders:** a push 15 minutes before and again 5 minutes before a meeting starts ("… starts in 15 minutes", "… starts in 5 minutes. Join now."). Tapping it opens the call, in the iPhone and Mac apps too. Everyone gets them for open meetings (or only the picked people, when some were picked); invite-only meetings remind only the people on them. A meeting scheduled less than 15 minutes ahead skips the 15-minute reminder. Moving a meeting sends the reminders again at the new time.

## Calendar invites

- Invites are **Google Calendar events** sent from the InFocus Google account. Guests get Google's own invite email, and Google keeps their calendars up to date when something changes. The Portal sends no `.ics` files.
- Executive producers, the adviser, and super admin keep the list of email addresses (Meetings → calendar invites). Every producer can see the list and whether invites are working ("Invites are sent from … via Google Calendar", or "Last sync failed: …").
- An address can be **linked to a producer**. Invite-only meetings only invite addresses linked to the people on them.
- **InFocus Producer Meeting:** one repeating event (Sunday, Monday and Wednesday, 9:15 PM Pacific), linking to `meet.infocuspaly.com/producers`. Every address on the list is a guest.
- Adding an address makes it a guest of the repeating event and of every upcoming meeting it qualifies for. Removing it takes it off them, and Google sends that person a cancellation.
- When a host moves or cancels one occurrence, only that day changes in everyone's calendar.
- **Other scheduled meetings** (set more than 10 minutes ahead) get their own event, linking to `meet.infocuspaly.com/<id>`. Open meetings invite every address; invite-only meetings invite only the linked addresses of the people on them. Moving or renaming updates it; cancelling deletes it (guests get a cancellation); adding or removing someone from an invite-only meeting updates its guests. "Start now" meetings get no event.
- Changes reach Google in the background (retried if Google is briefly unavailable). **Sync now** re-checks everything.
- **Only upcoming dates change.** Past meetings keep what they said at the time:
  - If the InFocus Producer Meeting's title, link or description changes after it has already met, the repeating event is split: the old one ends at the last past date, and a new one (with the new details and the same guests) starts at the next date. Moved or cancelled upcoming dates are applied to the new one. Guests get Google's update.
  - Before the first date, the event is simply updated.
  - Adding or removing a guest updates the repeating event in place. Google lists guests for the whole series, so a new guest also shows on past dates there, but nothing else about past dates changes.
  - A meeting whose date has passed (including a one-off that has ended) is never edited or deleted.
- If Google Calendar isn't connected, no invites go out at all.

### One-time setup (super admin or adviser)

1. In the Google Cloud project that has the Portal's Google sign-in (the one used for YouTube), enable the **Google Calendar API**.
2. Admin → **Google Calendar** → **Connect Google Calendar**, and sign in as the InFocus Google account. Allow calendar access.
3. In Meetings → calendar invites, press **Sync now** once to create the repeating event for everyone already on the list. **Sync now** also updates existing events whose title or link changed (for example after the move to meet.infocuspaly.com).

This is separate from Admin → Reconnect YouTube and doesn't change it.

## Joining

- A scheduled meeting **opens 5 minutes before it starts**, for everyone (hosts too). Earlier, joining says when it opens ("This meeting opens at 9:10 PM."). A meeting that's already live can always be joined.
- Hosts go straight in. Everyone else **asks to join** and waits until a host lets them in.
- **Quick access** (host setting): producers join without asking. Someone a host removed still has to ask.
- Hosts get a push when someone is waiting (at most every 2 minutes per person).
- If you rejoin after being let in (refresh, another device), you go straight back in.
- When the call ends for you (ended, removed, or an error screen), your mic, camera and screen share turn off. Rejoining from that screen starts muted.
- If the speaker you picked is unplugged (USB or Bluetooth), sound switches to the computer's default output.
- **Voice isolation** (on by default) switches to the noise filter only once it has fully loaded, so the first words after unmuting aren't cut off. On a slow device that can't load it within 5 seconds, the browser's own noise suppression keeps working.

## Host controls

- Admit, deny, admit all, mute, remove, lower hands, quick access, notes on/off, End for everyone.
- If someone is still in the lobby after you let them in, press **Admit** again: it re-sends the "come in". If the call can't be reached, Admit says so instead of looking like it worked.
- **Remove** takes the person out and changes the meeting's encryption key, so they can't read or hear anything after that. They can ask to join again.
- When the last person leaves, the meeting ends by itself after a minute (the minute covers a refresh or a dropped connection). Notes start processing then.
- **Picking it up again:** a meeting that ended because everyone left can be rejoined for 15 minutes (for example, everyone dropped at once). Joining starts it again with a new encryption key, and notes start a new part. **End for everyone** is final: that meeting can't be reopened. The InFocus Producer Meeting link opens such a just-ended meeting while it can still be picked up.
- A meeting left running far past its time (8 hours after its start) is ended automatically.
- **Long meetings:** your connection to the call is renewed in the background, so meetings can run as long as needed.

## When the host leaves

- If the last host leaves the call, someone still in it becomes host so people can still be let in: another executive producer first, otherwise whoever has been in the call longest. The Notes participant never becomes host.
- Pressing **Leave** hands host over at once. If a host's connection just drops, the call waits 20 seconds in case they're coming back (a refresh); if they return in time, nothing changes.
- The new host keeps host for the rest of the meeting (admit, deny, remove, mute, end for everyone, settings). If the original host comes back, both are hosts.

## Link previews

- Sharing a meeting link in iMessage, Slack, Discord, WhatsApp, LinkedIn or Telegram shows a preview card with the meeting's title, its date and time (Pacific) or "Happening now" while it's live, and the agenda items that aren't checked off yet (the first three, then "+N more"). `meet.infocuspaly.com/producers` (and the old `/meet/producers` link) shows the next InFocus Producer Meeting.
- The card shows the title, time and agenda only, never who is invited or attending. Anyone the link reaches can see the agenda, so keep private details out of agenda lines. A cancelled meeting shows "Cancelled · <title>"; a link to a meeting that doesn't exist shows "InFocus meeting".
- Opening the link still needs an InFocus sign-in.

## Privacy

- Audio, video, screen share and chat are encrypted on each device. The video service only relays scrambled data.
- The key is given only to people a host let in, and it's deleted when the meeting ends.
- Agendas are not end-to-end encrypted: they're stored in the Portal like meeting titles (see Agenda).

## Agenda

- Every meeting has its own agenda, including each producer meeting (Sunday, Monday and Wednesday each get a fresh one). Any producer who can see the meeting can add, edit, reorder and check off items; invite-only and execs-only agendas stay hidden from everyone else.
- **Meetings tab:** the **Agenda** button on a meeting opens the editor. Drag the handle to reorder (or focus a handle, press Space, move with the arrow keys, press Space again). Click an item to edit it; delete has an Undo.
- **In the call:** the **Agenda** button (next to Chat and People) shows how many items are left and opens the agenda panel: "3 of 7 done", a progress bar, and checkboxes. Checking an item off updates everyone's panel right away and shows who checked it. Anyone can add a quick item at the end; **Edit agenda** opens the full editor in a new tab.
- Once a meeting ends or is cancelled, its agenda is read-only.
- Agenda text is stored in the Portal like the meeting title. Unlike call audio, video and chat, it is **not** end-to-end encrypted.

## Notes

- **On by default.** A host can turn them off for a meeting.
- While notes are on, a **Notes** participant appears in the call. It records each speaker, and after the meeting the Drive writes a transcript and a summary (decisions, action items). Nothing leaves the school's Drive.
- **All producers** can read the summary and the full transcript on `/meetings/<id>`. For invite-only meetings, only the people on that meeting can.
- If the notes can't start, the meeting carries on and the notes show as failed. The notes page says why (for example "could not join the meeting").
- **Notes in parts:** if the notes taker stops while people are still in the call (a crash, its time limit), a new part starts automatically (at most once every 10 minutes). Each finished part adds its summary under "Part 2", "Part 3" and so on, and the transcript shows every part in order. A part still recording never hides an earlier finished one.
- Notes that stay "processing" for 12 hours, or "recording" an hour after the meeting ended, are marked failed with the reason.

## Limits

- Use Chrome or Safari (including the iPhone and Mac apps). Firefox isn't supported yet.
- No recording, live captions, guests from outside the Portal, or breakout rooms.
- If the month's free video allowance is nearly used up, new meetings can't start and no one new can join a call in progress until next month. Calls already running carry on, and people in them can rejoin.

## Encryption limits

- Chat messages are tied to the sender, the meeting and the message. A message that doesn't match the person the room says sent it shows as "Couldn't verify this message".
- Audio and video frames are encrypted with the shared meeting key but are not tied to a sender. Anyone already in the meeting has that key, so in theory they could send media that appears under someone else's tile. People outside the meeting can't.
- Meeting pages (`/meet/…`, `/meet-scribe`) load no analytics.

## Debugging a call

When a call goes wrong ("we couldn't hear each other"), there is a record to look at afterwards.

- **What's logged:** the meeting room writes one line per event to Cloudflare Workers Logs: people connecting and leaving (with the close reason), who is host, tracks being shared, every audio/video connection request to Cloudflare (status and timing), limits being hit, rekeys and the meeting ending. Each browser in the call also reports a short connection summary every 10 seconds (connection state, network path, packets sent and received per person, audio level, decryption problems) and reports problems the moment they happen (connection failed, audio blocked, a retry, Leave pressed).
- **What's never logged:** names, emails, chat, the meeting key, room tickets, audio or video. People appear only by their internal id.
- **Reading the logs:** `npm run meetings:logs -- <meeting id or latest> [--since 2h] [--uid <id>] [--json]` prints a timeline and marks problems with `!!`. It needs `CLOUDFLARE_ACCOUNT_ID` and a Cloudflare API token with **Workers Observability: Edit** (see the top of `scripts/meetings-logs.ts`). For a live view: `npx wrangler tail infocus-meeting-room --format json`.
- **Copy debug info:** in a call, open the meeting info (the **i** in the menu) and press **Copy debug info**. It copies the meeting id, your internal id, your browser, the app version and the last ~200 diagnostic entries, with no names or content, for pasting into a bug report.

