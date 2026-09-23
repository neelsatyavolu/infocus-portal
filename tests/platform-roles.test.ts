import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({
  prisma: {}
}));

import {
  buildPlatformAccess,
  canEditPackageCycle,
  hardcodedPlatformRole,
  hasPlatformRole,
  isAdviser,
  isExecutiveProducer,
  isPlatformAdminEmail,
  isPlatformSuperAdmin,
  PACKAGE_ADVISER_EMAIL,
  PLATFORM_SUPER_ADMIN_EMAIL,
  seesStudentGrades
} from "@/src/lib/platform-admin";

describe("producer role hierarchy", () => {
  it("ranks associate producer below executive producer and super admin", () => {
    expect(hasPlatformRole("ASSOCIATE_PRODUCER", "ASSOCIATE_PRODUCER")).toBe(true);
    expect(hasPlatformRole("ASSOCIATE_PRODUCER", "EXECUTIVE_PRODUCER")).toBe(false);
    expect(hasPlatformRole("EXECUTIVE_PRODUCER", "ASSOCIATE_PRODUCER")).toBe(true);
    expect(hasPlatformRole("SUPER_ADMIN", "EXECUTIVE_PRODUCER")).toBe(true);
  });

  it("gives the adviser executive-producer level permissions", () => {
    expect(hasPlatformRole("ADVISER", "EXECUTIVE_PRODUCER")).toBe(true);
    expect(hasPlatformRole("ADVISER", "ASSOCIATE_PRODUCER")).toBe(true);
    expect(buildPlatformAccess("ADVISER").canManageAllowedEmails).toBe(true);
  });

  it("treats no role as having no access", () => {
    expect(hasPlatformRole(null, "ASSOCIATE_PRODUCER")).toBe(false);
    expect(buildPlatformAccess(null).canManageWorkspaces).toBe(false);
  });
});

describe("stage 3 approval eligibility", () => {
  // The adviser holds EP-level permissions but signs off at stage 2 only; stage 3
  // requires two actual executive producers, so the two checks must stay distinct.
  it("does not count the adviser as an executive producer", () => {
    expect(isExecutiveProducer("EXECUTIVE_PRODUCER")).toBe(true);
    expect(isExecutiveProducer("SUPER_ADMIN")).toBe(true);
    expect(isExecutiveProducer("ADVISER")).toBe(false);
    expect(isExecutiveProducer("ASSOCIATE_PRODUCER")).toBe(false);
    expect(isExecutiveProducer(null)).toBe(false);
  });

  it("identifies the adviser for stage 2", () => {
    expect(isAdviser("ADVISER")).toBe(true);
    expect(isAdviser("EXECUTIVE_PRODUCER")).toBe(false);
    expect(isAdviser(null)).toBe(false);
  });

  it("hardcodes the adviser and super-admin emails", () => {
    expect(hardcodedPlatformRole(PACKAGE_ADVISER_EMAIL)).toBe("ADVISER");
    expect(hardcodedPlatformRole(PLATFORM_SUPER_ADMIN_EMAIL)).toBe("SUPER_ADMIN");
    expect(hardcodedPlatformRole("ep@pausd.org")).toBeNull();
  });
});

describe("platform access flags", () => {
  it("treats the adviser as a de facto super admin for platform administration", () => {
    expect(isPlatformSuperAdmin("SUPER_ADMIN")).toBe(true);
    expect(isPlatformSuperAdmin("ADVISER")).toBe(true);
    expect(isPlatformSuperAdmin("EXECUTIVE_PRODUCER")).toBe(false);
    expect(buildPlatformAccess("SUPER_ADMIN").canManagePlatformRoles).toBe(true);
    expect(buildPlatformAccess("ADVISER").canManagePlatformRoles).toBe(true);
    expect(buildPlatformAccess("EXECUTIVE_PRODUCER").canManagePlatformRoles).toBe(false);
    expect(isPlatformAdminEmail(PLATFORM_SUPER_ADMIN_EMAIL)).toBe(true);
    expect(isPlatformAdminEmail(PACKAGE_ADVISER_EMAIL)).toBe(true);
    expect(isPlatformAdminEmail("ep@pausd.org")).toBe(false);
    expect(isPlatformAdminEmail(null)).toBe(false);
    expect(isPlatformAdminEmail("  ")).toBe(false);
    expect(hardcodedPlatformRole(null)).toBeNull();
  });

  it("hides the student grades tab from executives, the adviser, and super admin", () => {
    expect(seesStudentGrades(null)).toBe(true);
    expect(seesStudentGrades("ASSOCIATE_PRODUCER")).toBe(true);
    expect(seesStudentGrades("EXECUTIVE_PRODUCER")).toBe(false);
    expect(seesStudentGrades("ADVISER")).toBe(false);
    expect(seesStudentGrades("SUPER_ADMIN")).toBe(false);
  });

  it("lets every producer role reach workspaces", () => {
    expect(buildPlatformAccess("ASSOCIATE_PRODUCER").canManageWorkspaces).toBe(true);
    expect(buildPlatformAccess("EXECUTIVE_PRODUCER").canManageWorkspaces).toBe(true);
  });
});

describe("package cycle chart editing", () => {
  it("is reserved for executives, the adviser, and super-admin — not associates", () => {
    expect(canEditPackageCycle("ASSOCIATE_PRODUCER")).toBe(false);
    expect(canEditPackageCycle("EXECUTIVE_PRODUCER")).toBe(true);
    expect(canEditPackageCycle("ADVISER")).toBe(true);
    expect(canEditPackageCycle("SUPER_ADMIN")).toBe(true);
    expect(canEditPackageCycle(null)).toBe(false);
  });
});
