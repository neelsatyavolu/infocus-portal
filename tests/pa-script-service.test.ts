import { beforeEach, expect, it, vi } from "vitest";
import { buildPaScript } from "@/src/lib/pa-script";

const db = vi.hoisted(() => ({
  schoolCalendarDay: { findMany: vi.fn() },
  masterCalendarEntry: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
  paScript: { upsert: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }
}));
const bulletin = vi.hoisted(() => vi.fn());
vi.mock("@/src/server/teleprompter-bulletin", () => ({ loadA2Bulletin: bulletin }));
const role = vi.hoisted(() => vi.fn());
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformRoleForEmail: role,
  hasPlatformRole: (value: string | null) => Boolean(value)
}));
import { loadPaPage, savePaScript } from "@/src/server/pa-scripts";

const actor = { userId: "alex", email: "alex@example.com" };
const now = new Date("2026-09-09T17:00:00Z");
const stored = () => ({ date: "2026-09-14", content: buildPaScript("2026-09-14", ["Alex Kim", "Jordan Lee"]), anchorName: "Alex Kim", coanchorName: "Jordan Lee", version: 1 });

beforeEach(() => {
  vi.resetAllMocks();
  bulletin.mockResolvedValue({ content: "", announcements: [], autofill: { status: "ok" } });
  db.schoolCalendarDay.findMany.mockResolvedValue([]);
  db.masterCalendarEntry.findUnique.mockResolvedValue({ content: "<p><strong>PA Announcers:</strong></p><p>Alex & Jordan</p>" });
  db.user.findMany.mockResolvedValue([
    { id: "alex", name: "Alex Kim", nickname: null },
    { id: "jordan", name: "Jordan Lee", nickname: null }
  ]);
  role.mockResolvedValue(null);
  db.paScript.upsert.mockResolvedValue(stored());
  db.paScript.findUnique.mockResolvedValue(stored());
  db.paScript.updateMany.mockResolvedValue({ count: 1 });
});

it("opens the upcoming script for assigned registered users without workspace membership", async () => {
  const data = await loadPaPage(actor, now);
  expect(data.date).toBe("2026-09-14");
  expect(data.canEdit).toBe(true);
  expect(data.announcers).toEqual(["Alex Kim", "Jordan Lee"]);
  expect(data.script?.content).toContain("Alex Kim");
});

it("makes other students read-only and rejects direct writes", async () => {
  const other = { ...actor, userId: "other" };
  expect((await loadPaPage(other, now)).canEdit).toBe(false);
  await expect(savePaScript(other, { date: "2026-09-14", content: "changed", version: 1 }, now)).rejects.toThrow("FORBIDDEN");
  expect(db.paScript.updateMany).not.toHaveBeenCalled();
});

it("allows producers and checks the version atomically on save", async () => {
  role.mockResolvedValue("ASSOCIATE_PRODUCER");
  const data = await savePaScript({ ...actor, userId: "producer" }, { date: "2026-09-14", content: "Edited announcement", version: 1 }, now);
  expect(data.script).toEqual({ content: "Edited announcement", version: 2 });
  expect(db.paScript.updateMany.mock.calls[0][0].where).toEqual({ date: "2026-09-14", version: 1 });
});

it("rejects stale drafts and concurrent writes without overwriting", async () => {
  await expect(savePaScript(actor, { date: "2026-09-14", content: "stale", version: 0 }, now)).rejects.toThrow("CONFLICT");
  expect(db.paScript.updateMany).not.toHaveBeenCalled();
  db.paScript.updateMany.mockResolvedValue({ count: 0 });
  await expect(savePaScript(actor, { date: "2026-09-14", content: "racing", version: 1 }, now)).rejects.toThrow("CONFLICT");
});

it("syncs reassigned names on refresh while preserving announcement edits", async () => {
  const script = stored();
  script.content = script.content.replace("[announcement]", "Keep this edited announcement.");
  db.paScript.upsert.mockResolvedValue(script);
  db.masterCalendarEntry.findUnique.mockResolvedValue({ content: "<p>PA Announcers:</p><p>Jordan & Alex</p>" });
  const data = await loadPaPage(actor, now);
  expect(data.script?.content).toContain("Good morning, PALY! I'm Jordan Lee.");
  expect(data.script?.content).toContain("Keep this edited announcement.");
  expect(data.script?.version).toBe(2);
});

it("rejects holidays and past PA dates", async () => {
  await expect(savePaScript(actor, { date: "2026-09-07", content: "holiday", version: 1 }, now)).rejects.toThrow("BAD_REQUEST");
  await expect(savePaScript(actor, { date: "2026-08-31", content: "past", version: 1 }, now)).rejects.toThrow("BAD_REQUEST");
});

it("revokes editing when the announcer is reassigned", async () => {
  db.masterCalendarEntry.findUnique.mockResolvedValue({ content: "<p>PA Announcers:</p><p>Jordan</p>" });
  await expect(savePaScript(actor, { date: "2026-09-14", content: "copy", version: 1 }, now)).rejects.toThrow("FORBIDDEN");
  expect(db.paScript.updateMany).not.toHaveBeenCalled();
});

it("rejects a future PA canceled in the school calendar", async () => {
  db.schoolCalendarDay.findMany.mockResolvedValue([{ date: "2026-09-14", kind: "HOLIDAY", label: "No school" }]);
  await expect(savePaScript(actor, { date: "2026-09-14", content: "copy", version: 1 }, now)).rejects.toThrow("BAD_REQUEST");
  expect(db.paScript.updateMany).not.toHaveBeenCalled();
});

it("does not overwrite a save racing with automatic name refresh", async () => {
  db.masterCalendarEntry.findUnique.mockResolvedValue({ content: "<p>PA Announcers:</p><p>Jordan & Alex</p>" });
  db.paScript.updateMany.mockResolvedValue({ count: 0 });
  await expect(loadPaPage(actor, now)).rejects.toThrow("CONFLICT");
});


it("auto-fills untouched PA scripts with the shared Gemini bulletin for the PA date", async () => {
  bulletin.mockResolvedValue({ content: "TV cues", announcements: [{ announcement: "First announcement." }, { announcement: "Second announcement." }], autofill: { status: "ok" } });
  const data = await loadPaPage(actor, now);
  expect(bulletin).toHaveBeenCalledWith(new Date("2026-09-14T12:00:00Z"), { pa: true });
  expect(data.script?.content).toContain("Co-Anchor: First announcement.\n\nAnchor: Second announcement.");
  expect(data.script?.content).not.toContain("[announcement]");
  expect(data.script?.content).toContain("I'm Alex Kim");
  expect(data.script?.version).toBe(2);
  expect(db.paScript.updateMany.mock.calls[0][0].where).toEqual({ date: "2026-09-14", version: 1 });
});

it("does not regenerate edited scripts or generate for read-only viewers", async () => {
  db.paScript.upsert.mockResolvedValue({ ...stored(), content: "Custom PA copy" });
  expect((await loadPaPage(actor, now)).script?.content).toBe("Custom PA copy");
  db.paScript.upsert.mockResolvedValue(stored());
  await loadPaPage({ ...actor, userId: "other" }, now);
  expect(bulletin).not.toHaveBeenCalled();
});

it("keeps placeholders retryable when unavailable and reports PA-specific warnings", async () => {
  bulletin.mockResolvedValue({ content: "", announcements: [], autofill: { status: "unavailable", message: "A2 was created with empty announcement slots." } });
  const data = await loadPaPage(actor, now);
  expect(data.script?.content).toBe(stored().content);
  expect(data).toHaveProperty("autofill.message", "The PA script was created with empty announcement slots.");
  expect(db.paScript.updateMany).not.toHaveBeenCalled();
});

it("does not overwrite edits saved while Gemini is running", async () => {
  bulletin.mockResolvedValue({ content: "", announcements: [{ announcement: "Generated copy" }], autofill: { status: "ok" } });
  db.paScript.updateMany.mockResolvedValue({ count: 0 });
  await expect(loadPaPage(actor, now)).rejects.toThrow("CONFLICT");
});

it("regenerates edited scripts and saves fresh announcements with current names", async () => {
  db.paScript.findUnique.mockResolvedValue({ ...stored(), content: "Custom copy" });
  bulletin.mockResolvedValue({ announcements: [{ announcement: "Fresh announcement." }], autofill: { status: "ok" } });
  const data = await savePaScript(actor, { date: "2026-09-14", version: 1, regenerate: true }, now);
  expect(data.script.content).toContain("Co-Anchor: Fresh announcement.");
  expect(data.script.content).toContain("I'm Alex Kim");
  expect(data.script.content).not.toContain("Custom copy");
  expect(data.script.version).toBe(2);
});

it("keeps existing copy when regeneration has no announcements", async () => {
  await expect(savePaScript(actor, { date: "2026-09-14", version: 1, regenerate: true }, now)).rejects.toThrow("PA_REGENERATE_EMPTY");
  expect(db.paScript.updateMany).not.toHaveBeenCalled();
});

it("checks regeneration access and stale versions before calling Gemini", async () => {
  await expect(savePaScript({ ...actor, userId: "other" }, { date: "2026-09-14", version: 1, regenerate: true }, now)).rejects.toThrow("FORBIDDEN");
  await expect(savePaScript(actor, { date: "2026-09-14", version: 2, regenerate: true }, now)).rejects.toThrow("CONFLICT");
  expect(bulletin).not.toHaveBeenCalled();
});

it("protects saves made during regeneration", async () => {
  bulletin.mockResolvedValue({ announcements: [{ announcement: "Fresh copy" }], autofill: { status: "ok" } });
  db.paScript.updateMany.mockResolvedValue({ count: 0 });
  await expect(savePaScript(actor, { date: "2026-09-14", version: 1, regenerate: true }, now)).rejects.toThrow("CONFLICT");
});
