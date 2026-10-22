import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), overview: vi.fn() }));
vi.mock("@/src/lib/current-app-user", () => ({ getCurrentAppUser: mocks.currentUser }));
vi.mock("@/src/server/show-overview-data", () => ({ loadShowOverview: mocks.overview }));
vi.mock("@/src/server/as-api-json", () => ({ asApiJson: <T,>(data: T) => data }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) throw error;
  }
}));
vi.mock("@/app/(app)/editing/editing-client", () => ({ default: () => null }));
vi.mock("@/app/(app)/show-roles/the-show-client", () => ({ default: () => null }));

import EditingPage from "@/app/(app)/editing/page";
import ShowRolesPage from "@/app/(app)/show-roles/page";

const search = (params: Record<string, string>) => ({ searchParams: Promise.resolve(params) });

/** The props EditingClient gets inside the page's Suspense. */
function clientProps(node: React.ReactNode) {
  const suspense = node as React.ReactElement<{ children: React.ReactElement<{ initial: unknown }> }>;
  return suspense.props.children.props;
}

describe("/show-roles?link= (older editor apps)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ userId: "u1", platformRole: "ASSOCIATE_PRODUCER" });
    mocks.overview.mockResolvedValue({ date: "2026-10-21" });
  });

  it("sends the link approval to the Editing tab", async () => {
    await expect(ShowRolesPage(search({ link: "ABCD-2345" }))).rejects.toThrow("REDIRECT:/editing?link=ABCD-2345");
    await expect(ShowRolesPage(search({ link: "ABCD-2345", date: "2026-10-21" }))).rejects.toThrow(
      "REDIRECT:/editing?date=2026-10-21&link=ABCD-2345"
    );
    expect(mocks.overview).not.toHaveBeenCalled();
  });

  it("redirects before sign-in, so the code survives it", async () => {
    mocks.currentUser.mockRejectedValue(new Error("UNAUTHORIZED"));
    await expect(ShowRolesPage(search({ link: "ABCD-2345" }))).rejects.toThrow("REDIRECT:/editing?link=ABCD-2345");
    expect(mocks.currentUser).not.toHaveBeenCalled();
  });

  it("opens The Show as before without a link", async () => {
    await ShowRolesPage(search({ date: "2026-10-21" }));
    expect(mocks.overview).toHaveBeenCalledWith("2026-10-21");
  });
});

describe("/editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ userId: "u1", platformRole: "ASSOCIATE_PRODUCER" });
    mocks.overview.mockResolvedValue({ date: "2026-10-21", label: "Wednesday, October 21" });
  });

  it("is for producers only", async () => {
    mocks.currentUser.mockResolvedValue({ userId: "u1", platformRole: null });
    await expect(EditingPage(search({}))).rejects.toThrow("REDIRECT:/access-denied");
    mocks.currentUser.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(EditingPage(search({}))).rejects.toThrow("REDIRECT:/access-denied");
    expect(mocks.overview).not.toHaveBeenCalled();
  });

  it("keeps the link code and the show across sign-in", async () => {
    mocks.currentUser.mockRejectedValue(new Error("UNAUTHORIZED"));
    await expect(EditingPage(search({}))).rejects.toThrow(`REDIRECT:/sign-in?returnTo=${encodeURIComponent("/editing")}`);
    await expect(EditingPage(search({ link: "ABCD-2345" }))).rejects.toThrow(
      `REDIRECT:/sign-in?returnTo=${encodeURIComponent("/editing?view=machines&link=ABCD-2345")}`
    );
    await expect(EditingPage(search({ date: "2026-10-21", view: "settings" }))).rejects.toThrow(
      `REDIRECT:/sign-in?returnTo=${encodeURIComponent("/editing?date=2026-10-21&view=settings")}`
    );
  });

  it("loads the same show The Show would open, or the one in ?date=", async () => {
    expect(clientProps(await EditingPage(search({})))).toEqual({
      initial: { key: "", overview: { date: "2026-10-21", label: "Wednesday, October 21" } }
    });
    expect(mocks.overview).toHaveBeenLastCalledWith(null);
    await EditingPage(search({ date: "2026-10-23" }));
    expect(mocks.overview).toHaveBeenLastCalledWith("2026-10-23");
  });

  it("leaves a bad ?date= to the client", async () => {
    expect(clientProps(await EditingPage(search({ date: "tomorrow" })))).toEqual({ initial: null });
    expect(mocks.overview).not.toHaveBeenCalled();
  });
});
