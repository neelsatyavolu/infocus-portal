import { onTick } from "./ticker";
import { resumeVoiceIsolation } from "./voice-isolation";

/** Shared WebAudio level meters (one AudioContext per page). Levels are RMS in 0..1. */

let sharedContext: AudioContext | null = null;

function audioContext() {
  if (!sharedContext || sharedContext.state === "closed") sharedContext = new AudioContext();
  return sharedContext;
}

/** Resume after a user gesture (iOS and Chrome autoplay rules). */
export function resumeAudio() {
  if (typeof window === "undefined") return;
  resumeVoiceIsolation();
  void audioContext()
    .resume()
    .catch(() => undefined);
}

/**
 * Calls `onLevel` about every 100 ms until the returned function is called. Ticks come from the
 * shared worker ticker, so meters keep running in background tabs.
 */
export function watchTrackLevel(track: MediaStreamTrack, onLevel: (level: number) => void) {
  const context = audioContext();
  const source = context.createMediaStreamSource(new MediaStream([track]));
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const stopTicks = onTick(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
  });
  return () => {
    stopTicks();
    source.disconnect();
    analyser.disconnect();
  };
}
