import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";

async function body(response: Response) {
  return (await response.json()) as { error: { message: string } };
}

describe("handleRouteError", () => {
  it("passes an app error's message through as a 400 and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Pick a cycle first");
    const response = handleRouteError(error);
    expect(response.status).toBe(400);
    expect((await body(response)).error.message).toBe("Pick a cycle first");
    expect(log).toHaveBeenCalledWith("Unhandled route error", {
      name: "Error",
      message: "Pick a cycle first",
      stack: error.stack
    });
    log.mockRestore();
  });

  it("does not log the known code strings", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const [code, status] of [
      ["UNAUTHORIZED", 401],
      ["FORBIDDEN", 403],
      ["NOT_FOUND", 404],
      ["BAD_REQUEST", 400],
      ["CONFLICT", 409],
      ["GONE", 410],
      ["TOO_MANY_REQUESTS", 429]
    ] as const) {
      expect(handleRouteError(new Error(code)).status).toBe(status);
    }
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("hides database errors from the client and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Prisma.PrismaClientUnknownRequestError(
      "Invalid `prisma.packageProgressRow.findMany()` invocation: (EMAXCONNSESSION) max clients reached",
      { clientVersion: "test" }
    );

    const response = handleRouteError(error);

    expect(response.status).toBe(500);
    const { message } = (await body(response)).error;
    expect(message).not.toMatch(/prisma|EMAXCONNSESSION/i);
    expect(log).toHaveBeenCalledWith("Database error in route", error);
    log.mockRestore();
  });
});
