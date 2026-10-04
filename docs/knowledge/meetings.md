# Meetings

Private video meetings for producers, with notes written on the InFocus Drive.

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
- **Stable link:** `/meet/producers` always opens the current InFocus Producer Meeting (the live one, otherwise the next one). Before it opens, the page says when it opens.
- **Reminders:** a push 15 minutes before and again 5 minutes before a meeting starts ("… starts in 15 minutes", "… starts in 5 minutes. Join now."). Tapping it opens the call, in the iPhone and Mac apps too. Everyone gets them for open meetings (or only the picked people, when some were picked); invite-only meetings remind only the people on them. A meeting scheduled less than 15 minutes ahead skips the 15-minute reminder. Moving a meeting sends the reminders again at the new time.

## Calendar invites

- Invites are **Google Calendar events** sent from the InFocus Google account. Guests get Google's own invite email, and Google keeps their calendars up to date when something changes. The Portal sends no `.ics` files.
- Executive producers, the adviser, and super admin keep the list of email addresses (Meetings → calendar invites). Every producer can see the list and whether invites are working ("Invites are sent from … via Google Calendar", or "Last sync failed: …").
- An address can be **linked to a producer**. Invite-only meetings only invite addresses linked to the people on them.
- **InFocus Producer Meeting:** one repeating event (Sunday, Monday and Wednesday, 9:15 PM Pacific), linking to `/meet/producers`. Every address on the list is a guest.
- Adding an address makes it a guest of the repeating event and of every upcoming meeting it qualifies for. Removing it takes it off them, and Google sends that person a cancellation.
- When a host moves or cancels one occurrence, only that day changes in everyone's calendar.
- **Other scheduled meetings** (set more than 10 minutes ahead) get their own event, linking to `/meet/<id>`. Open meetings invite every address; invite-only meetings invite only the linked addresses of the people on them. Moving or renaming updates it; cancelling deletes it (guests get a cancellation); adding or removing someone from an invite-only meeting updates its guests. "Start now" meetings get no event.
- Changes reach Google in the background (retried if Google is briefly unavailable). **Sync now** re-checks everything.
- If Google Calendar isn't connected, no invites go out at all.

### One-time setup (super admin or adviser)

1. In the Google Cloud project that has the Portal's Google sign-in (the one used for YouTube), enable the **Google Calendar API**.
2. Admin → **Google Calendar** → **Connect Google Calendar**, and sign in as the InFocus Google account. Allow calendar access.
3. In Meetings → calendar invites, press **Sync now** once to create the repeating event for everyone already on the list.

This is separate from Admin → Reconnect YouTube and doesn't change it.

## Joining

- A scheduled meeting **opens 5 minutes before it starts**, for everyone (hosts too). Earlier, joining says when it opens ("This meeting opens at 9:10 PM."). A meeting that's already live can always be joined.
- Hosts go straight in. Everyone else **asks to join** and waits until a host lets them in.
- **Quick access** (host setting): producers join without asking. Someone a host removed still has to ask.
- Hosts get a push when someone is waiting (at most every 2 minutes per person).
- If you rejoin after being let in (refresh, another device), you go straight back in.

## Host controls

- Admit, deny, admit all, mute, remove, lower hands, quick access, notes on/off, End for everyone.
- **Remove** takes the person out and changes the meeting's encryption key, so they can't read or hear anything after that. They can ask to join again.
- When the last person leaves, the meeting ends by itself after a minute (the minute covers a refresh or a dropped connection). Notes start processing then.

## When the host leaves

- If the last host leaves the call, someone still in it becomes host so people can still be let in: another executive producer first, otherwise whoever has been in the call longest. The Notes participant never becomes host.
- Pressing **Leave** hands host over at once. If a host's connection just drops, the call waits 20 seconds in case they're coming back (a refresh); if they return in time, nothing changes.
- The new host keeps host for the rest of the meeting (admit, deny, remove, mute, end for everyone, settings). If the original host comes back, both are hosts.

## Link previews

- Sharing a meeting link in iMessage, Slack, Discord, WhatsApp, LinkedIn or Telegram shows a preview card with the meeting's title and its date and time (Pacific), or "Happening now" while it's live. `/meet/producers` shows the next InFocus Producer Meeting.
- The card shows the title and time only, never who is invited or attending. A cancelled meeting shows "Cancelled · <title>"; a link to a meeting that doesn't exist shows "InFocus meeting".
- Opening the link still needs an InFocus sign-in.

## Privacy

- Audio, video, screen share and chat are encrypted on each device. The video service only relays scrambled data.
- The key is given only to people a host let in, and it's deleted when the meeting ends.

## Notes

- **On by default.** A host can turn them off for a meeting.
- While notes are on, a **Notes** participant appears in the call. It records each speaker, and after the meeting the Drive writes a transcript and a summary (decisions, action items). Nothing leaves the school's Drive.
- **All producers** can read the summary and the full transcript on `/meetings/<id>`. For invite-only meetings, only the people on that meeting can.
- If the notes can't start, the meeting carries on and the notes show as failed.

## Limits

- Use Chrome or Safari (including the iPhone and Mac apps). Firefox isn't supported yet.
- No recording, live captions, guests from outside the Portal, or breakout rooms.
- If the month's free video allowance is nearly used up, new meetings can't start until next month.

## Encryption limits

- Chat messages are tied to the sender, the meeting and the message. A message that doesn't match the person the room says sent it shows as "Couldn't verify this message".
- Audio and video frames are encrypted with the shared meeting key but are not tied to a sender. Anyone already in the meeting has that key, so in theory they could send media that appears under someone else's tile. People outside the meeting can't.
- Meeting pages (`/meet/…`, `/meet-scribe`) load no analytics.
