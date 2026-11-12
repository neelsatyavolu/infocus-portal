import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  guestLink: { findUnique: vi.fn() },
  mediaVersion: { findUnique: vi.fn() }
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/auth", () => ({ requireUserId: vi.fn(), syncUserProfile: vi.fn() }));
vi.mock("@/src/lib/media-playback", () => ({
  resolvePlaybackUrl: vi.fn(async (version: { id: string }) => `https://drive.example.invalid/play/${version.id}.mp4`),
  resolveThumbnailUrl: vi.fn(async () => null)
}));
vi.mock("@/components/review-shell", () => ({ ReviewShell: () => null }));
const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (jar.value === undefined ? undefined : { value: jar.value }) })
}));
const rate = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/src/server/shared-rate-limit", () => ({
  checkSharedRateLimit: vi.fn(async () => ({ allowed: rate.allowed, remaining: 0 }))
}));

import GuestReviewPage from "@/app/g/[token]/page";
import { POST as unlock } from "@/app/g/[token]/unlock/route";
import { checkSharedRateLimit } from "@/src/server/shared-rate-limit";
import { GET as getImage } from "@/app/api/media/[mediaId]/versions/[versionId]/image/route";
import { ReviewShell } from "@/components/review-shell";
import { GUEST_PASSCODE_PROOF_TTL_MS, hashPasscode, issueGuestCredential } from "@/src/lib/guest-links";
import type { MediaReviewDto } from "@/src/lib/types";
import { requireCommentActor } from "@/src/server/comment-access";
import { requireGuestLink } from "@/src/server/guest-access";

const TOKEN = "tok_abby_dummy_token_123456";

function version(id: string, versionNumber: number, comments: { id: string; body: string }[] = []) {
  return {
    id,
    versionNumber,
    mediaItemId: "media_otto",
    bunnyVideoId: null,
    sourceType: "VIDEO",
    status: "READY",
    approvalStatus: "PENDING",
    airedAt: null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    comments: comments.map((comment) => ({
      ...comment,
      mediaVersionId: id,
      authorId: "user_sage",
      author: { id: "user_sage", name: "Sage", nickname: null, email: "sage@example.edu" },
      timeSeconds: 1,
      frameNumber: null,
      xPct: null,
      yPct: null,
      targetType: "TIMESTAMP",
      createdAt: new Date("2026-11-01T00:00:00Z"),
      resolvedAt: null,
      parentCommentId: null
    }))
  };
}

function guestLink(overrides: Record<string, unknown> = {}) {
  const shared = version("ver_shared", 1, [{ id: "c_shared", body: "shared-cut note" }]);
  const later = version("ver_later_draft", 2, [{ id: "c_later", body: "internal draft note" }]);
  return {
    id: "link_abby",
    token: TOKEN,
    permission: "COMMENT",
    passcodeHash: null as string | null,
    revokedAt: null,
    expiresAt: null,
    projectId: null,
    mediaVersion: {
      ...shared,
      mediaItem: {
        id: "media_otto",
        projectId: "proj_otto",
        title: "Otto package",
        folder: null,
        currentVersion: later,
        project: { id: "proj_otto", name: "Otto project", workspaceId: "ws_1", workspace: { id: "ws_1" } },
        versions: [later, shared]
      }
    },
    project: null,
    ...overrides
  };
}

function shellProps(node: React.ReactNode): { data: MediaReviewDto; guestToken?: string } | null {
  if (Array.isArray(node)) return node.map(shellProps).find(Boolean) ?? null;
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return null;
  if (node.type === ReviewShell) return node.props as unknown as { data: MediaReviewDto; guestToken?: string };
  return shellProps(node.props.children);
}

async function renderPage(proofCookie?: string, searchParams: { error?: string } = {}) {
  jar.value = proofCookie;
  const tree = await GuestReviewPage({
    params: Promise.resolve({ token: TOKEN }),
    searchParams: Promise.resolve(searchParams)
  });
  return shellProps(tree);
}

const passcodeLink = () => guestLink({ passcodeHash: hashPasscode("4321") });
const credentialFor = (link: ReturnType<typeof guestLink>, now?: number) =>
  issueGuestCredential({ id: link.id, token: link.token, passcodeHash: link.passcodeHash ?? "" }, now);

beforeEach(() => {
  vi.clearAllMocks();
  jar.value = undefined;
  rate.allowed = true;
  vi.stubEnv("APP_AUTH_SECRET", "test-secret-for-guest-proofs");
  vi.stubGlobal("React", React);
  db.guestLink.findUnique.mockImplementation(async () => guestLink());
  db.mediaVersion.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    mediaItemId: "media_otto",
    sourceType: "IMAGE",
    imageMimeType: "image/png",
    imageBase64: Buffer.from("DUMMY-IMAGE").toString("base64"),
    updatedAt: new Date(),
    mediaItem: { projectId: "proj_otto", project: { workspaceId: "ws_1" } }
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("guest link passcode is enforced on every guest path", () => {
  beforeEach(() => {
    db.guestLink.findUnique.mockImplementation(async () => passcodeLink());
  });

  it("refuses the bare token for a passcode link", async () => {
    await expect(requireGuestLink(TOKEN, { mediaVersionId: "ver_shared" })).rejects.toThrow("FORBIDDEN");
    expect(db.guestLink.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { token: TOKEN } }));
  });

  it("accepts the credential the page issues after the passcode", async () => {
    const guest = await requireGuestLink(credentialFor(passcodeLink()), { mediaVersionId: "ver_shared" });
    expect(guest.projectId).toBe("proj_otto");
  });

  it("refuses tampered, expired or other-link proofs", async () => {
    const good = credentialFor(passcodeLink());
    const [, exp, sig] = good.split(".");
    const forged = `${TOKEN}.${Number(exp) + 1000}.${sig}`;
    const expired = credentialFor(passcodeLink(), Date.now() - GUEST_PASSCODE_PROOF_TTL_MS - 1000);
    const otherLink = issueGuestCredential({ id: "link_other", token: TOKEN, passcodeHash: hashPasscode("4321") });
    const oldPasscode = issueGuestCredential({ id: "link_abby", token: TOKEN, passcodeHash: hashPasscode("1111") });
    for (const credential of [forged, expired, otherLink, oldPasscode, `${TOKEN}.garbage`, `${TOKEN}.1.2.3`]) {
      await expect(requireGuestLink(credential)).rejects.toThrow("FORBIDDEN");
    }
  });

  it("refuses the image route with the bare token and serves it with the credential", async () => {
    const call = (guestToken: string) =>
      getImage(
        new Request(`http://localhost/api/media/media_otto/versions/ver_shared/image?guestToken=${encodeURIComponent(guestToken)}`),
        { params: Promise.resolve({ mediaId: "media_otto", versionId: "ver_shared" }) }
      );
    expect((await call(TOKEN)).status).toBe(403);
    const ok = await call(credentialFor(passcodeLink()));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("DUMMY-IMAGE");
  });

  it("refuses guest comments and replies with the bare token", async () => {
    await expect(requireCommentActor("ver_shared", TOKEN)).rejects.toThrow("FORBIDDEN");
    const actor = await requireCommentActor("ver_shared", credentialFor(passcodeLink()));
    expect(actor.actorType).toBe("guest");
  });

  it("the page hands ReviewShell and image URLs a working credential, not the bare token", async () => {
    const base = passcodeLink();
    const images = base.mediaVersion.mediaItem.versions.map((v) => ({ ...v, sourceType: "IMAGE" }));
    const link = { ...base, mediaVersion: { ...base.mediaVersion, mediaItem: { ...base.mediaVersion.mediaItem, versions: images } } };
    db.guestLink.findUnique.mockImplementation(async () => link);

    expect(await renderPage()).toBeNull();
    const props = await renderPage(credentialFor(link));
    expect(props?.guestToken).toMatch(new RegExp(`^${TOKEN}\\.\\d+\\.`));
    await expect(requireGuestLink(props!.guestToken!)).resolves.toBeTruthy();
    const imageUrl = props!.data.versions[0].imageUrl!;
    expect(new URL(imageUrl, "http://localhost").searchParams.get("guestToken")).toBe(props!.guestToken);
  });

  it("links without a passcode keep working with the bare token", async () => {
    db.guestLink.findUnique.mockImplementation(async () => guestLink());
    await expect(requireGuestLink(TOKEN, { mediaVersionId: "ver_shared" })).resolves.toBeTruthy();
    expect((await renderPage())?.guestToken).toBe(TOKEN);
  });
});

describe("version-scoped guest link page", () => {
  it("shows only the linked version and its comments", async () => {
    const props = await renderPage();
    expect(props?.data.versions.map((v) => v.id)).toEqual(["ver_shared"]);
    expect(props?.data.comments.map((c) => c.body)).toEqual(["shared-cut note"]);
    expect(props?.data.currentVersionId).toBe("ver_shared");
  });

  it("a project link still shows every version", async () => {
    const versionLink = guestLink();
    const { mediaItem } = versionLink.mediaVersion;
    db.guestLink.findUnique.mockImplementation(async () =>
      guestLink({
        mediaVersion: null,
        projectId: "proj_otto",
        project: { id: "proj_otto", workspaceId: "ws_1", mediaItems: [{ ...mediaItem, currentVersion: mediaItem.versions[0] }] }
      })
    );
    const props = await renderPage();
    expect(props?.data.versions.map((v) => v.id)).toEqual(["ver_later_draft", "ver_shared"]);
    expect(props?.data.comments).toHaveLength(2);
  });
});

describe("guest passcode unlock", () => {
  function submit(passcode: string | null, ip = "203.0.113.9") {
    const form = new FormData();
    if (passcode !== null) form.set("passcode", passcode);
    return unlock(
      new Request(`https://portal.example.edu/g/${TOKEN}/unlock`, {
        method: "POST",
        headers: { "cf-connecting-ip": ip },
        body: form
      }),
      { params: Promise.resolve({ token: TOKEN }) }
    );
  }

  beforeEach(() => {
    db.guestLink.findUnique.mockImplementation(async () => passcodeLink());
  });

  it("sets a link-scoped proof cookie on the right passcode and keeps it out of the URL", async () => {
    const response = await submit("4321");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://portal.example.edu/g/${TOKEN}`);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/infocus_guest_proof=/);
    expect(cookie).toMatch(new RegExp(`Path=/g/${TOKEN}`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toContain("4321");

    const value = decodeURIComponent(cookie.split(";")[0].split("=")[1]);
    expect(await renderPage(value)).not.toBeNull();
  });

  it("sends a wrong passcode back with an error and no cookie", async () => {
    const response = await submit("0000");
    expect(response.headers.get("location")).toBe(`https://portal.example.edu/g/${TOKEN}?error=passcode`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("limits attempts per link and address, even with the right passcode", async () => {
    rate.allowed = false;
    const response = await submit("4321");
    expect(response.headers.get("location")).toBe(`https://portal.example.edu/g/${TOKEN}?error=limit`);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(checkSharedRateLimit).toHaveBeenCalledWith(`guest-passcode:${TOKEN}:203.0.113.9`, {
      max: 5,
      windowMs: 15 * 60 * 1000
    });
  });

  it("ignores ?passcode= in the URL and refuses a cookie for another link", async () => {
    expect(await renderPage(undefined, { error: "passcode" })).toBeNull();
    const other = issueGuestCredential({ id: "link_other", token: "tok_other_link_000", passcodeHash: hashPasscode("4321") });
    expect(await renderPage(other)).toBeNull();
  });
});
