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

import GuestReviewPage from "@/app/g/[token]/page";
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

async function renderPage(passcode?: string) {
  const tree = await GuestReviewPage({
    params: Promise.resolve({ token: TOKEN }),
    searchParams: Promise.resolve(passcode ? { passcode } : {})
  });
  return shellProps(tree);
}

const passcodeLink = () => guestLink({ passcodeHash: hashPasscode("4321") });
const credentialFor = (link: ReturnType<typeof guestLink>, now?: number) =>
  issueGuestCredential({ id: link.id, token: link.token, passcodeHash: link.passcodeHash ?? "" }, now);

beforeEach(() => {
  vi.clearAllMocks();
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
    const props = await renderPage("4321");
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
