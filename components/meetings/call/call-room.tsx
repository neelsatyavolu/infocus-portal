"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, Settings, ShieldCheck, Volume2 } from "lucide-react";
import { NEVER } from "rxjs";
import { toast } from "sonner";
import type { LayoutMode } from "@/src/lib/meetings/client/layout";
import { participantList, scribePresent } from "@/src/lib/meetings/client/room-state";
import { handQueue } from "@/src/lib/meetings/client/hands";
import { resumeAudio } from "@/src/lib/meetings/client/audio-level";
import { MeetingInfoDialog, DevicesDialog, HostControlsDialog } from "./call-dialogs";
import { SelfLevel, buildTiles } from "./call-room-parts";
import { ChatPanel } from "./chat-panel";
import { LeaveDialog } from "./leave-dialog";
import { ControlsBar } from "./controls-bar";
import { RemoteAudio, unblockAllAudio, useObservableTrack } from "./media-elements";
import type { MoreAction } from "./more-menu";
import { PeoplePanel } from "./people-panel";
import { ReactionsOverlay } from "./reactions-overlay";
import { Stage } from "./stage";
import { TopBar } from "./top-bar";
import { SelfPip } from "./self-pip";
import {
  canShareScreen,
  useCallShortcuts,
  useConnectionQuality,
  useElapsed,
  useIsLandscape,
  useIsMobile,
  useLockPageScroll,
  useSpeakers
} from "./use-call-helpers";
import type { LocalMedia } from "./use-local-media";
import type { useMeetingCall } from "./use-meeting-call";
import { useChimes } from "./use-chimes";
import { useHand } from "./use-hand";
import { usePublish } from "./use-publish";

type Call = ReturnType<typeof useMeetingCall>;
type Panel = "chat" | "people" | null;
type DialogName = "info" | "devices" | "host" | "leave" | null;

export function CallRoom({
  meetingId,
  call,
  media,
  onLeave
}: {
  meetingId: string;
  call: Call;
  media: LocalMedia;
  onLeave: () => void;
}) {
  const mobile = useIsMobile();
  const landscape = useIsLandscape();
  const [shareSupported] = useState(canShareScreen);
  useLockPageScroll();
  const [layout, setLayout] = useState<LayoutMode>("auto");
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [hideSelf, setHideSelf] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [seenChat, setSeenChat] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [joinedAt] = useState(() => Date.now());

  const { room, session, send } = call;
  const partyTracks = session?.partyTracks ?? null;
  const selfUid = room.selfUid;
  const { activeSpeakerUid, speaking, onLevel } = useSpeakers();
  const quality = useConnectionQuality(partyTracks);
  const elapsed = useElapsed(joinedAt);

  const self = selfUid ? room.participants[selfUid] : undefined;
  const serverHandAt = self?.handRaisedAt ?? null;
  const { hand, toggleHand, onSelfLevel } = useHand(serverHandAt, media.audioOn);
  useChimes(room, call.welcomeCount, media.settings.chimes, media.speakerId);
  const { screenOn } = usePublish({ session, media, hand, send, welcomeCount: call.welcomeCount });

  const camera$ = useMemo(() => (media.videoOn ? media.camera.localMonitorTrack$ : NEVER), [media.videoOn, media.camera]);
  const mic$ = useMemo(() => (media.audioOn ? media.mic.localMonitorTrack$ : NEVER), [media.audioOn, media.mic]);
  const selfCamera = useObservableTrack(camera$);
  const selfMic = useObservableTrack(mic$);

  const people = useMemo(() => participantList(room), [room]);
  // Our own state shows instantly; until the room confirms a raised hand it queues last.
  const merged = useMemo(() => {
    if (!self) return people;
    const handRaisedAt = hand ? (serverHandAt ?? Number.MAX_SAFE_INTEGER) : null;
    const selfView = { ...self, audioOn: media.audioOn, videoOn: media.videoOn, screenOn, handRaisedAt };
    return people.map((p) => (p.uid === selfUid ? selfView : p));
  }, [people, self, selfUid, media.audioOn, media.videoOn, screenOn, hand, serverHandAt]);
  const hands = useMemo(() => handQueue(merged), [merged]);
  const tiles = useMemo(() => buildTiles(merged, selfUid, hideSelf), [merged, selfUid, hideSelf]);

  // Phones show self view as a small corner tile once anyone else is on stage.
  const selfInPip = mobile && !hideSelf && tiles.some((t) => !t.isSelf);
  const stageTiles = selfInPip ? tiles.filter((t) => !(t.isSelf && !t.isScreen)) : tiles;

  // A new screen share takes the stage unless someone is pinned.
  const sharerId = tiles.find((t) => t.isScreen && !t.isSelf)?.id ?? null;
  useEffect(() => {
    if (sharerId) setPinnedId((current) => (current && current !== sharerId ? current : null));
  }, [sharerId]);

  const unread = panel === "chat" ? 0 : Math.max(0, call.chat.length - seenChat);
  useEffect(() => {
    if (panel === "chat") setSeenChat(call.chat.length);
  }, [panel, call.chat.length]);

  const togglePanel = useCallback((next: Exclude<Panel, null>) => setPanel((cur) => (cur === next ? null : next)), []);
  const toggleShare = useCallback(() => (media.screen ? media.stopScreenShare() : media.startScreenShare()), [media]);

  useCallShortcuts({
    mic: media.toggleAudio,
    camera: media.toggleVideo,
    hand: toggleHand,
    chat: () => togglePanel("chat")
  });

  const onAudioBlocked = useCallback(() => setAudioBlocked(true), []);

  const moreActions: MoreAction[] = [
    { id: "self", label: hideSelf ? "Show self view" : "Hide self view", icon: hideSelf ? <Eye /> : <EyeOff />, onSelect: () => setHideSelf((v) => !v) },
    { id: "devices", label: "Audio and video settings", icon: <Settings />, onSelect: () => setDialog("devices") },
    ...(room.isHost
      ? [{ id: "host", label: "Host controls", icon: <ShieldCheck />, onSelect: () => setDialog("host") }]
      : [])
  ];

  const remotes = people.filter((p) => p.uid !== selfUid && !p.isScribe);
  const meeting = call.joinInfo?.meeting;

  // Portaled to <body>: the page-entrance wrapper (app/template.tsx) keeps a transform animation in
  // effect, which makes it the containing block for `fixed` children and collapsed the call to 0px.
  return createPortal(
    <div className="fixed inset-0 flex touch-manipulation flex-col overflow-hidden overscroll-none bg-[var(--ink)]">
      <TopBar
        title={meeting?.title ?? "Meeting"}
        elapsedMs={elapsed}
        notesOn={scribePresent(room)}
        quality={quality}
        reconnecting={call.socketStatus === "reconnecting"}
      />
      {audioBlocked ? (
        <button
          type="button"
          onClick={() => {
            resumeAudio();
            unblockAllAudio();
            setAudioBlocked(false);
          }}
          className="flex min-h-11 items-center justify-center gap-2 bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Volume2 className="h-4 w-4" aria-hidden /> Tap to start audio
        </button>
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <Stage
            tiles={stageTiles}
            mode={layout}
            pinnedId={pinnedId}
            onPin={setPinnedId}
            activeSpeakerUid={activeSpeakerUid}
            speaking={speaking}
            mobile={mobile}
            landscape={landscape}
            partyTracks={partyTracks}
            e2ee={call.e2ee.current}
            selfTrack={selfCamera}
            hands={hands}
            receive={media.settings.receiveQuality}
            mirrorSelf={media.settings.mirror}
            onOpenPeople={() => setPanel("people")}
          />
          {selfInPip ? (
            <SelfPip
              track={selfCamera}
              videoOn={media.videoOn}
              audioOn={media.audioOn}
              name={self?.name ?? "You"}
              landscape={landscape}
              handPosition={selfUid ? hands[selfUid] : undefined}
              mirror={media.settings.mirror}
            />
          ) : null}
          <ReactionsOverlay reactions={call.reactions} />
        </div>
        {panel === "chat" ? (
          <ChatPanel messages={call.chat} onSend={call.sendChat} onClose={() => setPanel(null)} mobile={mobile} />
        ) : null}
        {panel === "people" ? (
          <PeoplePanel
            meetingId={meetingId}
            selfUid={selfUid}
            isHost={room.isHost}
            participants={merged}
            hands={hands}
            waiting={room.waiting}
            send={send}
            onClose={() => setPanel(null)}
            mobile={mobile}
          />
        ) : null}
      </div>
      <ControlsBar
        mobile={mobile}
        title={meeting?.title ?? "Meeting"}
        audioOn={media.audioOn}
        videoOn={media.videoOn}
        sharing={Boolean(media.screen)}
        canShare={shareSupported}
        handRaised={hand}
        handPosition={selfUid ? hands[selfUid] : undefined}
        chatOpen={panel === "chat"}
        peopleOpen={panel === "people"}
        unread={unread}
        peopleCount={people.filter((p) => !p.isScribe).length}
        waitingCount={room.isHost ? room.waiting.length : 0}
        layout={layout}
        layoutAlone={stageTiles.length <= 1}
        moreActions={moreActions}
        onLayout={setLayout}
        onMic={media.toggleAudio}
        onCamera={media.toggleVideo}
        onShare={toggleShare}
        onHand={toggleHand}
        onReact={(emoji) => {
          if (!call.sendReaction(emoji)) toast.error("You're offline. Try again in a moment.");
        }}
        onChat={() => togglePanel("chat")}
        onPeople={() => togglePanel("people")}
        onInfo={() => setDialog("info")}
        onLeave={() => setDialog("leave")}
      />

      {remotes.map((p) => (
        <RemoteAudio
          key={p.uid}
          partyTracks={partyTracks}
          meta={p.tracks.audio}
          uid={p.uid}
          sinkId={media.speakerId}
          onLevel={onLevel}
          onBlocked={onAudioBlocked}
        />
      ))}
      {selfUid && media.audioOn ? <SelfLevel track={selfMic} uid={selfUid} onLevel={onLevel} onSelfLevel={onSelfLevel} /> : null}

      {meeting ? (
        <MeetingInfoDialog open={dialog === "info"} onOpenChange={(o) => setDialog(o ? "info" : null)} meeting={meeting} isHost={room.isHost} />
      ) : null}
      <DevicesDialog
        open={dialog === "devices"}
        onOpenChange={(o) => setDialog(o ? "devices" : null)}
        media={media}
        peopleCount={people.filter((p) => !p.isScribe).length}
      />
      <LeaveDialog
        open={dialog === "leave"}
        onOpenChange={(o) => setDialog(o ? "leave" : null)}
        meetingId={meetingId}
        isHost={room.isHost}
        selfUid={selfUid}
        participants={people}
        onLeave={onLeave}
      />
      {room.isHost ? (
        <HostControlsDialog
          open={dialog === "host"}
          onOpenChange={(o) => setDialog(o ? "host" : null)}
          meetingId={meetingId}
          settings={room.settings}
        />
      ) : null}
    </div>,
    document.body
  );
}
