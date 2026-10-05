import type { KeyResponse } from "@/src/lib/meetings/types";
import { MeetingApiError } from "./api";
import { fromBase64Url } from "./frame-crypto";

/**
 * Room tickets expire 4 h after they're issued. The call keeps the current ticket, refreshes it
 * through POST /api/meetings/[id]/ticket at 75% of its lifetime, and before any reconnect when
 * it has under 10 minutes left. PartyTracks gets a live `Headers` object whose Authorization is
 * updated in place (partytracks reads config.headers on every request).
 */

export type TicketResponse = { roomToken: string; roomUrl: string; key: KeyResponse };
export type TicketFatal = "ended" | "removed" | "signin";

export const REFRESH_AT_FRACTION = 0.75;
export const RECONNECT_MIN_LEFT_MS = 10 * 60 * 1000;
const RETRY_MS = 30_000;

/** iat/exp (epoch ms) from a room ticket, without verifying it (the server does that). */
export function decodeTicket(token: string): { iat: number; exp: number } | null {
  const body = token.split(".")[0];
  if (!body) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as { iat?: unknown; exp?: unknown };
    return typeof payload.iat === "number" && typeof payload.exp === "number" ? { iat: payload.iat, exp: payload.exp } : null;
  } catch {
    return null;
  }
}

/** When to refresh proactively: 75% of the way from iat to exp. */
export function refreshAt(ticket: { iat: number; exp: number }) {
  return ticket.iat + (ticket.exp - ticket.iat) * REFRESH_AT_FRACTION;
}

/** Before (re)connecting: refresh if under 10 minutes are left (or the ticket can't be read). */
export function needsRefreshBeforeConnect(token: string, now: number) {
  const ticket = decodeTicket(token);
  return !ticket || ticket.exp - now < RECONNECT_MIN_LEFT_MS;
}

/** /ticket (and /key) failures that end the call: 410 ended, 403 removed, 401 signed out. */
export function fatalFromError(error: unknown): TicketFatal | null {
  if (!(error instanceof MeetingApiError)) return null;
  if (error.status === 410) return "ended";
  if (error.status === 403) return "removed";
  if (error.status === 401) return "signin";
  return null;
}

type TicketDeps = {
  fetchTicket: () => Promise<TicketResponse>;
  /** Every refresh also carries the current key (lets the key ring catch up for free). */
  onKey: (key: KeyResponse) => void;
  onFatal: (kind: TicketFatal) => void;
  /** False for a waiting (lobby) ticket: /ticket only serves admitted people. */
  refreshable?: boolean;
  now?: () => number;
};

export class TicketManager {
  /** Live headers for PartyTracks (mutated in place on refresh). */
  readonly headers = new Headers();
  roomUrl: string;
  private token: string;
  private inflight: Promise<string | null> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    initial: { roomToken: string; roomUrl: string },
    private readonly deps: TicketDeps
  ) {
    this.token = initial.roomToken;
    this.roomUrl = initial.roomUrl;
    this.apply();
  }

  get current() {
    return this.token;
  }

  /** For socket (re)connects: a ticket with at least 10 minutes left, or null when the call is over. */
  async forConnect(): Promise<string | null> {
    if (this.stopped) return null;
    if (!this.refreshable || !needsRefreshBeforeConnect(this.token, this.now())) return this.token;
    return this.refresh();
  }

  /** Single-flight refresh. Null when the call ended (onFatal already called). */
  refresh(): Promise<string | null> {
    if (this.stopped) return Promise.resolve(null);
    if (!this.refreshable) return Promise.resolve(this.token);
    if (!this.inflight) {
      this.inflight = this.deps
        .fetchTicket()
        .then((next) => {
          this.token = next.roomToken;
          this.roomUrl = next.roomUrl;
          this.apply();
          this.deps.onKey(next.key);
          return this.token as string | null;
        })
        .catch((error: unknown) => {
          const fatal = fatalFromError(error);
          if (fatal) {
            this.stop();
            this.deps.onFatal(fatal);
            return null;
          }
          // Transient (network, 5xx): keep the current ticket and try again soon.
          this.schedule(this.now() + RETRY_MS);
          return this.token;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private get refreshable() {
    return this.deps.refreshable !== false;
  }

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  private apply() {
    this.headers.set("Authorization", `Bearer ${this.token}`);
    const ticket = decodeTicket(this.token);
    if (ticket && this.refreshable) this.schedule(refreshAt(ticket));
  }

  private schedule(at: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), Math.max(1000, at - this.now()));
  }
}
