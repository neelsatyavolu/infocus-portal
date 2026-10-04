import { qualityFromStats, type ConnectionQuality } from "./layout";

type Counters = { lost: number; received: number };

/** Samples RTCPeerConnection stats: selected-pair RTT plus inbound loss since the last sample. */
export async function sampleQuality(pc: RTCPeerConnection, previous: Counters | null) {
  const report = await pc.getStats();
  let rttMs: number | null = null;
  let lost = 0;
  let received = 0;
  report.forEach((stat: { type?: string; state?: string; nominated?: boolean; currentRoundTripTime?: number; packetsLost?: number; packetsReceived?: number }) => {
    if (stat.type === "candidate-pair" && stat.state === "succeeded" && stat.nominated && typeof stat.currentRoundTripTime === "number") {
      rttMs = stat.currentRoundTripTime * 1000;
    }
    if (stat.type === "inbound-rtp") {
      lost += stat.packetsLost ?? 0;
      received += stat.packetsReceived ?? 0;
    }
  });
  const counters: Counters = { lost, received };
  const dLost = previous ? lost - previous.lost : 0;
  const dReceived = previous ? received - previous.received : 0;
  const lossRatio = dLost + dReceived > 0 ? Math.max(0, dLost) / (dLost + dReceived) : null;
  const quality: ConnectionQuality = qualityFromStats({ rttMs, lossRatio });
  return { quality, counters };
}
