/**
 * E2E_SCENARIO=expiry: room tickets expiring mid-call (real tickets last 4 h, MEETING_ROOM_TOKEN_TTL_MS;
 * here E2E_TICKET_TTL_S, default 180 s, over E2E_SECONDS, default 360 s).
 *
 * A and B refresh their tickets like the browser's TicketManager (fresh ticket at 75% of the
 * lifetime; before a reconnect when under 10 min are left; proxy calls carry the current one as
 * `Authorization: Bearer`). X is the control: same short ticket, never refreshed.
 * After the original expiry: a late joiner C must be pulled by A and B (not X), A's socket
 * reconnect must work (X's must not), and a second late joiner D after the FIRST refreshed
 * tickets expire checks that the refresh keeps chaining.
 */
import { check, info, newMeetingId, now, roomClient, sleep, type Kind } from "./common";
import { Participant } from "./participant";

type Options = { key: CryptoKey; relay: boolean; videoKbps: number };

/** Frames from `publisher` that `receiver` decrypted with send time in [from, to). */
function received(receiver: Participant, publisher: Participant, kind: Kind, from: number, to = now()) {
  const inbound = receiver.inbound.get(publisher.uid);
  const records = (kind === "audio" ? inbound?.audio : inbound?.video) ?? [];
  return records.filter((r) => r.sentAt >= from && r.sentAt < to).length;
}

const flow = (r: Participant, p: Participant, from: number) => `${p.uid}->${r.uid} a${received(r, p, "audio", from)} v${received(r, p, "video", from)}`;
const flowing = (r: Participant, p: Participant, from: number) => received(r, p, "audio", from) > 50 && received(r, p, "video", from) > 30;

/** Statuses of `p`'s pulls (tracks/new pull) since `since`. */
function pullStatuses(p: Participant, since: number) {
  return p.callLog.filter((c) => c.at >= since && c.route === "tracks/new pull").map((c) => c.status);
}

export async function runExpiryScenario(options: Options) {
  const ttlMs = Number(process.env.E2E_TICKET_TTL_S ?? 180) * 1000;
  const totalMs = Number(process.env.E2E_SECONDS ?? 360) * 1000;
  const room = roomClient(newMeetingId("expiry"));
  const make = (uid: string, role: "host" | "member", ticket: { ttlMs?: number; refresh?: boolean } = {}) =>
    new Participant({
      room,
      uid,
      role,
      key: options.key,
      relay: options.relay,
      videoKbps: options.videoKbps,
      keyFrameSeconds: 2,
      ticketTtlMs: ticket.ttlMs,
      refreshTickets: ticket.refresh ?? true,
      log: info
    });
  const a = make("exp-a", "host", { ttlMs });
  const b = make("exp-b", "member", { ttlMs });
  const x = make("exp-x", "member", { ttlMs, refresh: false });
  const c = make("exp-c", "member");
  const d = make("exp-d", "member");
  const everyone = [a, b, x, c, d];
  const t0 = now();
  const rel = (t = now()) => `+${((t - t0) / 1000).toFixed(0)}s`;
  console.log(`\n== ticket expiry (meeting ${room.meetingId}): ${ttlMs / 1000} s tickets; A, B refresh at 75%, X never refreshes`);
  try {
    for (const p of [a, b, x]) {
      await p.join();
      await p.publish();
    }
    const expiresAt = Math.max(a.times.ticketAt, b.times.ticketAt, x.times.ticketAt) + ttlMs;
    await sleep(5000);
    const early = now() - 3000;
    check("expiry: before expiry, A, B and X hear each other", flowing(b, a, early) && flowing(a, x, early) && flowing(x, b, early), `${flow(b, a, early)}, ${flow(a, x, early)}, ${flow(x, b, early)}`);

    await sleep(Math.max(0, expiresAt + 15_000 - now()));
    info(`${rel()} original tickets expired 15 s ago; refreshes A ${a.refreshes.map((t) => rel(t)).join(",")}, B ${b.refreshes.map((t) => rel(t)).join(",")}, X none`);
    check("expiry: A and B refreshed at ~75% of the lifetime", a.refreshes.length >= 1 && b.refreshes.length >= 1, `A ${a.refreshes.map((t) => rel(t)).join(",")}, B ${b.refreshes.map((t) => rel(t)).join(",")}`);
    const open = everyone.slice(0, 3).map((p) => `${p.uid} ${p.socket?.isOpen ? "open" : "closed"}`);
    check("expiry: all sockets stay open after the original expiry", [a, b, x].every((p) => p.socket?.isOpen), open.join(", "));

    const cAt = now();
    await c.join();
    await c.publish();
    await sleep(8000);
    const sinceC = now() - 4000;
    check(
      "expiry: late joiner C after expiry is pulled by A and B (refreshed, no 401)",
      flowing(a, c, sinceC) && flowing(b, c, sinceC) && [...pullStatuses(a, cAt), ...pullStatuses(b, cAt)].every((s) => s >= 200 && s < 300),
      `${flow(a, c, sinceC)}, ${flow(b, c, sinceC)}; pulls A ${pullStatuses(a, cAt).join(",")}, B ${pullStatuses(b, cAt).join(",")}`
    );
    check(
      "expiry (control): un-refreshed X cannot pull C (401)",
      received(x, c, "audio", sinceC) === 0 && pullStatuses(x, cAt).every((s) => s === 401),
      `${flow(x, c, sinceC)}; pulls X ${pullStatuses(x, cAt).join(",") || "none"}`
    );

    await sleep(Math.max(0, expiresAt + 45_000 - now()));
    info(`${rel()} A's socket drops (reconnect with refresh-before-connect)`);
    const aBlip = await a.blipAndReconnect(20_000);
    await sleep(6000);
    const sinceA = now() - 3000;
    check(
      "expiry: A's reconnect after the original expiry works; media both ways with B and C",
      aBlip.ok && flowing(b, a, sinceA) && flowing(c, a, sinceA) && flowing(a, b, sinceA) && flowing(a, c, sinceA),
      `${aBlip.ok ? "reconnected" : "FAILED"} (${aBlip.attempts} attempts, statuses ${aBlip.statuses.join(",") || "none"}); ${flow(b, a, sinceA)}, ${flow(c, a, sinceA)}, ${flow(a, b, sinceA)}, ${flow(a, c, sinceA)}`
    );

    info(`${rel()} X's socket drops (control: reconnect with its expired ticket)`);
    const xBlip = await x.blipAndReconnect(15_000);
    check(
      "expiry (control): un-refreshed X cannot reconnect (401)",
      !xBlip.ok && xBlip.statuses.length > 0 && xBlip.statuses.every((s) => s === 401),
      `${xBlip.ok ? "reconnected" : "rejected"} after ${xBlip.attempts} attempts, statuses ${xBlip.statuses.join(",") || "none"}`
    );

    // D joins once the FIRST refreshed tickets (issued at ~75% of the original) have expired too.
    const firstRefreshExpiry = Math.max(a.refreshes[0] ?? 0, b.refreshes[0] ?? 0) + ttlMs;
    await sleep(Math.max(0, firstRefreshExpiry + 10_000 - now()));
    info(`${rel()} first refreshed tickets expired; refreshes A ${a.refreshes.length}, B ${b.refreshes.length}`);
    const dAt = now();
    await d.join();
    await d.publish();
    await sleep(8000);
    const sinceD = now() - 4000;
    check(
      "expiry: refresh keeps chaining (late joiner D after the first refreshed tickets expired is pulled by A and B)",
      flowing(a, d, sinceD) && flowing(b, d, sinceD) && [...pullStatuses(a, dAt), ...pullStatuses(b, dAt)].every((s) => s >= 200 && s < 300),
      `${flow(a, d, sinceD)}, ${flow(b, d, sinceD)}; refreshes A ${a.refreshes.length}, B ${b.refreshes.length}`
    );

    await sleep(Math.max(0, t0 + totalMs - now()));
    const closes = [a, b, c, d].flatMap((p) => p.sockets.flatMap((s) => s.closes.filter((cl) => !cl.ours).map((cl) => `${p.uid} ${cl.code}`)));
    check("expiry: no socket closed by the room", closes.length === 0, closes.join(", ") || "none");
  } catch (error) {
    check("expiry: flow completed", false, error instanceof Error ? error.message : String(error));
  } finally {
    const closed = await Promise.all(everyone.map((p) => p.leave().catch(() => null)));
    info(`cleanup tracks/close: ${closed.map((r, i) => `${everyone[i]!.uid} ${r ?? "-"}`).join(", ")}`);
    const ended = await room.end().catch(() => 0);
    check("expiry: cleanup, room ended", ended >= 200 && ended < 300, String(ended));
  }
}
