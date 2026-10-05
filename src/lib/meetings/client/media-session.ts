import { PartyTracks } from "partytracks/client";
import { EMPTY, catchError, of, retry, timer, type MonoTypeOperatorFunction, type Subscription } from "rxjs";
import { backoffDelay } from "./room-socket";
import { diagEvent, errorText } from "./diagnostics";
import type { MeetingE2ee } from "./e2ee";
import { PullRegistry } from "./pull-registry";

export function partyTracksPrefix(roomUrl: string, meetingId: string) {
  return `${roomUrl.replace(/\/+$/, "")}/rooms/${encodeURIComponent(meetingId)}/partytracks`;
}

/** The room ticket for the SFU proxy: `current` for the query string, `headers` (live) for Authorization. */
export type MediaTicket = { current: string; headers?: Headers };

const ICE_ATTEMPTS = 3;

/**
 * partytracks fetches `${prefix}/generate-ice-servers` without our auth, so the TURN credentials
 * are fetched here: 3 tries with backoff. A STUN-only fallback is logged (and the next media
 * restart tries TURN again) instead of silently staying STUN-only.
 */
export async function fetchIceServers(
  prefix: string,
  ticket: MediaTicket,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<RTCIceServer[] | undefined> {
  for (let attempt = 0; attempt < ICE_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(backoffDelay(attempt));
    try {
      const response = await fetch(`${prefix}/generate-ice-servers?token=${encodeURIComponent(ticket.current)}`, {
        headers: ticket.headers
      });
      if (response.ok) {
        const body = (await response.json()) as { iceServers?: RTCIceServer[] };
        if (Array.isArray(body.iceServers) && body.iceServers.length > 0) return body.iceServers;
      }
      diagEvent("proxy_error", { route: "generate-ice-servers", status: response.status, attempt });
    } catch (error) {
      diagEvent("proxy_error", { route: "generate-ice-servers", message: errorText(error), attempt });
    }
  }
  diagEvent("turn_fallback_stun");
  return undefined;
}

/** Retries a push/pull with jittered backoff (the room proxy answers 429 above 60 calls per 10 s). */
export function withBackoff<T>(label = "media"): MonoTypeOperatorFunction<T> {
  return retry({
    count: 6,
    delay: (error, attempt) => {
      // Push/pull errors (a 429/403 from the room proxy shows up in the message).
      diagEvent("media_retry", { op: label, attempt, message: errorText(error) });
      return timer(backoffDelay(attempt));
    }
  });
}

const STUN_FALLBACK: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

/** A media session whose peer connection hasn't connected for this long is dead: rebuild it. */
export const ZOMBIE_AFTER_MS = 15_000;

export type ZombieReason = "no_session_id" | "not_connected";

export type MeetingMediaSession = {
  partyTracks: PartyTracks;
  /** Shared pulls (one per remote track); see pull-registry.ts. */
  pulls: PullRegistry;
  close: () => void;
};

const registries = new WeakMap<PartyTracks, PullRegistry>();

/** The shared pull registry of a media session (usePulledTrack). */
export function pullRegistryFor(partyTracks: PartyTracks) {
  return registries.get(partyTracks) ?? null;
}

/**
 * Watches the session: partytracks turns a failed sessions/new (401/403/429) into a sessionId of
 * undefined and a peer connection that never connects or retries. Either sign, or a PC that isn't
 * "connected" for 15 s straight, reports a zombie once so the caller can rebuild.
 */
export function watchSession(
  partyTracks: Pick<PartyTracks, "session$">,
  onZombie: (reason: ZombieReason) => void,
  onPeerConnection: (pc: RTCPeerConnection) => void,
  zombieAfterMs = ZOMBIE_AFTER_MS
): Subscription {
  let reported = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let pc: RTCPeerConnection | null = null;
  const report = (reason: ZombieReason) => {
    if (reported) return;
    reported = true;
    onZombie(reason);
  };
  const arm = () => {
    if (timerId) clearTimeout(timerId);
    timerId = null;
    if (pc && pc.connectionState !== "connected") timerId = setTimeout(() => report("not_connected"), zombieAfterMs);
  };
  const onState = () => arm();
  const subscription = partyTracks.session$.subscribe({
    next: ({ peerConnection, sessionId }) => {
      pc?.removeEventListener("connectionstatechange", onState);
      pc = peerConnection;
      onPeerConnection(peerConnection);
      if (!sessionId) {
        report("no_session_id");
        return;
      }
      pc.addEventListener("connectionstatechange", onState);
      arm();
    },
    error: () => report("not_connected")
  });
  subscription.add(() => {
    if (timerId) clearTimeout(timerId);
    pc?.removeEventListener("connectionstatechange", onState);
  });
  return subscription;
}

/**
 * Creates the SFU session for an admitted ticket and wires E2EE onto every transceiver as soon as
 * partytracks adds it (before negotiation, so no frame leaves or renders unencrypted). partytracks
 * (patched) emits transceivers on a plain Subject, so we subscribe here, before any push or pull.
 */
export async function createMediaSession(input: {
  roomUrl: string;
  meetingId: string;
  ticket: MediaTicket;
  e2ee: MeetingE2ee;
  onError?: (error: unknown) => void;
  onZombie?: (reason: ZombieReason) => void;
  onPeerConnection?: (pc: RTCPeerConnection) => void;
}): Promise<MeetingMediaSession> {
  const prefix = partyTracksPrefix(input.roomUrl, input.meetingId);
  const iceServers = (await fetchIceServers(prefix, input.ticket)) ?? STUN_FALLBACK;
  const partyTracks = new PartyTracks({
    prefix,
    // Authorization (live, refreshed in place) is preferred by the Worker; the query token stays
    // for Workers that don't read the header yet.
    apiExtraParams: new URLSearchParams({ token: input.ticket.current }).toString(),
    ...(input.ticket.headers ? { headers: input.ticket.headers } : {}),
    iceServers
  });
  // Fail closed: every transceiver gets its transform or is stopped, and after close() any
  // transceiver partytracks still creates is stopped before it can carry media.
  let closed = false;
  const subscription: Subscription = partyTracks.transceiver$.subscribe((transceiver) => {
    if (closed) {
      stopQuietly(transceiver);
      return;
    }
    try {
      input.e2ee.attach(transceiver);
    } catch (error) {
      stopQuietly(transceiver);
      input.onError?.(error);
    }
  });
  let pc: RTCPeerConnection | null = null;
  const watch = watchSession(
    partyTracks,
    (reason) => {
      diagEvent("media_zombie", { reason });
      input.onZombie?.(reason);
    },
    (next) => {
      pc = next;
      input.onPeerConnection?.(next);
    }
  );
  const pulls = new PullRegistry(
    (meta, rid$) =>
      (rid$ ? partyTracks.pull(of(meta), { simulcast: { preferredRid$: rid$ } }) : partyTracks.pull(of(meta))).pipe(
        withBackoff("pull"),
        catchError((error) => {
          diagEvent("pull_failed", { sid: meta.sessionId.slice(0, 8), message: errorText(error) });
          return EMPTY;
        })
      ),
    // A released pull's track is gone: stop tracking its decrypt failures (here and in the worker).
    (track) => input.e2ee.forget(track.id)
  );
  registries.set(partyTracks, pulls);
  return {
    partyTracks,
    pulls,
    close: () => {
      if (closed) return;
      // Media first, the transceiver$ guard last: stop everything on the current peer connection,
      // keep stopping late transceivers while callers unsubscribe their pushes and pulls, then let go.
      closed = true;
      (pc as RTCPeerConnection | null)?.getTransceivers().forEach(stopQuietly);
      watch.unsubscribe();
      setTimeout(() => subscription.unsubscribe(), CLOSE_GUARD_MS);
    }
  };
}

/** How long a closed session keeps stopping late transceivers (callers drop pushes/pulls well within this). */
export const CLOSE_GUARD_MS = 10_000;

function stopQuietly(transceiver: RTCRtpTransceiver) {
  try {
    void transceiver.sender.replaceTrack(null).catch(() => undefined);
    transceiver.stop();
  } catch {
    // Already stopped or the peer connection is closed.
  }
}
