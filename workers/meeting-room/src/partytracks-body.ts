/**
 * Rebuilds partytracks JSON bodies from allowed fields only, so the validated object is
 * exactly what Cloudflare Realtime receives. Shapes mirror partytracks' client
 * (node_modules/partytracks/dist/client/index.js):
 *   tracks/new (push)  { sessionDescription, tracks: [{ location: "local", trackName, mid }] }
 *   tracks/new (pull)  { tracks: [{ location: "remote", sessionId, trackName, simulcast? }] }
 *   tracks/update      { tracks: [{ location?, sessionId?, trackName?, mid, simulcast }] }
 *   tracks/close       { tracks: [{ mid }], sessionDescription, force }
 *   renegotiate        { sessionDescription }
 */
import type { SessionAction } from "./media-auth";

export const MAX_SDP_CHARS = 128 * 1024;
const MAX_TRACKS = 64;
const MAX_FIELD_CHARS = 128;

type Obj = Record<string, unknown>;

type SessionDescription = { type: "offer" | "answer"; sdp: string };
type Simulcast = { preferredRid: string };
type CleanTrack = {
  location?: "local" | "remote";
  sessionId?: string;
  trackName?: string;
  mid?: string;
  simulcast?: Simulcast;
};

export type SanitizedBody = { body: Obj; pushes: number; pullSessionIds: readonly string[] };

const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const isField = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_FIELD_CHARS;

function sessionDescription(value: unknown): SessionDescription | null {
  if (!isObj(value)) return null;
  const { type, sdp } = value;
  if (type !== "offer" && type !== "answer") return null;
  if (typeof sdp !== "string" || sdp.length === 0 || sdp.length > MAX_SDP_CHARS) return null;
  return { type, sdp };
}

function simulcast(value: unknown): Simulcast | null {
  return isObj(value) && isField(value.preferredRid) ? { preferredRid: value.preferredRid } : null;
}

/** Copies only known track fields; returns null on any malformed field. */
function cleanTrack(value: unknown): CleanTrack | null {
  if (!isObj(value)) return null;
  const { location, sessionId, trackName, mid } = value;
  if (location !== undefined && location !== "local" && location !== "remote") return null;
  if (sessionId !== undefined && !isField(sessionId)) return null;
  if (trackName !== undefined && !isField(trackName)) return null;
  if (mid !== undefined && mid !== null && !isField(mid)) return null;
  const sim = value.simulcast === undefined ? undefined : simulcast(value.simulcast);
  if (sim === null) return null;
  return {
    ...(location !== undefined ? { location } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(trackName !== undefined ? { trackName } : {}),
    ...(typeof mid === "string" ? { mid } : {}),
    ...(sim ? { simulcast: sim } : {})
  };
}

function cleanTracks(value: unknown): CleanTrack[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TRACKS) return null;
  const tracks = value.map(cleanTrack);
  return tracks.every((track): track is CleanTrack => track !== null) ? tracks : null;
}

function pullsOf(tracks: readonly CleanTrack[]): string[] {
  return [...new Set(tracks.flatMap((track) => (track.sessionId ? [track.sessionId] : [])))];
}

function tracksNew(json: Obj): SanitizedBody | null {
  const tracks = cleanTracks(json.tracks);
  if (!tracks) return null;
  const valid = tracks.every((track) =>
    track.location === "local"
      ? Boolean(track.trackName) && !track.sessionId
      : track.location === "remote" && Boolean(track.sessionId && track.trackName)
  );
  if (!valid) return null;
  const pushes = tracks.filter((track) => track.location === "local").length;
  const sd = json.sessionDescription === undefined ? undefined : sessionDescription(json.sessionDescription);
  if (sd === null || (pushes > 0 && !sd)) return null;
  return { body: { ...(sd ? { sessionDescription: sd } : {}), tracks }, pushes, pullSessionIds: pullsOf(tracks) };
}

function tracksUpdate(json: Obj): SanitizedBody | null {
  const tracks = cleanTracks(json.tracks);
  if (!tracks || !tracks.every((track) => track.mid && track.location !== "local")) return null;
  return { body: { tracks }, pushes: 0, pullSessionIds: pullsOf(tracks) };
}

function tracksClose(json: Obj): SanitizedBody | null {
  if (!Array.isArray(json.tracks) || json.tracks.length === 0 || json.tracks.length > MAX_TRACKS) return null;
  const mids = json.tracks.map((track) => (isObj(track) && isField(track.mid) ? { mid: track.mid } : null));
  if (!mids.every((mid) => mid !== null)) return null;
  const sd = sessionDescription(json.sessionDescription);
  if (!sd) return null;
  const force = json.force === true;
  return { body: { tracks: mids, sessionDescription: sd, force }, pushes: 0, pullSessionIds: [] };
}

function renegotiate(json: Obj): SanitizedBody | null {
  const sd = sessionDescription(json.sessionDescription);
  return sd ? { body: { sessionDescription: sd }, pushes: 0, pullSessionIds: [] } : null;
}

export function sanitizeSessionBody(action: SessionAction, json: unknown): SanitizedBody | null {
  if (!isObj(json)) return null;
  switch (action) {
    case "tracks/new":
      return tracksNew(json);
    case "tracks/update":
      return tracksUpdate(json);
    case "tracks/close":
      return tracksClose(json);
    case "renegotiate":
      return renegotiate(json);
  }
}
