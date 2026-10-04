/** Shared WebAudio level meters (one AudioContext per page). Levels are RMS in 0..1. */

let sharedContext: AudioContext | null = null;

function audioContext() {
  if (!sharedContext || sharedContext.state === "closed") sharedContext = new AudioContext();
  return sharedContext;
}

/** Resume after a user gesture (iOS and Chrome autoplay rules). */
export function resumeAudio() {
  if (typeof window === "undefined") return;
  void audioContext()
    .resume()
    .catch(() => undefined);
}

/** Calls `onLevel` about every `intervalMs` until the returned function is called. */
export function watchTrackLevel(track: MediaStreamTrack, onLevel: (level: number) => void, intervalMs = 150) {
  const context = audioContext();
  const source = context.createMediaStreamSource(new MediaStream([track]));
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
  }, intervalMs);
  return () => {
    clearInterval(timer);
    source.disconnect();
    analyser.disconnect();
  };
}
