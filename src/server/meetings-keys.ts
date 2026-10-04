import {
  createMeetingKey,
  meetingKeyToBase64Url,
  openMeetingKey,
  sealMeetingKey
} from "@/src/lib/meetings/key-crypto";
import type { KeyResponse } from "@/src/lib/meetings/types";
import { prisma } from "@/src/lib/prisma";

/** The meeting's E2EE key, sealed at rest under APP_AUTH_SECRET. Handed only to admitted people. */

function keySecret() {
  const secret = process.env.APP_AUTH_SECRET?.trim();
  if (!secret) throw new Error("Meetings need APP_AUTH_SECRET to protect the meeting key.");
  return secret;
}

export function readMeetingKey(meeting: { keyCiphertext: string | null; keyEpoch: number }): KeyResponse | null {
  if (!meeting.keyCiphertext) return null;
  const key = openMeetingKey(meeting.keyCiphertext, keySecret());
  return key ? { key: meetingKeyToBase64Url(key), epoch: meeting.keyEpoch } : null;
}

/** Creates the key on first use. Safe under concurrent joins: only one write wins, everyone reads it back. */
export async function ensureMeetingKey(meetingId: string): Promise<KeyResponse> {
  const secret = keySecret();
  await prisma.meeting.updateMany({
    // Never mint a key for a meeting that is over (end clears it).
    where: { id: meetingId, keyCiphertext: null, status: { in: ["SCHEDULED", "LIVE"] } },
    data: { keyCiphertext: sealMeetingKey(createMeetingKey(), secret) }
  });
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { keyCiphertext: true, keyEpoch: true }
  });
  const key = meeting ? readMeetingKey(meeting) : null;
  if (!key) throw new Error("The meeting key could not be read.");
  return key;
}

/** New random key and epoch + 1 (after someone is removed). */
export async function rotateMeetingKey(meetingId: string): Promise<KeyResponse> {
  const key = createMeetingKey();
  const updated = await prisma.meeting.update({
    where: { id: meetingId },
    data: { keyCiphertext: sealMeetingKey(key, keySecret()), keyEpoch: { increment: 1 } },
    select: { keyEpoch: true }
  });
  return { key: meetingKeyToBase64Url(key), epoch: updated.keyEpoch };
}
