import { pacificTimeLabel } from "@/src/lib/meetings/client/time";

type ChatHead = { uid: string; own: boolean; at: number };

/**
 * A message shows its sender and time unless the one before it is from the same person in the
 * same minute (Pacific), so a burst of messages reads as one block and no time is lost.
 */
export function startsChatGroup(previous: ChatHead | undefined, message: ChatHead) {
  if (!previous) return true;
  if (previous.own !== message.own || previous.uid !== message.uid) return true;
  if (Math.abs(message.at - previous.at) >= 60_000) return true;
  return pacificTimeLabel(new Date(previous.at)) !== pacificTimeLabel(new Date(message.at));
}
