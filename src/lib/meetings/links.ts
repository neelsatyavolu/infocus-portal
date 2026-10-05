import { meetAppOrigin } from "@/src/lib/hosts";

/**
 * Shareable meeting links on the Meetings host (meet.infocuspaly.com). Safe on the client too
 * (reads NEXT_PUBLIC_MEET_APP_URL there). In-app navigation stays relative (`/meet/<id>`,
 * `/meetings`): those work on both hosts and in the iPhone app, which loads the main host.
 */

export function meetingUrl(id: string) {
  return `${meetAppOrigin()}/${encodeURIComponent(id)}`;
}

export function producersMeetingUrl() {
  return `${meetAppOrigin()}/producers`;
}

export function meetingNotesUrl(id: string) {
  return `${meetAppOrigin()}/meetings/${encodeURIComponent(id)}`;
}

export function meetingsHomeUrl() {
  return `${meetAppOrigin()}/`;
}
