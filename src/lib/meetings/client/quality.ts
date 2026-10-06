import type { ReceiveQuality, SendQuality } from "./meet-settings";

/**
 * Send/receive quality presets. Cloudflare Realtime bills SFU egress (what viewers download),
 * so the receive side pulls the smallest simulcast layer that looks right for each tile.
 */

export type SimulcastRid = "f" | "h" | "q";

/** Capture request (partytracks getCamera constraints): up to 1080p30; presets scale down in the encoder. */
export const CAMERA_CAPTURE: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30, max: 30 }
};

const TARGET_HEIGHT: Record<SendQuality, number> = { auto: 1080, "720p": 720, "360p": 360 };

/** Scale factor so the top layer is at most `target` lines tall (never upscales). */
function scaleFor(sourceHeight: number, target: number) {
  return Math.max(1, Math.round((sourceHeight / target) * 100) / 100);
}

/**
 * Camera simulcast encodings for a preset, given the captured height. Always three layers
 * (f/h/q) so a preset change is a setParameters update, never a renegotiation.
 * - auto:  f ≤1080p 1.8 Mbps 30 fps · h = f/2 500 kbps · q = f/4 150 kbps
 * - 720p:  f ≤720p 1.2 Mbps 30 fps · h 500 kbps · q 150 kbps
 * - 360p:  data saver, every layer ≤360p: f 300 kbps · h 150 kbps · q 80 kbps
 */
export function cameraEncodings(quality: SendQuality, sourceHeight: number): RTCRtpEncodingParameters[] {
  const height = sourceHeight > 0 ? sourceHeight : TARGET_HEIGHT[quality];
  const f = scaleFor(height, TARGET_HEIGHT[quality]);
  if (quality === "360p") {
    return [
      { rid: "q", scaleResolutionDownBy: f * 4, maxBitrate: 80_000, maxFramerate: 15 },
      { rid: "h", scaleResolutionDownBy: f * 2, maxBitrate: 150_000, maxFramerate: 24 },
      { rid: "f", scaleResolutionDownBy: f, maxBitrate: 300_000, maxFramerate: 30 }
    ];
  }
  return [
    { rid: "q", scaleResolutionDownBy: f * 4, maxBitrate: 150_000, maxFramerate: 15 },
    { rid: "h", scaleResolutionDownBy: f * 2, maxBitrate: 500_000, maxFramerate: 30 },
    { rid: "f", scaleResolutionDownBy: f, maxBitrate: quality === "720p" ? 1_200_000 : 1_800_000, maxFramerate: 30 }
  ];
}

/** Screen share: up to 1080p at 15 fps; contentHint "detail" keeps text sharp. */
export const SCREEN_CAPTURE: MediaTrackConstraints = {
  width: { max: 1920 },
  height: { max: 1080 },
  frameRate: { max: 15 }
};
export const SCREEN_ENCODINGS: RTCRtpEncodingParameters[] = [{ maxBitrate: 1_500_000, maxFramerate: 15 }];

/** Shared tab/screen sound is music and video, not speech: no voice processing, more bits. */
export const SCREEN_AUDIO_CAPTURE: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
export const SCREEN_AUDIO_ENCODINGS: RTCRtpEncodingParameters[] = [{ maxBitrate: 128_000 }];

/**
 * Opus speech at high quality; Chrome keeps in-band FEC on by default. High priority: on a congested
 * link the voice keeps its share ahead of the camera layers (and gets a voice DSCP mark where honored).
 */
export const MIC_ENCODINGS: RTCRtpEncodingParameters[] = [{ maxBitrate: 64_000, priority: "high", networkPriority: "high" }];

/**
 * Simulcast layer for a tile from its on-screen height (CSS px). Under 360 px → q, under
 * 720 px → h, else f. Data saver caps everything at h, and grid tiles at q.
 */
export function ridForTileHeight(
  heightPx: number,
  receive: ReceiveQuality,
  placement: "main" | "grid" | "strip"
): SimulcastRid {
  const bySize: SimulcastRid = heightPx < 360 ? "q" : heightPx < 720 ? "h" : "f";
  if (receive !== "saver") return bySize;
  if (placement !== "main") return "q";
  return bySize === "f" ? "h" : bySize;
}

const LAYER_KBPS: Record<SimulcastRid, number> = { f: 1800, h: 500, q: 150 };
const AUDIO_KBPS = 64;

/**
 * Rough egress for a call (GB per hour, all viewers together), assuming everyone shows a grid:
 * one other person fills the stage (f), up to 4 tiles pull h, more pull q. Data saver steps
 * each case down one layer. An estimate, not a bill.
 */
export function estimateGbPerHour(people: number, receive: ReceiveQuality) {
  const n = Math.max(2, Math.round(people));
  const others = n - 1;
  const auto: SimulcastRid = others <= 1 ? "f" : others <= 4 ? "h" : "q";
  const rid: SimulcastRid = receive === "saver" ? (auto === "f" ? "h" : "q") : auto;
  const kbpsPerViewer = others * (LAYER_KBPS[rid] + AUDIO_KBPS);
  const gb = (n * kbpsPerViewer * 1000 * 3600) / 8 / 1e9;
  return Math.round(gb * 10) / 10;
}
