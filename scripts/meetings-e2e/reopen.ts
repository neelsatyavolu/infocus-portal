/**
 * E2E_SCENARIO=reopen: the room side of reopening a meeting that ended (the Portal part can't be
 * driven from here). A and B talk on generation-0 tickets, both leave, the Portal `ended` event
 * arrives; then a gen-0 ticket must be refused (`ended`, close 4010) on the socket and the media
 * proxy, and the first gen-1 ticket must start a fresh room in which A and B talk again.
 */
import { check, info, isOk, isWelcome, newMeetingId, now, roomClient, sleep, timeout, type RoomSocket } from "./common";
import { Participant } from "./participant";

type Options = { key: CryptoKey; relay: boolean; videoKbps: number };

/** Opens a socket and reports what the room did: the first message and the close code. */
async function probeSocket(open: () => Promise<RoomSocket>) {
  try {
    const socket = await open();
    const first = await timeout(new Promise<string>((resolve) => socket.onMessage((m) => resolve(m.t))), 5000, "first message").catch(() => "none");
    const closed = socket.closes[0]?.code ?? (await timeout(new Promise<number>((resolve) => socket.onClose((c) => resolve(c.code))), 5000, "close").catch(() => null));
    if (closed === null) socket.close();
    return { upgrade: 101, first, close: closed };
  } catch (error) {
    return { upgrade: (error as { status?: number }).status ?? 0, first: "none", close: null };
  }
}

const describeProbe = (p: Awaited<ReturnType<typeof probeSocket>>) => `upgrade ${p.upgrade}, first message ${p.first}, close ${p.close ?? "still open"}`;

export async function runReopenScenario(options: Options) {
  const room = roomClient(newMeetingId("reopen"));
  const make = (uid: string, role: "host" | "member", gen?: number) =>
    new Participant({ room, uid, role, key: options.key, relay: options.relay, videoKbps: options.videoKbps, keyFrameSeconds: 2, ticketGen: gen, log: info });
  console.log(`\n== reopen (meeting ${room.meetingId})`);
  const gen0 = [make("ro-a", "host"), make("ro-b", "member")];
  const gen1 = [make("ro-a", "host", 1), make("ro-b", "member", 1)];
  try {
    for (const p of gen0) {
      await p.join();
      await p.publish();
    }
    await sleep(4000);
    const [a0, b0] = gen0 as [Participant, Participant];
    const heard = (r: Participant, p: Participant) => (r.inbound.get(p.uid)?.audio ?? []).filter((x) => x.sentAt > now() - 3000).length;
    check("reopen: generation 0: A and B talk", heard(a0, b0) > 50 && heard(b0, a0) > 50, `B->A ${heard(a0, b0)}, A->B ${heard(b0, a0)} audio frames in 3 s`);

    for (const p of gen0) await p.leaveLikeBrowser();
    await sleep(1000);
    const ended = await room.event({ t: "ended" });
    check("reopen: Portal `ended` accepted", isOk(ended), String(ended));

    const old = await probeSocket(async () => room.openSocket(await room.ticket("ro-a", "host", true)));
    check("reopen: a gen-0 ticket after `ended` is refused on the socket (ended / 4010)", old.first === "ended" && old.close === 4010, describeProbe(old));
    const oldProxy = await room.proxy("/sessions/new", await room.ticket("ro-a", "host", true), "POST");
    check("reopen: a gen-0 ticket after `ended` is refused by the media proxy", oldProxy.status === 401 || oldProxy.status === 403, `${oldProxy.status} ${oldProxy.body.error ?? ""}`);

    const [a1, b1] = gen1 as [Participant, Participant];
    const reopenAt = now();
    await a1.join();
    const welcome = a1.socket!.messages.find(isWelcome);
    check("reopen: the first gen-1 ticket starts a fresh room (admitted welcome, no stale participants)", Boolean(welcome?.self.admitted) && welcome?.participants.length === 1, `participants ${welcome?.participants.map((p) => p.uid).join(",") ?? "-"}, epoch ${welcome?.epoch}`);
    await a1.publish();
    await b1.join();
    await b1.publish();
    await sleep(5000);
    check("reopen: generation 1: A and B talk again", heard(a1, b1) > 50 && heard(b1, a1) > 50, `B->A ${heard(a1, b1)}, A->B ${heard(b1, a1)} audio frames in 3 s (${((now() - reopenAt) / 1000).toFixed(1)} s after reopening)`);

    const stale = await probeSocket(async () => room.openSocket(await room.ticket("ro-c", "member", true)));
    check("reopen: after reopening, a gen-0 ticket is still refused", stale.first === "ended" && stale.close === 4010, describeProbe(stale));
    const errors = gen1.flatMap((p) => p.errors);
    check("reopen: no pull/close/send errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "none");
  } catch (error) {
    check("reopen: flow completed", false, error instanceof Error ? error.message : String(error));
  } finally {
    await Promise.all(gen1.map((p) => p.leave().catch(() => null)));
    const status = await room.end().catch(() => 0);
    check("reopen: cleanup, room ended", isOk(status), String(status));
  }
}
