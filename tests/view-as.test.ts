import { describe, expect, it } from "vitest";
import {
  canControlViewAs,
  canViewAsTarget,
  parseViewAsLimitedActors,
  parseViewAsPayload,
  shouldApplyViewAs
} from "@/src/lib/view-as";
import { PACKAGE_ADVISER_EMAIL, PLATFORM_SUPER_ADMIN_EMAIL } from "@/src/lib/platform-admin";

const LIMITED_EMAIL = "limited@example.edu";
const VIEWER_EMAIL = "viewer@example.com";

describe("view as", () => {
  it("is available to the super admin and limited actors", () => {
    expect(canControlViewAs(PLATFORM_SUPER_ADMIN_EMAIL)).toBe(true);
    expect(canControlViewAs(PACKAGE_ADVISER_EMAIL)).toBe(true);
    expect(canControlViewAs(LIMITED_EMAIL)).toBe(true);
    expect(canControlViewAs("LIMITED@example.edu")).toBe(true);
    expect(canControlViewAs("producer@pausd.org")).toBe(false);
    expect(canControlViewAs(null)).toBe(false);
  });

  it("lets a limited actor view as only their granted account", () => {
    expect(canViewAsTarget(LIMITED_EMAIL, VIEWER_EMAIL)).toBe(true);
    expect(canViewAsTarget(LIMITED_EMAIL, "Viewer@example.com")).toBe(true);
    expect(canViewAsTarget(LIMITED_EMAIL, PLATFORM_SUPER_ADMIN_EMAIL)).toBe(false);
    expect(canViewAsTarget(LIMITED_EMAIL, "producer@pausd.org")).toBe(false);
    expect(canViewAsTarget(PLATFORM_SUPER_ADMIN_EMAIL, "anyone@pausd.us")).toBe(true);
    expect(canViewAsTarget(PACKAGE_ADVISER_EMAIL, "anyone@pausd.us")).toBe(true);
    expect(canViewAsTarget("producer@pausd.org", VIEWER_EMAIL)).toBe(false);
  });

  it("applies only when the signed actor still matches the live session", () => {
    const token = { actorUserId: "admin", targetUserId: "student" };
    expect(
      shouldApplyViewAs({
        actorUserId: "admin",
        actorEmail: PLATFORM_SUPER_ADMIN_EMAIL,
        token
      })
    ).toBe(true);
    expect(
      shouldApplyViewAs({
        actorUserId: "other",
        actorEmail: PLATFORM_SUPER_ADMIN_EMAIL,
        token
      })
    ).toBe(false);
    expect(
      shouldApplyViewAs({
        actorUserId: "admin",
        actorEmail: "ap@pausd.org",
        token
      })
    ).toBe(false);
    expect(
      shouldApplyViewAs({
        actorUserId: "admin",
        actorEmail: PLATFORM_SUPER_ADMIN_EMAIL,
        token: { actorUserId: "admin", targetUserId: "admin" }
      })
    ).toBe(false);
    expect(
      shouldApplyViewAs({
        actorUserId: "ian",
        actorEmail: LIMITED_EMAIL,
        token: { actorUserId: "ian", targetUserId: "neel-gmail" },
        targetEmail: VIEWER_EMAIL
      })
    ).toBe(true);
    expect(
      shouldApplyViewAs({
        actorUserId: "ian",
        actorEmail: LIMITED_EMAIL,
        token: { actorUserId: "ian", targetUserId: "someone" },
        targetEmail: "producer@pausd.org"
      })
    ).toBe(false);
  });

  it("rejects malformed payloads", () => {
    expect(parseViewAsPayload(null)).toBeNull();
    expect(parseViewAsPayload({ v: 1, actorUserId: "a" })).toBeNull();
    expect(parseViewAsPayload({ v: 1, actorUserId: "a", targetUserId: "b" })).toEqual({
      actorUserId: "a",
      targetUserId: "b"
    });
  });

  it("parses limited View as grants from env", () => {
    expect(parseViewAsLimitedActors(" A@x.edu = b@y.com | C@y.com ; bad ; d@x.edu= ")).toEqual({
      "a@x.edu": ["b@y.com", "c@y.com"]
    });
    expect(parseViewAsLimitedActors(undefined)).toEqual({});
  });
});
