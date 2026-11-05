"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Volume2 } from "lucide-react";
import { NEVER } from "rxjs";
import { toast } from "sonner";
import { WATCH_TILE_ID, type LayoutMode } from "@/src/lib/meetings/client/layout";
import { participantList, scribePresent } from "@/src/lib/meetings/client/room-state";
import { handQueue } from "@/src/lib/meetings/client/hands";
import { shouldMonitorMic } from "@/src/lib/meetings/client/mic-monitor";
import { resumeAudio } from "@/src/lib/meetings/client/audio-level";
import { holdUploadWakeLock as holdScreenWakeLock } from "@/src/lib/upload-wake-lock";
import { cn } from "@/src/lib/utils";
import { DevicesDialog, MeetingDialog } from "./call-dialogs";
import { SelfLevel, buildTiles } from "./call-room-parts";
import { CallRailStatus, CallStatusBar, ReconnectingNotice } from "./call-status";
import { callStatusItems, phoneStatusItems } from "./call-status-model";
import { CallToastOffset, callToastOffsets } from "./call-toast-offset";
import { ChatPanel } from "./chat-panel";
import { LeaveDialog } from "./leave-dialog";
import { ControlsBar, type ControlsForm, type ControlsProps } from "./controls-bar";
import { RemoteAudio, unblockAllAudio, useObservableTrack } from "./media-elements";
import { PanelTabsProvider } from "./panel-tabs";
import { PeoplePanel } from "./people-panel";
import { AgendaPanel, useCallAgenda } from "../agenda/agenda-panel";
import { agendaProgress } from "@/src/lib/meetings/agenda";
import { ReactionsOverlay } from "./reactions-overlay";
import { WaitingBanner } from "./waiting-banner";
import { Stage } from "./stage";
import { SelfPip } from "./self-pip";
import {
  canShareScreen,
  useCallShortcuts,
  useConnectionQuality,
  useIsLandscape,
  useIsMobile,
  useLockPageScroll,
  useSpeakers
} from "./use-call-helpers";
import type { LocalMedia } from "./use-local-media";
import type { useMeetingCall } from "./use-meeting-call";
import { useChimes } from "./use-chimes";
import { useHand } from "./use-hand";
import { useMicPrewarm } from "./use-mic-prewarm";
import { useCallDiagnostics } from "./use-call-diagnostics";
import { usePublish } from "./use-publish";
import { CutPickerDialog } from "../watch/cut-picker-dialog";
import { useWatchParty } from "../watch/use-watch-party";
import { WatchTile } from "../watch/watch-tile";

type Call = ReturnType<typeof useMeetingCall>;

/** Shared screen sound never drives the speaking ring. */
const ignoreLevel = () => undefined;
type Panel = "chat" | "people" | "agenda" | null;
type DialogName = "info" | "devices" | "host" | "leave" | "watch" | null;

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
  useCallDiagnostics({
    send,
    partyTracks,
    room,
    socketStatus: call.socketStatus,
    e2ee: call.e2ee.current,
    audioOn: media.audioOn,
    videoOn: media.videoOn,
    voiceIsolation: media.voiceIsolation,
    background: media.settings.background,
    audioBlocked
  });

  const self = selfUid ? room.participants[selfUid] : undefined;
  const agenda = useCallAgenda(meetingId, room.agendaVersion, call.welcomeCount);
  const serverHandAt = self?.handRaisedAt ?? null;
  const { hand, toggleHand, onSelfLevel } = useHand(serverHandAt, media.audioOn);
  useChimes(room, call.welcomeCount, media.settings.chimes, media.speakerId);
  const { screenOn } = usePublish({ session, media, hand, send, welcomeCount: call.welcomeCount });
  const watchParty = useWatchParty({ watch: room.watch, selfUid, send, serverOffset: call.serverOffset });

  const camera$ = useMemo(() => (media.videoOn ? media.camera.localMonitorTrack$ : NEVER), [media.videoOn, media.camera]);
  // Self level (speaking ring, hand auto-lower) only while unmuted; the settings dialog monitors on its own.
  const { prewarm, onMicIntent } = useMicPrewarm(media.audioOn);
  const monitorSelf = shouldMonitorMic({ screen: "call", settingsOpen: false, audioOn: media.audioOn, prewarm });
  const mic$ = useMemo(() => (monitorSelf ? media.mic.localMonitorTrack$ : NEVER), [monitorSelf, media.mic]);
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
  const [prevSharerId, setPrevSharerId] = useState<string | null>(null);
  if (sharerId !== prevSharerId) {
    setPrevSharerId(sharerId);
    if (sharerId) setPinnedId((current) => (current && current !== sharerId && current !== WATCH_TILE_ID ? current : null));
  }
  // A new watch-together video takes the stage too (the newest of the two wins).
  const watchId = room.watch?.id ?? null;
  const [prevWatchId, setPrevWatchId] = useState<string | null>(null);
  if (watchId !== prevWatchId) {
    setPrevWatchId(watchId);
    if (watchId) setPinnedId(WATCH_TILE_ID);
  }

  // Coming back (screen unlocked, a phone call or Siri ended, bfcache): iOS leaves remote <audio>
  // paused without a play() rejection, so the room looks connected but is silent. Restart them.
  useEffect(() => {
    const restart = () => {
      if (document.visibilityState === "visible") unblockAllAudio();
    };
    document.addEventListener("visibilitychange", restart);
    window.addEventListener("pageshow", restart);
    return () => {
      document.removeEventListener("visibilitychange", restart);
      window.removeEventListener("pageshow", restart);
    };
  }, []);

  // Keep the screen awake for the whole call: a phone that auto-locks suspends the mic and the call.
  useEffect(() => {
    let release: (() => void) | null = null;
    let left = false;
    void holdScreenWakeLock().then((done) => {
      if (left) done();
      else release = done;
    });
    return () => {
      left = true;
      release?.();
    };
  }, []);

  const unread = panel === "chat" ? 0 : Math.max(0, call.chat.length - seenChat);
  if (panel === "chat" && seenChat !== call.chat.length) setSeenChat(call.chat.length);

  const togglePanel = useCallback((next: Exclude<Panel, null>) => setPanel((cur) => (cur === next ? null : next)), []);
  const toggleShare = useCallback(() => (media.screen ? media.stopScreenShare() : media.startScreenShare()), [media]);

  useCallShortcuts({
    mic: media.toggleAudio,
    camera: media.toggleVideo,
    hand: toggleHand,
    chat: () => togglePanel("chat")
  });

  const onAudioBlocked = useCallback(() => setAudioBlocked(true), []);

  const remotes = people.filter((p) => p.uid !== selfUid && !p.isScribe);
  const meeting = call.joinInfo?.meeting;

  // Layout and status: plain values from state the call already has (no new hooks here).
  const form: ControlsForm = !mobile ? "desktop" : landscape ? "rail" : "phone";
  const peopleCount = people.filter((p) => !p.isScribe).length;
  const waitingCount = room.isHost ? room.waiting.length : 0;
  const agendaRemaining = agenda.items ? agendaProgress(agenda.items).remaining : 0;
  const selfHand = selfUid ? hands[selfUid] : undefined;
  const reconnecting = call.socketStatus === "reconnecting";
  const statusItems = callStatusItems({
    reconnecting,
    waitingCount,
    selfHand,
    handsTotal: Object.keys(hands).length,
    presenting: Boolean(media.screen),
    notesOn: scribePresent(room),
    quality
  });
  const openPeople = () => setPanel("people");
  const toastOffsets = callToastOffsets(form, !mobile && panel !== null);
  const title = meeting?.title ?? "Meeting";

  // The one primary area in the view; on a phone on its side it sits over the top of the stage.
  const audioBanner = audioBlocked ? (
    <button
      type="button"
      onClick={() => {
        resumeAudio();
        unblockAllAudio();
        setAudioBlocked(false);
      }}
      className={cn(
        "flex min-h-11 shrink-0 items-center justify-center gap-2 bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-[var(--brand-fill-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--on-brand)]",
      )}
    >
      <Volume2 className="h-4 w-4" aria-hidden /> Tap to start audio
    </button>
  ) : null;

  // Hosts: someone is waiting and People isn't open (the panel lists them itself).
  const waitingBanner =
    room.isHost && room.waiting.length > 0 && panel !== "people" ? (
      <WaitingBanner meetingId={meetingId} waiting={room.waiting} mobile={mobile} onView={openPeople} />
    ) : null;

  const controls: ControlsProps = {
    form,
    audioOn: media.audioOn,
    videoOn: media.videoOn,
    sharing: Boolean(media.screen),
    canShare: shareSupported,
    shareSound: media.settings.shareSound,
    handRaised: hand,
    handPosition: selfHand,
    panel,
    agendaRemaining,
    unread,
    peopleCount,
    waitingCount,
    isHost: room.isHost,
    selfHidden: hideSelf,
    layout,
    layoutAlone: stageTiles.length + (room.watch ? 1 : 0) <= 1,
    onLayout: setLayout,
    onMic: media.toggleAudio,
    onMicIntent,
    onCamera: media.toggleVideo,
    onShare: toggleShare,
    onShareSound: (on) => media.updateSettings({ shareSound: on }),
    onWatch: () => setDialog("watch"),
    onHand: toggleHand,
    onReact: (emoji) => {
      if (!call.sendReaction(emoji)) toast.error("You're offline. Try again in a moment.");
    },
    onChat: () => togglePanel("chat"),
    onPeople: () => togglePanel("people"),
    onAgenda: () => togglePanel("agenda"),
    onDetails: () => setDialog("info"),
    onHostSettings: () => setDialog("host"),
    onDevices: () => setDialog("devices"),
    onToggleSelf: () => setHideSelf((v) => !v),
    onLeave: () => setDialog("leave")
  };

  // Portaled to <body>: the page-entrance wrapper (app/template.tsx) keeps a transform animation in
  // effect, which makes it the containing block for `fixed` children and collapsed the call to 0px.
  return createPortal(
    <div className="fixed inset-0 flex touch-manipulation flex-col overflow-hidden overscroll-none bg-[var(--ink)]">
      <CallToastOffset bottom={toastOffsets.bottom} right={toastOffsets.right} />
      {form !== "rail" ? (
        <>
          <CallStatusBar
            title={title}
            since={joinedAt}
            items={form === "phone" ? phoneStatusItems(statusItems, 2) : statusItems}
            mobile={mobile}
            onOpenDetails={() => setDialog("info")}
            onOpenPeople={openPeople}
          />
          {audioBanner}
          {waitingBanner}
        </>
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        {/* On a phone on its side the stage runs edge to edge: keep tiles clear of the notch. */}
        <div className={cn("relative min-w-0 flex-1", form === "rail" && "ml-[env(safe-area-inset-left)]")}>
          {form === "rail" && (audioBanner || waitingBanner) ? (
            // Stacked over the top of the stage; Reconnecting sits just below the stack.
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col">
              <div className="pointer-events-auto flex flex-col">
                {audioBanner}
                {waitingBanner}
              </div>
              {mobile ? <ReconnectingNotice on={reconnecting} className="relative mt-2" /> : null}
            </div>
          ) : mobile ? (
            // Phones say "Reconnecting" in words here (desktop keeps it in the status bar).
            <ReconnectingNotice on={reconnecting} className="top-2" />
          ) : null}
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
            onOpenPeople={openPeople}
            watch={
              room.watch
                ? (placement) => (
                    <WatchTile party={watchParty} placement={placement} sinkId={media.speakerId} onChange={() => setDialog("watch")} />
                  )
                : undefined
            }
            selfPip={
              selfInPip
                ? (strip) => (
                    <SelfPip
                      track={selfCamera}
                      videoOn={media.videoOn}
                      audioOn={media.audioOn}
                      name={self?.name ?? "You"}
                      landscape={landscape}
                      handPosition={selfHand}
                      mirror={media.settings.mirror}
                      strip={strip}
                    />
                  )
                : undefined
            }
          />
          <ReactionsOverlay reactions={call.reactions} />
        </div>
        <PanelTabsProvider
          active={panel}
          onSelect={setPanel}
          counts={{ people: peopleCount, waiting: waitingCount, unread, agendaLeft: agendaRemaining }}
        >
          {panel === "chat" ? (
            <ChatPanel messages={call.chat} onSend={call.sendChat} onClose={() => setPanel(null)} mobile={mobile} />
          ) : null}
          {panel === "agenda" ? (
            <AgendaPanel meetingId={meetingId} agenda={agenda} selfName={self?.name ?? null} onClose={() => setPanel(null)} mobile={mobile} />
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
        </PanelTabsProvider>
        {form === "rail" ? (
          // Phone on its side: no top bar. Time, lock and status lead the rail; the six controls
          // never shrink, so Leave stays on screen however short the viewport is.
          <div className="flex w-[calc(72px+env(safe-area-inset-right))] shrink-0 flex-col items-center gap-2 border-l border-[var(--ink-4)] bg-[var(--ink)] pb-[max(0.5rem,env(safe-area-inset-bottom))] pr-[env(safe-area-inset-right)] pt-[max(0.5rem,env(safe-area-inset-top))]">
            <CallRailStatus title={title} since={joinedAt} items={phoneStatusItems(statusItems, 1)} onOpenPeople={openPeople} />
            <ControlsBar {...controls} />
          </div>
        ) : null}
      </div>
      {form !== "rail" ? <ControlsBar {...controls} /> : null}

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
      {remotes
        .filter((p) => p.screenOn && p.tracks.screenAudio)
        .map((p) => (
          <RemoteAudio
            key={`${p.uid}:screen`}
            partyTracks={partyTracks}
            meta={p.tracks.screenAudio}
            uid={`${p.uid}:screen`}
            sinkId={media.speakerId}
            onLevel={ignoreLevel}
            onBlocked={onAudioBlocked}
          />
        ))}
      {selfUid && media.audioOn ? <SelfLevel track={selfMic} uid={selfUid} onLevel={onLevel} onSelfLevel={onSelfLevel} /> : null}

      <MeetingDialog
        open={dialog === "info" || dialog === "host"}
        onOpenChange={(o) => setDialog(o ? (dialog === "host" ? "host" : "info") : null)}
        focus={dialog === "host" ? "host" : "info"}
        meetingId={meetingId}
        meeting={meeting}
        isHost={room.isHost}
        settings={room.settings}
        selfUid={selfUid}
      />
      <DevicesDialog
        open={dialog === "devices"}
        onOpenChange={(o) => setDialog(o ? "devices" : null)}
        media={media}
        peopleCount={peopleCount}
      />
      <CutPickerDialog
        open={dialog === "watch"}
        onOpenChange={(o) => setDialog(o ? "watch" : null)}
        replacing={Boolean(room.watch)}
        onWatch={watchParty.start}
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
    </div>,
    document.body
  );
}
