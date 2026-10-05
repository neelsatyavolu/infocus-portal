/**
 * Call diagnostics for debugging after the fact. A getStats summary every 10 s plus events (errors,
 * state changes, clicks) go to the room as `diag` messages, which the Worker logs to Workers Logs.
 * The last entries also stay in memory for "Copy debug info". Never names, emails, keys or content:
 * only states, counters, short ids and error messages.
 */
import {
  MEETING_DIAG_MAX_BYTES,
  type MeetingClientMessage,
  type MeetingDiagData,
  type MeetingDiagKind
} from "@/src/lib/meetings/protocol";

type Primitive = string | number | boolean | null;
export type StatLike = { type?: string; id?: string } & Record<string, unknown>;
/** Remote track → its owner. `trackIdentifier` is the receiver track id. */
export type InboundOwner = (trackIdentifier: string) => { uid: string; kind: string } | null;
/** Counters from the previous sample, keyed by `<stat id>.<field>` (for deltas). */
export type StatsCounters = Readonly<Record<string, number>>;

export const DIAG_PERIODIC_MS = 10_000;
export const DIAG_BUFFER_SIZE = 200;

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown) => (typeof value === "string" ? value : null);
const short = (id: string) => id.slice(0, 8);
const round = (value: number, places = 3) => Number(value.toFixed(places));

function delta(counters: Record<string, number>, previous: StatsCounters, key: string, value: number | null) {
  if (value === null) return null;
  counters[key] = value;
  const before = previous[key];
  // First sample (or a restarted stream): report the total so far.
  return before === undefined || value < before ? value : value - before;
}

type Inbound = { pkts: number; lost: number; bytes: number; frames: number; freezes: number; jitterMs: number; level: number | null };

/** Summary of one RTCPeerConnection getStats report as flat primitives (pure; see `capDiagData`). */
export function summarizeStats(stats: Iterable<StatLike>, previous: StatsCounters, owner: InboundOwner) {
  const all = [...stats];
  const byId = new Map(all.filter((s) => s.id).map((s) => [s.id as string, s]));
  const counters: Record<string, number> = {};
  const data: MeetingDiagData = {};

  // Selected candidate pair: from the transport, else the nominated succeeded pair.
  const transport = all.find((s) => s.type === "transport");
  const pair =
    (transport && byId.get(str(transport.selectedCandidatePairId) ?? "")) ??
    all.find((s) => s.type === "candidate-pair" && s.nominated === true && s.state === "succeeded");
  if (pair) {
    const local = byId.get(str(pair.localCandidateId) ?? "");
    const remote = byId.get(str(pair.remoteCandidateId) ?? "");
    data["pair.local"] = str(local?.candidateType);
    data["pair.remote"] = str(remote?.candidateType);
    data["pair.relay"] = str(local?.relayProtocol);
    data["pair.proto"] = str(local?.protocol);
    const rtt = num(pair.currentRoundTripTime);
    data["pair.rttMs"] = rtt === null ? null : Math.round(rtt * 1000);
  } else {
    data["pair.local"] = null;
  }

  // Outbound: summed over simulcast layers; the first limitation reason that isn't "none".
  for (const kind of ["audio", "video"] as const) {
    const out = all.filter((s) => s.type === "outbound-rtp" && s.kind === kind);
    if (out.length === 0) continue;
    data[`out.${kind}.bytes`] = out.reduce((sum, s) => sum + (num(s.bytesSent) ?? 0), 0);
    data[`out.${kind}.pkts`] = out.reduce((sum, s) => sum + (num(s.packetsSent) ?? 0), 0);
    if (kind === "video") {
      data["out.video.frames"] = out.reduce((sum, s) => sum + (num(s.framesEncoded) ?? 0), 0);
      data["out.video.qlr"] = out.map((s) => str(s.qualityLimitationReason)).find((r) => r && r !== "none") ?? "none";
    }
  }

  // Inbound: deltas since the last sample, grouped by remote uid (short) and kind.
  const inbound = new Map<string, Inbound>();
  for (const s of all) {
    if (s.type !== "inbound-rtp" || !s.id) continue;
    const kind = str(s.kind) ?? "unknown";
    const who = owner(str(s.trackIdentifier) ?? "");
    const key = `${who ? short(who.uid) : "unknown"}.${who?.kind ?? kind}`;
    const entry = inbound.get(key) ?? { pkts: 0, lost: 0, bytes: 0, frames: 0, freezes: 0, jitterMs: 0, level: null };
    entry.pkts += delta(counters, previous, `${s.id}.pkts`, num(s.packetsReceived)) ?? 0;
    entry.lost += delta(counters, previous, `${s.id}.lost`, num(s.packetsLost)) ?? 0;
    entry.bytes += delta(counters, previous, `${s.id}.bytes`, num(s.bytesReceived)) ?? 0;
    entry.frames += delta(counters, previous, `${s.id}.frames`, num(s.framesDecoded)) ?? 0;
    entry.freezes += num(s.freezeCount) ?? 0;
    entry.jitterMs = Math.max(entry.jitterMs, Math.round((num(s.jitter) ?? 0) * 1000));
    const level = num(s.audioLevel);
    const energy = delta(counters, previous, `${s.id}.energy`, num(s.totalAudioEnergy));
    if (kind === "audio") entry.level = level !== null ? round(level) : energy !== null ? round(energy, 4) : entry.level;
    inbound.set(key, entry);
  }
  for (const [key, entry] of inbound) {
    data[`in.${key}.pkts`] = entry.pkts;
    data[`in.${key}.lost`] = entry.lost;
    data[`in.${key}.bytes`] = entry.bytes;
    data[`in.${key}.jitterMs`] = entry.jitterMs;
    if (key.endsWith(".audio")) data[`in.${key}.level`] = entry.level;
    else {
      data[`in.${key}.frames`] = entry.frames;
      data[`in.${key}.freezes`] = entry.freezes;
    }
  }
  data["in.streams"] = inbound.size;
  return { data, counters };
}

export function diagMessageBytes(kind: MeetingDiagKind, data: MeetingDiagData) {
  return new TextEncoder().encode(JSON.stringify({ t: "diag", kind, data })).byteLength;
}

/**
 * Keeps the message under the room's limit. Too big: per-remote inbound keys become totals per kind
 * plus the worst remote (fewest packets, then most lost); still too big: keys are dropped from the end.
 */
export function capDiagData(kind: MeetingDiagKind, data: MeetingDiagData, maxBytes = MEETING_DIAG_MAX_BYTES): MeetingDiagData {
  if (diagMessageBytes(kind, data) <= maxBytes) return data;
  const rest: MeetingDiagData = {};
  const remotes = new Map<string, { uid: string; kind: string; pkts: number; lost: number; bytes: number }>();
  for (const [key, value] of Object.entries(data)) {
    const match = /^in\.([^.]+)\.([^.]+)\.(pkts|lost|bytes|jitterMs|level|frames|freezes)$/.exec(key);
    if (!match) {
      rest[key] = value;
      continue;
    }
    const [, uid, streamKind, field] = match;
    const id = `${uid}.${streamKind}`;
    const entry = remotes.get(id) ?? { uid: uid!, kind: streamKind!, pkts: 0, lost: 0, bytes: 0 };
    if (field === "pkts" || field === "lost" || field === "bytes") entry[field] = typeof value === "number" ? value : 0;
    remotes.set(id, entry);
  }
  const totals: MeetingDiagData = {};
  for (const entry of remotes.values()) {
    for (const field of ["pkts", "lost", "bytes"] as const) {
      const key = `in.${entry.kind}.${field}`;
      totals[key] = ((totals[key] as number | undefined) ?? 0) + entry[field];
    }
  }
  const worst = [...remotes.values()].sort((a, b) => a.pkts - b.pkts || b.lost - a.lost)[0];
  const summarized: MeetingDiagData = {
    ...rest,
    ...totals,
    ...(worst ? { "in.worst.uid": worst.uid, "in.worst.kind": worst.kind, "in.worst.pkts": worst.pkts, "in.worst.lost": worst.lost } : {}),
    summarized: true
  };
  const entries = Object.entries(summarized);
  while (entries.length > 1 && diagMessageBytes(kind, Object.fromEntries(entries)) > maxBytes - 20) entries.pop();
  const capped: MeetingDiagData = Object.fromEntries(entries);
  return entries.length < Object.keys(summarized).length ? { ...capped, truncated: true } : capped;
}

/** Long strings (error messages) are cut so one entry never crowds out the rest. */
function clip(value: Primitive): Primitive {
  return typeof value === "string" && value.length > 200 ? `${value.slice(0, 199)}…` : value;
}

export type DiagEntry = { at: number; kind: MeetingDiagKind; data: MeetingDiagData };

/** Records diag entries (ring of the last 200) and sends them through the room socket. */
export class CallDiagnostics {
  private readonly entries: DiagEntry[] = [];

  constructor(private readonly send: (message: MeetingClientMessage) => boolean) {}

  record(kind: MeetingDiagKind, raw: Record<string, Primitive | undefined>) {
    const clean = Object.fromEntries(
      Object.entries(raw)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, clip(value as Primitive)])
    ) as MeetingDiagData;
    const data = capDiagData(kind, clean);
    this.entries.push({ at: Date.now(), kind, data });
    if (this.entries.length > DIAG_BUFFER_SIZE) this.entries.splice(0, this.entries.length - DIAG_BUFFER_SIZE);
    this.send({ t: "diag", kind, data });
  }

  event(what: string, details: Record<string, Primitive | undefined> = {}) {
    this.record("event", { what, ...details });
  }

  recent(): readonly DiagEntry[] {
    return [...this.entries];
  }
}

// One call at a time: a module-level sink lets media code report events without prop drilling.
let sink: CallDiagnostics | null = null;

export function setDiagSink(next: CallDiagnostics | null) {
  sink = next;
}

/** Sends the periodic stats summary (no-op outside a call). */
export function diagPeriodic(data: Record<string, Primitive | undefined>) {
  sink?.record("periodic", data);
}

/** Reports a diagnostic event from anywhere in the call (no-op outside a call). */
export function diagEvent(what: string, details: Record<string, Primitive | undefined> = {}) {
  sink?.event(what, details);
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
}

/** Remote track id → the Realtime session it was pulled from (filled by usePulledTrack). */
const pulledTracks = new Map<string, { sessionId: string; trackName: string }>();

export function registerPulledTrack(trackId: string, sessionId: string, trackName: string) {
  pulledTracks.set(trackId, { sessionId, trackName });
}

export function unregisterPulledTrack(trackId: string) {
  pulledTracks.delete(trackId);
}

export function pulledTrackSource(trackId: string) {
  return pulledTracks.get(trackId) ?? null;
}

/** The JSON that "Copy debug info" puts on the clipboard. */
export function debugInfo(input: { meetingId: string; uid: string | null; userAgent: string; build: string | null }) {
  return JSON.stringify(
    { meetingId: input.meetingId, uid: input.uid, userAgent: input.userAgent, build: input.build, at: new Date().toISOString(), diags: sink?.recent() ?? [] },
    null,
    2
  );
}
