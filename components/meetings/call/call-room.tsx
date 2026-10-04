"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Info, Settings, ShieldCheck, Volume2 } from "lucide-react";
import { NEVER } from "rxjs";
import { toast } from "sonner";
import type { MeetingParticipantView } from "@/src/lib/meetings/protocol";
import { screenTileId, type LayoutMode } from "@/src/lib/meetings/client/layout";
import { participantList, scribePresent } from "@/src/lib/meetings/client/room-state";
import { resumeAudio } from "@/src/lib/meetings/client/audio-level";
import { MeetingInfoDialog, DevicesDialog, HostControlsDialog } from "./call-dialogs";
import { ChatPanel } from "./chat-panel";
import { ControlsBar } from "./controls-bar";
import { RemoteAudio, unblockAllAudio, useObservableTrack } from "./media-elements";
import type { MoreAction } from "./more-menu";
import type { TileModel } from "./participant-tile";
import { PeoplePanel } from "./people-panel";
import { ReactionsOverlay } from "./reactions-overlay";
import { Stage } from "./stage";
import { TopBar } from "./top-bar";
import { useCallShortcuts, useConnectionQuality, useElapsed, useIsMobile, useSpeakers, useTrackLevel } from "./use-call-helpers";
import type { LocalMedia } from "./use-local-media";
import type { useMeetingCall } from "./use-meeting-call";
import { usePublish } from "./use-publish";

type Call = ReturnType<typeof useMeetingCall>;
type Panel = "chat" | "people" | null;
type DialogName = "info" | "devices" | "host" | null;

function SelfLevel({ track, uid, onLevel }: { track: MediaStreamTrack | undefined; uid: string; onLevel: (uid: string, level: number) => void }) {
  const report = useCallback((level: number) => onLevel(uid, level), [onLevel, uid]);
  useTrackLevel(track, report);
  return null;
}

function buildTiles(people: MeetingParticipantView[], selfUid: string | null, hideSelf: boolean): TileModel[] {
  const tiles: TileModel[] = [];
  for (const participant of people) {
    if (participant.isScribe) continue;
    const isSelf = participant.uid === selfUid;
    if (participant.screenOn && (isSelf || participant.tracks.screen)) {
      tiles.push({ id: screenTileId(participant.uid), participant, isSelf, isScreen: true });
    }
    if (!(isSelf && hideSelf)) tiles.push({ id: participant.uid, participant, isSelf, isScreen: false });
  }
  return tiles;
}

export function CallRoom({ meetingId, call, media }: { meetingId: string; call: Call; media: LocalMedia }) {
  const mobile = useIsMobile();
  const [layout, setLayout] = useState<LayoutMode>("auto");
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [hideSelf, setHideSelf] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [hand, setHand] = useState(false);
  const [seenChat, setSeenChat] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [joinedAt] = useState(() => Date.now());

  const { room, session, send } = call;
  const partyTracks = session?.partyTracks ?? null;
  const selfUid = room.selfUid;
  const { screenOn } = usePublish({ session, media, hand, send, welcomeCount: call.welcomeCount });
  const { activeSpeakerUid, speaking, onLevel } = useSpeakers();
  const quality = useConnectionQuality(partyTracks);
  const elapsed = useElapsed(joinedAt);

  const self = selfUid ? room.participants[selfUid] : undefined;
  // A host can lower our hand: follow the room when it goes from raised to lowered.
  const serverHandAt = self?.handRaisedAt ?? null;
  const prevServerHandAt = useRef<number | null>(null);
  useEffect(() => {
    if (prevServerHandAt.current !== null && serverHandAt === null) setHand(false);
    prevServerHandAt.current = serverHandAt;
  }, [serverHandAt]);

  const camera$ = useMemo(() => (media.videoOn ? media.camera.localMonitorTrack$ : NEVER), [media.videoOn, media.camera]);
  const mic$ = useMemo(() => (media.audioOn ? media.mic.localMonitorTrack$ : NEVER), [media.audioOn, media.mic]);
  const selfCamera = useObservableTrack(camera$);
  const selfMic = useObservableTrack(mic$);

  const people = useMemo(() => participantList(room), [room]);
  const tiles = useMemo(() => {
    const selfView: MeetingParticipantView | undefined = self
      ? { ...self, audioOn: media.audioOn, videoOn: media.videoOn, screenOn, handRaisedAt: hand ? (serverHandAt ?? joinedAt) : null }
      : undefined;
    const merged = people.map((p) => (p.uid === selfUid && selfView ? selfView : p));
    return buildTiles(merged, selfUid, hideSelf);
  }, [people, self, selfUid, media.audioOn, media.videoOn, screenOn, hand, serverHandAt, joinedAt, hideSelf]);

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
    hand: () => setHand((h) => !h),
    chat: () => togglePanel("chat")
  });

  const onAudioBlocked = useCallback(() => setAudioBlocked(true), []);

  const moreActions: MoreAction[] = [
    { id: "self", label: hideSelf ? "Show self view" : "Hide self view", icon: hideSelf ? <Eye /> : <EyeOff />, onSelect: () => setHideSelf((v) => !v) },
    { id: "devices", label: "Audio and video settings", icon: <Settings />, onSelect: () => setDialog("devices") },
    { id: "info", label: "Meeting info", icon: <Info />, onSelect: () => setDialog("info") },
    ...(room.isHost
      ? [{ id: "host", label: "Host controls", icon: <ShieldCheck />, onSelect: () => setDialog("host") }]
      : [])
  ];

  const remotes = people.filter((p) => p.uid !== selfUid && !p.isScribe);
  const meeting = call.joinInfo?.meeting;

  return (
    <div className="flex h-dvh flex-col bg-[var(--ink)]">
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
          className="flex items-center justify-center gap-2 bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Volume2 className="h-4 w-4" aria-hidden /> Tap to turn on sound
        </button>
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <Stage
            tiles={tiles}
            mode={layout}
            pinnedId={pinnedId}
            onPin={setPinnedId}
            activeSpeakerUid={activeSpeakerUid}
            speaking={speaking}
            mobile={mobile}
            partyTracks={partyTracks}
            e2ee={call.e2ee.current}
            selfTrack={selfCamera}
            onOpenPeople={() => setPanel("people")}
          />
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
            participants={people}
            waiting={room.waiting}
            send={send}
            onClose={() => setPanel(null)}
            mobile={mobile}
          />
        ) : null}
      </div>
      <ControlsBar
        mobile={mobile}
        audioOn={media.audioOn}
        videoOn={media.videoOn}
        sharing={Boolean(media.screen)}
        handRaised={hand}
        chatOpen={panel === "chat"}
        peopleOpen={panel === "people"}
        unread={unread}
        peopleCount={people.filter((p) => !p.isScribe).length}
        waitingCount={room.isHost ? room.waiting.length : 0}
        layout={layout}
        moreActions={moreActions}
        onLayout={setLayout}
        onMic={media.toggleAudio}
        onCamera={media.toggleVideo}
        onShare={toggleShare}
        onHand={() => setHand((h) => !h)}
        onReact={(emoji) => {
          if (!call.sendReaction(emoji)) toast.error("You're offline. Try again in a moment.");
        }}
        onChat={() => togglePanel("chat")}
        onPeople={() => togglePanel("people")}
        onLeave={call.leave}
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
      {selfUid && media.audioOn ? <SelfLevel track={selfMic} uid={selfUid} onLevel={onLevel} /> : null}

      {meeting ? (
        <MeetingInfoDialog open={dialog === "info"} onOpenChange={(o) => setDialog(o ? "info" : null)} meeting={meeting} isHost={room.isHost} />
      ) : null}
      <DevicesDialog open={dialog === "devices"} onOpenChange={(o) => setDialog(o ? "devices" : null)} media={media} />
      {room.isHost ? (
        <HostControlsDialog
          open={dialog === "host"}
          onOpenChange={(o) => setDialog(o ? "host" : null)}
          meetingId={meetingId}
          settings={room.settings}
        />
      ) : null}
    </div>
  );
}
