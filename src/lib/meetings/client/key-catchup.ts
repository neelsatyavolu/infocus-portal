import type { KeyResponse } from "@/src/lib/meetings/types";
import { diagEvent, errorText } from "./diagnostics";
import { backoffDelay } from "./room-socket";
import { fatalFromError, type TicketFatal } from "./ticket";

/**
 * Keeps our key ring caught up with the room's key epoch. The room tells us its epoch on every
 * admitted welcome and every rekey; if we're behind (a missed rekey while reconnecting, a failed
 * fetch), we fetch the key until we have it, with backoff. Never fails silently: every failure is
 * a diag event, and 401/403/410 end the call the right way.
 */

type Deps = {
  /** GET /api/meetings/[id]/key (or /ticket, which also returns it). */
  fetchKey: () => Promise<KeyResponse>;
  setKey: (key: KeyResponse, options: { rekey: boolean }) => Promise<void>;
  /** The newest epoch in our key ring (-1 when there is none). */
  currentEpoch: () => number;
  onFatal: (kind: TicketFatal) => void;
  sleep?: (ms: number) => Promise<void>;
  /** Failures before a `key_catchup_slow` diag event (retries continue at the capped backoff). */
  slowAfterAttempts?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class KeyCatchUp {
  private target = -1;
  private running: Promise<void> | null = null;
  private stopped = false;

  constructor(private readonly deps: Deps) {}

  /** The room is at `epoch`; fetch until we have it. `rekey` = a mid-call key change (send grace). */
  ensure(epoch: number, options: { rekey: boolean }) {
    if (this.stopped) return Promise.resolve();
    this.target = Math.max(this.target, epoch);
    if (this.deps.currentEpoch() >= this.target) return Promise.resolve();
    if (!this.running) {
      this.running = this.run(options.rekey).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  stop() {
    this.stopped = true;
  }

  private async run(rekey: boolean) {
    const sleep = this.deps.sleep ?? defaultSleep;
    const slowAfter = this.deps.slowAfterAttempts ?? 12;
    // Never give up while behind: until we have the key, peers' audio and video can't be decrypted.
    for (let attempt = 0; !this.stopped && this.deps.currentEpoch() < this.target; attempt += 1) {
      if (attempt === slowAfter) diagEvent("key_catchup_slow", { have: this.deps.currentEpoch(), want: this.target });
      try {
        const key = await this.deps.fetchKey();
        if (this.stopped) return;
        if (key.epoch > this.deps.currentEpoch()) await this.deps.setKey(key, { rekey });
        if (this.deps.currentEpoch() >= this.target) {
          if (attempt > 0) diagEvent("key_catchup", { epoch: key.epoch, attempts: attempt + 1 });
          return;
        }
        // The Portal is behind the room for a moment: try again shortly.
        diagEvent("key_behind", { have: key.epoch, want: this.target });
      } catch (error) {
        const fatal = fatalFromError(error);
        diagEvent("key_fetch_failed", { attempt, want: this.target, fatal, message: errorText(error) });
        if (fatal) {
          this.stop();
          this.deps.onFatal(fatal);
          return;
        }
      }
      await sleep(backoffDelay(attempt));
    }
  }
}
