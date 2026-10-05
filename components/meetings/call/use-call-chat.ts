"use client";

import { useCallback, useState, type MutableRefObject } from "react";
import type { MeetingClientMessage, MeetingServerMessage } from "@/src/lib/meetings/protocol";
import { decryptChat, encryptChat } from "@/src/lib/meetings/client/chat-crypto";
import type { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";

/** `text` is null when the message can't be shown: "missing-key" (before you joined) or "unverified". */
export type ChatEntry = {
  id: string;
  uid: string;
  name: string;
  at: number;
  text: string | null;
  problem: "missing-key" | "unverified" | null;
  own: boolean;
};

const MAX_CHAT = 300;

/** End-to-end encrypted chat for the call: decrypt incoming, encrypt + echo outgoing. */
export function useCallChat(input: {
  meetingId: string;
  e2ee: MutableRefObject<MeetingE2ee | null>;
  selfUid: MutableRefObject<string | null>;
  selfName: () => string;
  send: (message: MeetingClientMessage) => boolean;
}) {
  const { meetingId, e2ee, selfUid, selfName, send } = input;
  const [chat, setChat] = useState<ChatEntry[]>([]);

  const append = useCallback((entry: ChatEntry) => {
    setChat((prev) => (prev.some((m) => m.id === entry.id) ? prev : [...prev, entry].slice(-MAX_CHAT)));
  }, []);

  const receiveChat = useCallback(
    async (message: Extract<MeetingServerMessage, { t: "chat" }>) => {
      const key = e2ee.current?.chatKeyFor(message.epoch);
      // The room stamps uid; a ciphertext sealed for any other sender, meeting or id fails here.
      const context = { meetingId, uid: message.uid, id: message.id };
      const text = key ? await decryptChat(key, message, context) : null;
      append({
        id: message.id,
        uid: message.uid,
        name: message.name,
        at: message.at,
        text,
        problem: !key ? "missing-key" : text === null ? "unverified" : null,
        own: message.uid === selfUid.current
      });
    },
    [append, e2ee, meetingId, selfUid]
  );

  const sendChat = useCallback(
    async (text: string) => {
      const current = e2ee.current?.currentChat;
      const self = selfUid.current;
      if (!current || !self) return false;
      const id = crypto.randomUUID();
      const sealed = await encryptChat(current.key, current.epoch, text, { meetingId, uid: self, id });
      if (!send({ t: "chat", id, ...sealed })) return false;
      // Local echo; the room's fan-out copy (same id) is deduplicated.
      append({ id, uid: self, name: selfName(), at: Date.now(), text, problem: null, own: true });
      return true;
    },
    [append, e2ee, meetingId, selfName, selfUid, send]
  );

  return { chat, receiveChat, sendChat };
}
