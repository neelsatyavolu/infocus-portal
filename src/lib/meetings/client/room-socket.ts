import type { MeetingClientMessage, MeetingServerMessage } from "@/src/lib/meetings/protocol";

export type RoomSocketStatus = "connecting" | "open" | "reconnecting" | "closed";

export type RoomSocketOptions = {
  roomUrl: string;
  meetingId: string;
  token: string;
  onMessage: (message: MeetingServerMessage) => void;
  onStatus?: (status: RoomSocketStatus) => void;
  /** The room closed us for a reason that has no protocol message (4029 room full). No reconnect. */
  onFinalClose?: (reason: "full") => void;
  /** Injectable for tests. */
  createSocket?: (url: string) => WebSocket;
};

const PING_INTERVAL_MS = 20_000;
/** No message (not even a pong) for this long means the socket is dead. */
const STALE_AFTER_MS = 45_000;
const BACKOFF_START_MS = 500;
const BACKOFF_MAX_MS = 10_000;
/** Server messages after which the room closes us on purpose: never reconnect. */
const FINAL_MESSAGES: ReadonlySet<MeetingServerMessage["t"]> = new Set(["denied", "removed", "ended"]);

/** Room close codes (workers/meeting-room) that end the call even if the final message was missed. */
const FINAL_CLOSE_CODES: Readonly<Record<number, "removed" | "denied" | "ended">> = {
  4003: "removed",
  4004: "denied",
  4010: "ended"
};

const ROOM_FULL_CODE = 4029;

export function roomSocketUrl(roomUrl: string, meetingId: string, token: string) {
  const base = roomUrl.replace(/\/+$/, "").replace(/^http/, "ws");
  return `${base}/rooms/${encodeURIComponent(meetingId)}/ws?token=${encodeURIComponent(token)}`;
}

export function backoffDelay(attempt: number) {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** attempt);
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

function parseMessage(raw: unknown): MeetingServerMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as { t?: unknown };
    return parsed && typeof parsed.t === "string" ? (parsed as MeetingServerMessage) : null;
  } catch {
    return null;
  }
}

/** One meeting-room WebSocket with ping, stale detection and jittered exponential reconnect. */
export class RoomSocket {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private stopped = false;
  private lastMessageAt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: RoomSocketOptions) {}

  connect() {
    this.stopped = false;
    this.open();
  }

  send(message: MeetingClientMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  /** Sends, then waits (up to `timeoutMs`) for the socket buffer to drain; for `leave` before closing. */
  async sendAndFlush(message: MeetingClientMessage, timeoutMs = 300) {
    if (!this.send(message)) return false;
    const deadline = Date.now() + timeoutMs;
    while (this.socket && this.socket.bufferedAmount > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return true;
  }

  close() {
    this.stopped = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000, "leave");
    this.options.onStatus?.("closed");
  }

  private open() {
    const url = roomSocketUrl(this.options.roomUrl, this.options.meetingId, this.options.token);
    const socket = this.options.createSocket ? this.options.createSocket(url) : new WebSocket(url);
    this.socket = socket;
    this.options.onStatus?.(this.attempt === 0 ? "connecting" : "reconnecting");

    socket.onopen = () => {
      this.attempt = 0;
      this.lastMessageAt = Date.now();
      this.options.onStatus?.("open");
      this.startPing();
    };
    socket.onmessage = (event) => {
      this.lastMessageAt = Date.now();
      const message = parseMessage(event.data);
      if (!message) return;
      if (FINAL_MESSAGES.has(message.t)) this.stopped = true;
      this.options.onMessage(message);
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearTimers();
      if (event.code === ROOM_FULL_CODE) {
        this.stopped = true;
        this.options.onFinalClose?.("full");
      }
      const final = FINAL_CLOSE_CODES[event.code];
      if (final && !this.stopped) {
        this.stopped = true;
        this.options.onMessage({ t: final });
      }
      if (this.stopped) {
        this.options.onStatus?.("closed");
        return;
      }
      this.options.onStatus?.("reconnecting");
      this.retryTimer = setTimeout(() => this.open(), backoffDelay(this.attempt));
      this.attempt += 1;
    };
  }

  private startPing() {
    this.clearPing();
    this.pingTimer = setInterval(() => {
      if (Date.now() - this.lastMessageAt > STALE_AFTER_MS) {
        this.socket?.close(4000, "stale");
        return;
      }
      this.send({ t: "ping" });
    }, PING_INTERVAL_MS);
  }

  private clearPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private clearTimers() {
    this.clearPing();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
