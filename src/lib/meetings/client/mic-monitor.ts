/**
 * When the UI subscribes to the mic's local monitor (partytracks localMonitorTrack$).
 * Monitoring opens the microphone for local use only: what's sent is broadcastTrack$, which
 * stays partytracks' inaudible fallback while muted, so a muted mic test is never heard.
 * - Pre-join: always (test before joining, muted or not).
 * - In the call: while the Audio and video settings are open (mic test), while unmuted
 *   (speaking ring and hand auto-lower), or briefly before an unmute (pre-warm). Muted with settings closed → released, so the
 *   browser's mic indicator turns off.
 */
export function shouldMonitorMic(input: {
  screen: "prejoin" | "call";
  settingsOpen: boolean;
  audioOn: boolean;
  /** About to unmute (hover/focus on the mic button, ⌘/Ctrl down): open the source early. */
  prewarm?: boolean;
}) {
  if (input.screen === "prejoin") return true;
  return input.settingsOpen || input.audioOn || Boolean(input.prewarm);
}

export const MIC_TEST_MUTED_LABEL = "Mic test: speak to see the meter (you're muted, nobody hears you)";
export const MIC_TEST_LIVE_LABEL = "Speak to test your microphone";

export function micTestLabel(audioOn: boolean) {
  return audioOn ? MIC_TEST_LIVE_LABEL : MIC_TEST_MUTED_LABEL;
}
