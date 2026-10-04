"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { MeetingClientMessage, MeetingReaction, MeetingServerMessage } from "@/src/lib/meetings/protocol";
import type { JoinResponse } from "@/src/lib/meetings/types";
import { MeetingApiError, errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { decryptChat, encryptChat } from "@/src/lib/meetings/client/chat-crypto";
import { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";
import { createMediaSession, type MeetingMediaSession } from "@/src/lib/meetings/client/media-session";
import { RoomSocket, type RoomSocketStatus } from "@/src/lib/meetings/client/room-socket";
import {
  INITIAL_ROOM_STATE,
  resetForReconnect,
  roomReducer,
  type RoomState
} from "@/src/lib/meetings/client/room-state";

export type CallStage = "full" | "prejoin" | "joining" | "waiting" | "denied" | "incall" | "left" | "removed" | "ended" | "error";

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
export type ReactionBurst = { id: string; emoji: MeetingReaction; name: string };

type LocalStage = "prejoin" | "joining" | "active" | "left" | "error";

type RoomAction = MeetingServerMessage | { t: "reset" };

function callRoomReducer(state: RoomState, action: RoomAction): RoomState {
  return action.t === "reset" ? resetForReconnect(state) : roomReducer(state, action);
}

const MAX_CHAT = 300;
const REACTION_MS = 3200;

export function useMeetingCall(meetingId: string, onMuted: (kind: "audio" | "video", by: string) => void) {
  const [room, dispatch] = useReducer(callRoomReducer, INITIAL_ROOM_STATE);
  const [local, setLocal] = useState<LocalStage>("prejoin");
  const [error, setError] = useState<string | null>(null);
  const [joinInfo, setJoinInfo] = useState<JoinResponse | null>(null);
  const [session, setSession] = useState<MeetingMediaSession | null>(null);
  const [socketStatus, setSocketStatus] = useState<RoomSocketStatus>("closed");
  const [welcomeCount, setWelcomeCount] = useState(0);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [reactions, setReactions] = useState<ReactionBurst[]>([]);

  const e2eeRef = useRef<MeetingE2ee | null>(null);
  const socketRef = useRef<RoomSocket | null>(null);
  const sessionRef = useRef<MeetingMediaSession | null>(null);
  const handlerRef = useRef<(message: MeetingServerMessage) => void>(() => undefined);
  const selfUidRef = useRef<string | null>(null);
  const joinInfoRef = useRef<JoinResponse | null>(null);
  const mediaGenerationRef = useRef(0);
  const [finalReason, setFinalReason] = useState<"full" | null>(null);
  /** The Portal refused /join because the join window isn't open yet. */
  const [notOpen, setNotOpen] = useState(false);

  const e2ee = useCallback(() => {
    if (!e2eeRef.current) e2eeRef.current = new MeetingE2ee();
    return e2eeRef.current;
  }, []);

  const send = useCallback((message: MeetingClientMessage) => socketRef.current?.send(message) ?? false, []);

  const teardown = useCallback(() => {
    mediaGenerationRef.current += 1;
    socketRef.current?.close();
    socketRef.current = null;
    setSession(null);
    sessionRef.current?.close();
    sessionRef.current = null;
    e2eeRef.current?.destroy();
    e2eeRef.current = null;
  }, []);

  /**
   * A fresh SFU session for every admitted welcome: the room forgets a uid's media sessions when
   * its socket reconnects, so the old PartyTracks instance is disposed and everything re-pushed.
   */
  const startMedia = useCallback(async () => {
    const info = joinInfoRef.current;
    if (!info) return;
    const generation = ++mediaGenerationRef.current;
    try {
      const media = await createMediaSession({
        roomUrl: info.roomUrl,
        meetingId,
        token: info.roomToken,
        e2ee: e2ee(),
        onError: (err) => setError(errorMessage(err))
      });
      if (generation !== mediaGenerationRef.current || !socketRef.current) {
        media.close();
        return;
      }
      sessionRef.current?.close();
      sessionRef.current = media;
      setSession(media);
    } catch (err) {
      setError(errorMessage(err, "Couldn't connect audio and video."));
    }
  }, [e2ee, meetingId]);

  const connect = useCallback(async () => {
    setFinalReason(null);
    setNotOpen(false);
    setLocal("joining");
    setError(null);
    try {
      const info = await meetingsApi.join(meetingId);
      selfUidRef.current = info.self.uid;
      joinInfoRef.current = info;
      if (info.key) await e2ee().setKey(info.key.key, info.key.epoch);
      socketRef.current?.close();
      dispatch({ t: "reset" });
      const socket = new RoomSocket({
        roomUrl: info.roomUrl,
        meetingId,
        token: info.roomToken,
        onMessage: (message) => handlerRef.current(message),
        onStatus: setSocketStatus,
        onFinalClose: (reason) => {
          setFinalReason(reason);
          teardown();
        }
      });
      socketRef.current = socket;
      setJoinInfo(info);
      // Media starts only after the room's admitted welcome (the SFU proxy requires an open socket).
      socket.connect();
      setLocal("active");
    } catch (err) {
      if (isNotOpenError(err)) {
        setNotOpen(true);
        setLocal("prejoin");
        return;
      }
      setError(errorMessage(err, "Couldn't join the meeting."));
      setLocal("error");
    }
  }, [e2ee, meetingId, teardown]);

  const addReaction = useCallback((burst: ReactionBurst) => {
    setReactions((prev) => [...prev.slice(-30), burst]);
    setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== burst.id)), REACTION_MS);
  }, []);

  const receiveChat = useCallback(
    async (message: Extract<MeetingServerMessage, { t: "chat" }>) => {
      const key = e2eeRef.current?.chatKeyFor(message.epoch);
      // The room stamps uid; a ciphertext sealed for any other sender, meeting or id fails here.
      const context = { meetingId, uid: message.uid, id: message.id };
      const text = key ? await decryptChat(key, message, context) : null;
      const entry: ChatEntry = {
        id: message.id,
        uid: message.uid,
        name: message.name,
        at: message.at,
        text,
        problem: !key ? "missing-key" : text === null ? "unverified" : null,
        own: message.uid === selfUidRef.current
      };
      setChat((prev) => (prev.some((m) => m.id === entry.id) ? prev : [...prev, entry].slice(-MAX_CHAT)));
    },
    [meetingId]
  );

  useEffect(() => {
    handlerRef.current = (message) => {
      dispatch(message);
      switch (message.t) {
        case "welcome":
          if (message.self.admitted) {
            setWelcomeCount((n) => n + 1);
            void startMedia();
          }
          break;
        case "admitted":
          // Re-join for an admitted ticket plus the key, then reconnect with it.
          void connect();
          break;
        case "rekey":
          meetingsApi
            .key(meetingId)
            .then((key) => e2eeRef.current?.setKey(key.key, key.epoch))
            .catch(() => undefined);
          break;
        case "muted":
          onMuted(message.kind, message.by);
          break;
        case "reaction":
          addReaction({
            id: `${message.uid}-${message.at}-${Math.random()}`,
            emoji: message.emoji,
            name: room.participants[message.uid]?.name ?? ""
          });
          break;
        case "chat":
          void receiveChat(message);
          break;
        case "removed":
        case "ended":
          teardown();
          break;
        default:
          break;
      }
    };
  }, [addReaction, connect, meetingId, onMuted, receiveChat, room.participants, startMedia, teardown]);

  useEffect(() => teardown, [teardown]);

  const sendChat = useCallback(
    async (text: string) => {
      const current = e2eeRef.current?.currentChat;
      const self = selfUidRef.current;
      if (!current || !self) return false;
      const id = crypto.randomUUID();
      const sealed = await encryptChat(current.key, current.epoch, text, { meetingId, uid: self, id });
      if (!send({ t: "chat", id, ...sealed })) return false;
      // Local echo; the room's fan-out copy (same id) is deduplicated.
      const own: ChatEntry = {
        id,
        uid: self,
        name: joinInfoRef.current?.self.name ?? "You",
        at: Date.now(),
        text,
        problem: null,
        own: true
      };
      setChat((prev) => (prev.some((m) => m.id === id) ? prev : [...prev, own].slice(-MAX_CHAT)));
      return true;
    },
    [meetingId, send]
  );

  const sendReaction = useCallback((emoji: MeetingReaction) => send({ t: "reaction", emoji }), [send]);

  const askAgain = useCallback(() => {
    void connect();
  }, [connect]);

  const leave = useCallback(() => {
    teardown();
    setLocal("left");
  }, [teardown]);

  return {
    stage: finalReason === "full" ? ("full" as const) : deriveStage(local, room.phase, Boolean(session)),
    error,
    notOpen,
    room,
    joinInfo,
    session,
    e2ee: e2eeRef,
    socketStatus,
    welcomeCount,
    chat,
    reactions,
    join: connect,
    askAgain,
    leave,
    send,
    sendChat,
    sendReaction
  };
}

export function isNotOpenError(err: unknown) {
  return err instanceof MeetingApiError && err.status === 400 && /opens at/i.test(err.message);
}

function deriveStage(local: LocalStage, phase: RoomState["phase"], hasMedia: boolean): CallStage {
  if (phase === "removed" || phase === "ended") return phase;
  if (local !== "active") return local;
  if (phase === "denied") return "denied";
  if (phase === "waiting") return "waiting";
  if (phase === "admitted" && hasMedia) return "incall";
  return "joining";
}
