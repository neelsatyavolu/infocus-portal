import { deriveMeetingKey, fromBase64Url } from "./frame-crypto";
import { addKeyToRing, emptyKeyRing, type KeyRing } from "./key-ring";

export const E2EE_WORKER_URL = "/meet-e2ee-worker.js";

type ScriptTransformCtor = new (worker: Worker, options?: unknown) => RTCRtpTransform;

function scriptTransformCtor(): ScriptTransformCtor | null {
  const ctor = (globalThis as { RTCRtpScriptTransform?: ScriptTransformCtor }).RTCRtpScriptTransform;
  return typeof ctor === "function" ? ctor : null;
}

/** Media E2EE is only possible with RTCRtpScriptTransform; Firefox is blocked until verified (spec). */
export function meetingBrowserSupport(): { ok: true } | { ok: false; reason: string } {
  if (typeof window === "undefined") return { ok: false, reason: "Meetings run in the browser." };
  if (/firefox|fxios/i.test(navigator.userAgent)) {
    return { ok: false, reason: "Meetings don't work in Firefox yet. Open this link in Chrome or Safari." };
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
    return { ok: false, reason: "This browser can't make video calls. Use a current Chrome or Safari." };
  }
  if (!scriptTransformCtor()) {
    return {
      ok: false,
      reason: "This browser can't encrypt calls end to end. Update Chrome or Safari to the latest version."
    };
  }
  return { ok: true };
}

function transceiverKind(transceiver: RTCRtpTransceiver): "audio" | "video" {
  return transceiver.receiver.track.kind === "video" ? "video" : "audio";
}

/** Puts VP8 first so every encoded video frame has the header layout the transform expects. */
export function preferVp8(transceiver: RTCRtpTransceiver) {
  if (transceiverKind(transceiver) !== "video" || typeof RTCRtpSender.getCapabilities !== "function") return;
  const codecs = RTCRtpSender.getCapabilities("video")?.codecs ?? [];
  const vp8 = codecs.filter((c) => c.mimeType.toLowerCase() === "video/vp8");
  const support = codecs.filter((c) => /\/(rtx|red|ulpfec)$/i.test(c.mimeType));
  if (vp8.length === 0) return;
  try {
    transceiver.setCodecPreferences([...vp8, ...support]);
  } catch {
    // Some engines reject preferences on recvonly transceivers; the SFU forwards the sender's VP8.
  }
}

/**
 * Owns the frame-transform worker and the chat key ring for one call.
 * `attach` must run for every transceiver before media flows (partyTracks.transceiver$).
 */
export class MeetingE2ee {
  private readonly worker: Worker;
  private chatRing: KeyRing<CryptoKey> = emptyKeyRing();
  private chatKeys = new Map<number, CryptoKey>();
  private readonly failing = new Set<string>();
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.worker = new Worker(E2EE_WORKER_URL);
    this.worker.onmessage = (event: MessageEvent<{ type?: string; id?: string; ok?: boolean }>) => {
      const { type, id, ok } = event.data ?? {};
      if (type !== "decrypt" || !id) return;
      if (ok) this.failing.delete(id);
      else this.failing.add(id);
      this.listeners.forEach((listener) => listener());
    };
  }

  /** `key` is the base64url 32-byte meeting key from the Portal. */
  async setKey(key: string, epoch: number) {
    const raw = fromBase64Url(key);
    const chatKey = await deriveMeetingKey(raw, "chat");
    this.chatRing = addKeyToRing(this.chatRing, { epoch, key: chatKey });
    this.chatKeys = new Map(this.chatKeys).set(epoch, chatKey);
    this.worker.postMessage({ type: "setKey", key: raw, epoch });
  }

  get currentChat() {
    return this.chatRing.current;
  }

  /** Every chat key seen this session (older messages stay readable after a rekey). */
  chatKeyFor(epoch: number) {
    return this.chatKeys.get(epoch);
  }

  attach(transceiver: RTCRtpTransceiver) {
    const Transform = scriptTransformCtor();
    if (!Transform) throw new Error("End-to-end encryption is not supported in this browser.");
    const kind = transceiverKind(transceiver);
    preferVp8(transceiver);
    if (transceiver.direction === "sendonly" || transceiver.direction === "sendrecv") {
      transceiver.sender.transform = new Transform(this.worker, { operation: "encrypt", kind });
      // Fail closed: a sender without its encrypt transform must never carry media.
      if (!transceiver.sender.transform) throw new Error("Couldn't encrypt this track.");
    } else {
      const id = transceiver.receiver.track.id;
      transceiver.receiver.transform = new Transform(this.worker, { operation: "decrypt", kind, id });
    }
  }

  /** True when frames for this pulled track id keep failing to decrypt. */
  isFailing(trackId: string) {
    return this.failing.has(trackId);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy() {
    this.worker.postMessage({ type: "clearKeys" });
    this.worker.terminate();
    this.listeners.clear();
  }
}
