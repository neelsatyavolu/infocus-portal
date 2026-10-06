"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { MeetingClientMessage, MeetingReaction, MeetingServerMessage } from "@/src/lib/meetings/protocol";
import type { JoinResponse } from "@/src/lib/meetings/types";
import { toast } from "sonner";
import { MeetingApiError, errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { diagEvent, errorText } from "@/src/lib/meetings/client/diagnostics";
import { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";
import { KeyCatchUp } from "@/src/lib/meetings/client/key-catchup";
import { createMediaSession, type MeetingMediaSession } from "@/src/lib/meetings/client/media-session";
import { RoomSocket, backoffDelay, type RoomSocketStatus } from "@/src/lib/meetings/client/room-socket";
import { INITIAL_ROOM_STATE, resetForReconnect, roomReducer, type RoomState } from "@/src/lib/meetings/client/room-state";
import { TicketManager, fatalFromError, type TicketFatal } from "@/src/lib/meetings/client/ticket";
import { useCallChat } from "./use-call-chat";
import { useCallNetwork } from "./use-call-network";

export type { ChatEntry } from "./use-call-chat";

export type CallStage = "full" | "signin" | "prejoin" | "joining" | "waiting" | "denied" | "incall" | "left" | "removed" | "ended" | "error";

export type ReactionBurst = { id: string; emoji: MeetingReaction; name: string };

type LocalStage = "prejoin" | "joining" | "active" | "left" | "error";
type RoomAction = MeetingServerMessage | { t: "reset" };

function callRoomReducer(state: RoomState, action: RoomAction): RoomState {
  return action.t === "reset" ? resetForReconnect(state) : roomReducer(state, action);
}

const REACTION_MS = 3200;

export function useMeetingCall(meetingId: string, onMuted: (kind: "audio" | "video", by: string) => void) {
  const [room, dispatch] = useReducer(callRoomReducer, INITIAL_ROOM_STATE);
  const [local, setLocal] = useState<LocalStage>("prejoin");
  const [error, setError] = useState<string | null>(null);
  const [joinInfo, setJoinInfo] = useState<JoinResponse | null>(null);
  const [session, setSession] = useState<MeetingMediaSession | null>(null);
  const [socketStatus, setSocketStatus] = useState<RoomSocketStatus>("closed");
  const [welcomeCount, setWelcomeCount] = useState(0);
  const [reactions, setReactions] = useState<ReactionBurst[]>([]);
  /** Why the call can't go on: full room, or a /ticket or /key answer (ended, removed, signed out). */
  const [finalReason, setFinalReason] = useState<"full" | TicketFatal | null>(null);
  /** The Portal refused /join because the join window isn't open yet. */
  const [notOpen, setNotOpen] = useState(false);

  const e2eeRef = useRef<MeetingE2ee | null>(null);
  const socketRef = useRef<RoomSocket | null>(null);
  const sessionRef = useRef<MeetingMediaSession | null>(null);
  const ticketRef = useRef<TicketManager | null>(null);
  const catchUpRef = useRef<KeyCatchUp | null>(null);
  const handlerRef = useRef<(message: MeetingServerMessage) => void>(() => undefined);
  const selfUidRef = useRef<string | null>(null);
  const joinInfoRef = useRef<JoinResponse | null>(null);
  const mediaGenerationRef = useRef(0);
  /** Room clock minus ours (ms), from the latest message that carried `now` (watch-together timing). */
  const serverOffsetRef = useRef(0);
  const zombieAttemptRef = useRef(0);

  const e2ee = useCallback(() => {
    if (!e2eeRef.current) e2eeRef.current = new MeetingE2ee();
    return e2eeRef.current;
  }, []);

  const send = useCallback((message: MeetingClientMessage) => socketRef.current?.send(message) ?? false, []);
  const probe = useCallback(() => socketRef.current?.probe(), []);
  const { chat, receiveChat, sendChat } = useCallChat({
    meetingId,
    e2ee: e2eeRef,
    selfUid: selfUidRef,
    selfName: () => joinInfoRef.current?.self.name ?? "You",
    send
  });

  const teardown = useCallback(() => {
    mediaGenerationRef.current += 1;
    ticketRef.current?.stop();
    catchUpRef.current?.stop();
    socketRef.current?.close();
    socketRef.current = null;
    setSession(null);
    sessionRef.current?.close();
    sessionRef.current = null;
    e2eeRef.current?.destroy();
    e2eeRef.current = null;
  }, []);

  /** 410 → ended, 403 → removed, 401 → "sign in again". Ends the call either way. */
  const fail = useCallback(
    (kind: TicketFatal) => {
      diagEvent("call_fatal", { kind });
      setFinalReason(kind);
      teardown();
    },
    [teardown]
  );

  /**
   * A fresh SFU session for every admitted welcome (the room forgets a uid's media sessions when
   * its socket reconnects) and after a dead ("zombie") peer connection.
   */
  const startMedia = useCallback(async () => {
    const ticket = ticketRef.current;
    if (!ticket) return;
    const generation = ++mediaGenerationRef.current;
    try {
      const media = await createMediaSession({
        roomUrl: ticket.roomUrl,
        meetingId,
        ticket: { current: ticket.current, headers: ticket.headers },
        e2ee: e2ee(),
        onError: (err) => {
          diagEvent("media_error", { message: errorText(err) });
          setError(errorMessage(err));
        },
        onZombie: () => {
          if (generation !== mediaGenerationRef.current) return;
          const attempt = zombieAttemptRef.current++;
          // Refresh the ticket first (sessions/new fails with 401/403 on an expired one), then rebuild.
          setTimeout(() => {
            void ticket.refresh().then((token) => {
              if (token && generation === mediaGenerationRef.current) void startMediaRef.current();
            });
          }, backoffDelay(attempt));
        },
        onPeerConnection: (pc) => {
          probe();
          pc.addEventListener("connectionstatechange", () => {
            if (pc.connectionState === "connected") zombieAttemptRef.current = 0;
          });
        }
      });
      if (generation !== mediaGenerationRef.current || !socketRef.current) {
        media.close();
        return;
      }
      sessionRef.current?.close();
      sessionRef.current = media;
      setSession(media);
    } catch (err) {
      diagEvent("media_error", { message: errorText(err) });
      setError(errorMessage(err, "Couldn't connect audio and video."));
    }
  }, [e2ee, meetingId, probe]);
  const startMediaRef = useRef(startMedia);
  useEffect(() => {
    startMediaRef.current = startMedia;
  }, [startMedia]);

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
      ticketRef.current?.stop();
      catchUpRef.current?.stop();
      const admitted = info.state === "ADMITTED";
      const ticket = new TicketManager(info, {
        fetchTicket: () => meetingsApi.ticket(meetingId),
        onKey: (key) => void catchUpRef.current?.ensure(key.epoch, { rekey: true }),
        onFatal: fail,
        refreshable: admitted
      });
      ticketRef.current = ticket;
      catchUpRef.current = new KeyCatchUp({
        fetchKey: () => meetingsApi.key(meetingId),
        setKey: (key, options) => e2ee().setKey(key.key, key.epoch, options),
        currentEpoch: () => e2eeRef.current?.currentEpoch ?? -1,
        onFatal: fail
      });
      dispatch({ t: "reset" });
      const socket = new RoomSocket({
        roomUrl: info.roomUrl,
        meetingId,
        getToken: () => ticket.forConnect(),
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
      const fatal = fatalFromError(err);
      if (fatal === "signin") return fail("signin");
      setError(errorMessage(err, "Couldn't join the meeting."));
      setLocal("error");
    }
  }, [e2ee, fail, meetingId, teardown]);

  const addReaction = useCallback((burst: ReactionBurst) => {
    setReactions((prev) => [...prev.slice(-30), burst]);
    setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== burst.id)), REACTION_MS);
  }, []);

  useEffect(() => {
    handlerRef.current = (message) => {
      if ((message.t === "welcome" || message.t === "watch") && typeof message.now === "number") {
        serverOffsetRef.current = message.now - Date.now();
      }
      dispatch(message);
      switch (message.t) {
        case "welcome":
          if (message.self.admitted) {
            setWelcomeCount((n) => n + 1);
            // The room may have rekeyed while we were away: catch up before (and while) media starts.
            void catchUpRef.current?.ensure(message.epoch, { rekey: false });
            void startMedia();
          }
          break;
        case "admitted":
          // Re-join for an admitted ticket plus the key, then reconnect with it.
          void connect();
          break;
        case "rekey":
          void catchUpRef.current?.ensure(message.epoch, { rekey: true });
          break;
        case "muted":
          onMuted(message.kind, message.by);
          break;
        case "role":
          if (message.isHost && !room.isHost) toast("You're now the host.");
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
  }, [addReaction, connect, meetingId, onMuted, receiveChat, room.participants, room.isHost, startMedia, teardown]);

  useEffect(() => teardown, [teardown]);
  useCallNetwork(probe, local === "active");

  const sendReaction = useCallback((emoji: MeetingReaction) => send({ t: "reaction", emoji }), [send]);

  const askAgain = useCallback(() => {
    void connect();
  }, [connect]);

  /** Deliberate leave: tell the room first (hands host off at once), then close. */
  const leave = useCallback(async () => {
    diagEvent("leave_click");
    await socketRef.current?.sendAndFlush({ t: "leave" }).catch(() => false);
    teardown();
    setLocal("left");
  }, [teardown]);

  return {
    stage: finalReason ?? deriveStage(local, room.phase, Boolean(session)),
    error,
    notOpen,
    room,
    joinInfo,
    session,
    e2ee: e2eeRef,
    serverOffset: serverOffsetRef,
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
