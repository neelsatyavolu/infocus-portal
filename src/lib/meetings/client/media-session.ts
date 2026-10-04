import { PartyTracks } from "partytracks/client";
import { retry, timer, type MonoTypeOperatorFunction, type Subscription } from "rxjs";
import { backoffDelay } from "./room-socket";
import type { MeetingE2ee } from "./e2ee";

export function partyTracksPrefix(roomUrl: string, meetingId: string) {
  return `${roomUrl.replace(/\/+$/, "")}/rooms/${encodeURIComponent(meetingId)}/partytracks`;
}

/**
 * partytracks fetches `${prefix}/generate-ice-servers` without apiExtraParams, and the room Worker
 * needs the ticket on every partytracks route, so the TURN credentials are fetched here instead.
 */
async function fetchIceServers(prefix: string, token: string): Promise<RTCIceServer[] | undefined> {
  try {
    const response = await fetch(`${prefix}/generate-ice-servers?token=${encodeURIComponent(token)}`);
    if (!response.ok) return undefined;
    const body = (await response.json()) as { iceServers?: RTCIceServer[] };
    return Array.isArray(body.iceServers) ? body.iceServers : undefined;
  } catch {
    return undefined;
  }
}

/** Retries a push/pull with jittered backoff (the room proxy answers 429 above 60 calls per 10 s). */
export function withBackoff<T>(): MonoTypeOperatorFunction<T> {
  return retry({ count: 6, delay: (_error, attempt) => timer(backoffDelay(attempt)) });
}

const STUN_FALLBACK: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

export type MeetingMediaSession = {
  partyTracks: PartyTracks;
  close: () => void;
};

/**
 * Creates the SFU session for an admitted ticket and wires E2EE onto every transceiver as soon as
 * partytracks adds it (before negotiation, so no frame leaves or renders unencrypted).
 */
export async function createMediaSession(input: {
  roomUrl: string;
  meetingId: string;
  token: string;
  e2ee: MeetingE2ee;
  onError?: (error: unknown) => void;
}): Promise<MeetingMediaSession> {
  const prefix = partyTracksPrefix(input.roomUrl, input.meetingId);
  const iceServers = (await fetchIceServers(prefix, input.token)) ?? STUN_FALLBACK;
  const partyTracks = new PartyTracks({
    prefix,
    apiExtraParams: new URLSearchParams({ token: input.token }).toString(),
    iceServers
  });
  // Fail closed: every transceiver gets its transform or is stopped, and after close() any
  // transceiver partytracks still creates is stopped before it can carry media.
  const seen = new Set<RTCRtpTransceiver>();
  let closed = false;
  const subscription: Subscription = partyTracks.transceiver$.subscribe((transceiver) => {
    seen.add(transceiver);
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
  return {
    partyTracks,
    close: () => {
      if (closed) return;
      // Media first, the transceiver$ guard last: stop everything this session created, keep
      // stopping late transceivers while callers unsubscribe their pushes and pulls, then let go.
      closed = true;
      seen.forEach(stopQuietly);
      seen.clear();
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
