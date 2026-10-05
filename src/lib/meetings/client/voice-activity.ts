/**
 * The one speaking detector for Meetings (pure). Drives both the active-speaker ring (every
 * tile) and raised-hand auto-lower, so they always agree. Calibrated per person: a level counts
 * as voice when it is clearly above that person's own recent noise floor, which works on raw,
 * voice-isolated (RNNoise) and auto-gain audio alike.
 */

/** A voiced sample keeps "speaking" on this long, so the short gaps between words still count. */
const HANGOVER_MS = 350;
/** Voiced = this far above the noise floor... */
const VOICE_ABOVE_FLOOR_DB = 9;
/** ...and above this absolute level (near silence never counts). */
const VOICE_MIN_DBFS = -60;
/**
 * Noise floor = the quietest sample of the last few seconds (minimum statistics: speech always
 * has gaps, a fan or hiss doesn't), capped so a loud steady voice still counts as speech.
 */
const FLOOR_WINDOW_MS = 3000;
const FLOOR_CAP_DBFS = -40;

export type VadState = { recentDb: readonly { at: number; db: number }[]; hangUntil: number };
export const INITIAL_VAD: VadState = { recentDb: [], hangUntil: 0 };

/** `level` is what the level meter reports: RMS × 4, capped at 1. */
export function levelToDbfs(level: number) {
  return 20 * Math.log10(Math.max(level / 4, 1e-6));
}

export function nextVad(state: VadState, at: number, level: number): { state: VadState; speaking: boolean } {
  const db = levelToDbfs(level);
  const recentDb = [...state.recentDb, { at, db }].filter((s) => s.at >= at - FLOOR_WINDOW_MS);
  const floor = Math.min(FLOOR_CAP_DBFS, ...recentDb.map((s) => s.db));
  const voiced = db > Math.max(floor + VOICE_ABOVE_FLOOR_DB, VOICE_MIN_DBFS);
  const hangUntil = voiced ? at + HANGOVER_MS : state.hangUntil;
  return { state: { recentDb, hangUntil }, speaking: voiced || at < state.hangUntil };
}
