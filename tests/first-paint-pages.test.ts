import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pages that load their first data on the server: each passes what its GET route would send,
 * with the same access checks, and falls back to a client load (null) when the server load fails.
 */
const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  currentUser: vi.fn(),
  livestreams: vi.fn(),
  members: vi.fn(),
  overview: vi.fn(),
  cycles: vi.fn(),
  pa: vi.fn(),
  roles: vi.fn(),
  users: vi.fn(),
  requests: vi.fn(),
  settings: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/platform-admin", async (original) => ({
  ...(await original<typeof import("@/src/lib/platform-admin")>()),
  getPlatformAccess: mocks.getPlatformAccess
}));
vi.mock("@/src/lib/current-app-user", () => ({ getCurrentAppUser: mocks.currentUser }));
vi.mock("@/src/server/livestreams-payload", () => ({ loadLivestreamsPayload: mocks.livestreams }));
vi.mock("@/src/server/member-notes", () => ({ listProducerMembers: mocks.members }));
vi.mock("@/src/server/show-overview-data", () => ({ loadShowOverview: mocks.overview }));
vi.mock("@/src/server/package-cycles-data", () => ({ loadPackageCycles: mocks.cycles }));
vi.mock("@/src/server/pa-scripts", () => ({ loadPaPage: mocks.pa }));
vi.mock("@/src/server/platform-admin-lists", () => ({
  listRoleAssignments: mocks.roles,
  listPlatformUsers: mocks.users,
  listAccessRequests: mocks.requests
}));
vi.mock("@/src/server/program-settings", () => ({ getProgramSettings: mocks.settings }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  unstable_rethrow: () => undefined
}));
// The client components only receive props here.
vi.mock("@/app/(app)/livestreams/livestreams-client", () => ({ default: () => null }));
vi.mock("@/app/(app)/members/members-client", () => ({ default: () => null }));
vi.mock("@/app/(app)/show-roles/the-show-client", () => ({ default: () => null }));
vi.mock("@/app/(app)/show-roles/show-skeleton", () => ({ GeneratorSkeleton: () => null, ShowSkeleton: () => null }));
vi.mock("@/app/(app)/admin/admin-client", () => ({ default: () => null }));
vi.mock("@/app/(app)/package-cycles/cycle-dates-client", () => ({ default: () => null }));
vi.mock("@/app/(app)/announcements/pa/pa-client", () => ({ default: () => null }));

import AdminPage from "@/app/(app)/admin/page";
import PaAnnouncementsPage from "@/app/(app)/announcements/pa/page";
import LivestreamsPage from "@/app/(app)/livestreams/page";
import MembersPage from "@/app/(app)/members/page";
import PackageCyclesPage from "@/app/(app)/package-cycles/page";
import ShowRolesPage from "@/app/(app)/show-roles/page";

type Element = { props: Record<string, unknown> };

function initialOf(element: unknown) {
  return (element as Element).props.initialData;
}

/** The Show wraps its client in Suspense. */
function showInitial(element: unknown) {
  return ((element as Element).props.children as Element).props.initial;
}

function asRole(role: string | null) {
  mocks.getPlatformAccess.mockResolvedValue({
    role,
    canManageWorkspaces: role !== null,
    canManageAllowedEmails: role === "EXECUTIVE_PRODUCER" || role === "SUPER_ADMIN",
    canManagePlatformRoles: role === "SUPER_ADMIN",
    isExecutiveProducer: role === "EXECUTIVE_PRODUCER"
  });
  mocks.currentUser.mockResolvedValue({ userId: "abby", platformRole: role });
}

describe("server first paint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.requireUserId.mockResolvedValue("abby");
    mocks.syncUserProfile.mockResolvedValue({ id: "abby", email: "abby@example.edu" });
    asRole("ASSOCIATE_PRODUCER");
  });

  it("Livestreams: loads the payload for this person and role, as JSON", async () => {
    mocks.livestreams.mockResolvedValue({ canManage: true, managers: [{ id: "otto", name: "Otto", nickname: "Ot", email: null }] });
    const data = initialOf(await LivestreamsPage()) as { managers: Array<{ name: string }> };
    expect(mocks.livestreams).toHaveBeenCalledWith(expect.objectContaining({ id: "abby" }), "ASSOCIATE_PRODUCER");
    // Display names applied, like ok() in the API.
    expect(data.managers[0].name).toBe("Ot");
  });

  it("Livestreams: a failed load leaves it to the client", async () => {
    mocks.livestreams.mockRejectedValue(new Error("down"));
    expect(initialOf(await LivestreamsPage())).toBeNull();
  });

  it("Members: loads the roster for producers only", async () => {
    mocks.members.mockResolvedValue({ cycles: [], members: [] });
    expect(initialOf(await MembersPage())).toEqual({ cycles: [], members: [] });

    asRole(null);
    mocks.members.mockClear();
    await expect(MembersPage()).rejects.toThrow("REDIRECT:/access-denied");
    expect(mocks.members).not.toHaveBeenCalled();
  });

  it("The Show: loads the next show, or the ?date= one, and skips the generator", async () => {
    mocks.overview.mockResolvedValue({ date: "2026-10-16" });
    expect(showInitial(await ShowRolesPage({ searchParams: Promise.resolve({}) }))).toEqual({
      key: "",
      overview: { date: "2026-10-16" }
    });
    expect(mocks.overview).toHaveBeenLastCalledWith(null);

    await ShowRolesPage({ searchParams: Promise.resolve({ date: "2026-10-20" }) });
    expect(mocks.overview).toHaveBeenLastCalledWith("2026-10-20");

    mocks.overview.mockClear();
    expect(showInitial(await ShowRolesPage({ searchParams: Promise.resolve({ date: "soon" }) }))).toBeNull();
    expect(showInitial(await ShowRolesPage({ searchParams: Promise.resolve({ generator: "1" }) }))).toBeNull();
    expect(mocks.overview).not.toHaveBeenCalled();
  });

  it("Cycle Dates: loads the cycles for this role", async () => {
    mocks.cycles.mockResolvedValue({ canEdit: true, canEditCycleCount: false, cyclesPerSemester: 3, cycles: [] });
    expect(initialOf(await PackageCyclesPage())).toMatchObject({ canEdit: true, cycles: [] });
    expect(mocks.cycles).toHaveBeenCalledWith("ASSOCIATE_PRODUCER");
  });

  it("PA script: loads the page as this person, names as stored", async () => {
    mocks.pa.mockResolvedValue({ date: "2026-10-16", dateLabel: "Friday", announcers: ["Sage"], canEdit: true, script: null });
    expect(initialOf(await PaAnnouncementsPage())).toMatchObject({ date: "2026-10-16", announcers: ["Sage"] });
    expect(mocks.pa).toHaveBeenCalledWith({ userId: "abby", email: "abby@example.edu" });
  });

  it("Admin: who you are and the lists for executive producers", async () => {
    asRole("EXECUTIVE_PRODUCER");
    const createdAt = new Date("2026-09-01T00:00:00.000Z");
    mocks.roles.mockResolvedValue([{ id: "r1", email: "otto@example.edu", role: "EXECUTIVE_PRODUCER", createdAt }]);
    mocks.users.mockResolvedValue([{ id: "u1", email: "sage@example.edu", name: "Sage", nickname: "S", createdAt }]);
    mocks.requests.mockResolvedValue([]);
    mocks.settings.mockResolvedValue({ cyclesPerSemester: 4 });

    const data = initialOf(await AdminPage()) as {
      me: { permissions: { canManageAllowedEmails: boolean } };
      roles: Array<{ createdAt: string }>;
      users: Array<{ name: string }>;
      cyclesPerSemester: number;
    };
    expect(data.me.permissions.canManageAllowedEmails).toBe(true);
    expect(data.roles[0].createdAt).toBe("2026-09-01T00:00:00.000Z");
    // GET /api/platform/users sends names as stored.
    expect(data.users[0].name).toBe("Sage");
    expect(data.cyclesPerSemester).toBe(4);
  });

  it("Admin: no lists for anyone below executive producer", async () => {
    const data = initialOf(await AdminPage()) as { me: { role: string }; users: unknown[] };
    expect(data.me.role).toBe("ASSOCIATE_PRODUCER");
    expect(data.users).toEqual([]);
    expect(mocks.users).not.toHaveBeenCalled();
    expect(mocks.roles).not.toHaveBeenCalled();
  });
});
