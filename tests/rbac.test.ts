import { describe, expect, it } from "vitest";
import {
  canChangeApprovalStatus,
  canComment,
  canInviteMembers,
  canManageProjectMedia,
  canResolveComment,
  canUploadVersion
} from "@/src/lib/rbac";

describe("RBAC matrix", () => {
  it("allows only owner admin to invite members", () => {
    expect(canInviteMembers("OWNER_ADMIN")).toBe(true);
    expect(canInviteMembers("EDITOR")).toBe(false);
    expect(canInviteMembers("REVIEWER")).toBe(false);
  });

  it("allows editor and owner to upload and approve", () => {
    expect(canUploadVersion("OWNER_ADMIN")).toBe(true);
    expect(canUploadVersion("EDITOR")).toBe(true);
    expect(canUploadVersion("REVIEWER")).toBe(false);

    expect(canChangeApprovalStatus("OWNER_ADMIN")).toBe(true);
    expect(canChangeApprovalStatus("EDITOR")).toBe(true);
    expect(canChangeApprovalStatus("REVIEWER")).toBe(false);
  });

  it("allows reviewer comment but resolve own comment only", () => {
    expect(canComment("REVIEWER")).toBe(true);
    expect(canResolveComment("REVIEWER", true)).toBe(true);
    expect(canResolveComment("REVIEWER", false)).toBe(false);
  });

  it("lets managers manage project media without requiring workspace admin role", () => {
    expect(canManageProjectMedia("OWNER_ADMIN", null)).toBe(true);
    expect(canManageProjectMedia("EDITOR", null)).toBe(true);
    expect(canManageProjectMedia("REVIEWER", null)).toBe(false);
    expect(canManageProjectMedia("REVIEWER", "ASSOCIATE_PRODUCER")).toBe(true);
    expect(canManageProjectMedia("REVIEWER", "EXECUTIVE_PRODUCER")).toBe(true);
    expect(canManageProjectMedia("REVIEWER", "ADVISER")).toBe(true);
    expect(canManageProjectMedia("REVIEWER", "SUPER_ADMIN")).toBe(true);
  });
});
