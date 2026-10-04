import type { RoomTicket } from "../src/room-state";

export function ticket(overrides: Partial<RoomTicket> = {}): RoomTicket {
  return { uid: "u-abby", name: "Abby", role: "member", adm: true, iat: 1_000, ...overrides };
}

export const host = ticket({ uid: "u-otto", name: "Otto", role: "host" });
export const member = ticket({ uid: "u-abby", name: "Abby" });
export const sage = ticket({ uid: "u-sage", name: "Sage" });
export const scribe = ticket({ uid: "scribe", name: "Notes", role: "scribe" });
export const knocker = ticket({ uid: "u-sage", name: "Sage", adm: false });
