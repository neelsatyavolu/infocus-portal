# Meetings

Private video meetings for producers, with notes written on the InFocus Drive.

## Who

- **Producers only** (associate producers and up). Reporters without a producer role don't see Meetings.
- **Any producer** can start a meeting ("Start now") or schedule one.
- **Hosts:** executive producers, the adviser, super admin, and whoever started the meeting.

## Invite-only meetings

- Only executive producers, the adviser, and super admin can create an **invite-only** meeting. They pick at least one producer to invite.
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

- Executive producers, the adviser, and super admin keep a list of email addresses that get the InFocus Producer Meeting in their calendar (Meetings → calendar invites). Every producer can see the list.
- An address can be **linked to a producer**. Invite-only meetings only email addresses linked to the people on them.
- Adding an address emails it a calendar invite (`invite.ics`) for the whole series, linking to `/meet/producers`. Adding the same address again within 10 minutes doesn't email it twice. **Resend to everyone** sends it again (in the background).
- Removing an address emails it a cancellation, so the series leaves that calendar.
- When a host moves or cancels one occurrence, every address gets an update for just that occurrence.
- **Other scheduled meetings** (set more than 10 minutes ahead) send their own calendar invite, linking to `/meet/<id>`. Open meetings go to every address; invite-only meetings go only to the linked addresses of the people on them. Moving or renaming the meeting sends an update, and cancelling it sends a cancellation. When someone is added to an invite-only meeting they get the invite; when someone is taken off it they get a cancellation. "Start now" meetings send no calendar email.

## Joining

- A scheduled meeting **opens 5 minutes before it starts**, for everyone (hosts too). Earlier, joining says when it opens ("This meeting opens at 9:10 PM."). A meeting that's already live can always be joined.
- Hosts go straight in. Everyone else **asks to join** and waits until a host lets them in.
- **Quick access** (host setting): producers join without asking. Someone a host removed still has to ask.
- Hosts get a push when someone is waiting (at most every 2 minutes per person).
- If you rejoin after being let in (refresh, another device), you go straight back in.

## Host controls

- Admit, deny, admit all, mute, remove, lower hands, quick access, notes on/off, End for everyone.
- **Remove** takes the person out and changes the meeting's encryption key, so they can't read or hear anything after that. They can ask to join again.
- A meeting with nobody in it for 15 minutes ends by itself.

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
