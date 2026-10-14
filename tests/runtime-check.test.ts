import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));

import { runCheck } from "@/src/server/runtime-check";

describe("runCheck", () => {
  it("reports a passing check with its detail", async () => {
    expect(await runCheck(async () => "fine")).toEqual({ ok: true, detail: "fine" });
    expect(await runCheck(async () => undefined)).toEqual({ ok: true });
  });

  it("turns a throw into a failed check so one failure cannot hide the rest", async () => {
    expect(
      await runCheck(async () => {
        throw new Error("boom");
      })
    ).toEqual({ ok: false, detail: "boom" });
  });
});
