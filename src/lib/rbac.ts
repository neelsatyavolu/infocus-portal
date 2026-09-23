import type { PlatformRole } from "@prisma/client";

export type WorkspaceRole = "OWNER_ADMIN" | "EDITOR" | "REVIEWER";

const roleWeight: Record<WorkspaceRole, number> = {
  OWNER_ADMIN: 3,
  EDITOR: 2,
  REVIEWER: 1
};

export function roleAtLeast(role: WorkspaceRole, minimum: WorkspaceRole) {
  return roleWeight[role] >= roleWeight[minimum];
}

export function canCreateProject(role: WorkspaceRole) {
  return roleAtLeast(role, "EDITOR");
}

export function canInviteMembers(role: WorkspaceRole) {
  return role === "OWNER_ADMIN";
}

export function canUploadVersion(role: WorkspaceRole) {
  return roleAtLeast(role, "EDITOR");
}

export function canChangeApprovalStatus(role: WorkspaceRole) {
  return roleAtLeast(role, "EDITOR");
}

export function canManageGuestLinks(role: WorkspaceRole) {
  return role === "OWNER_ADMIN";
}

export function canComment(role: WorkspaceRole) {
  return roleAtLeast(role, "REVIEWER");
}

export function canResolveComment(role: WorkspaceRole, ownsComment: boolean) {
  if (roleAtLeast(role, "EDITOR")) {
    return true;
  }

  return role === "REVIEWER" && ownsComment;
}

export function canManageProjectMedia(workspaceRole: WorkspaceRole, platformRole: PlatformRole | null) {
  return (
    roleAtLeast(workspaceRole, "EDITOR") ||
    platformRole === "ASSOCIATE_PRODUCER" ||
    platformRole === "EXECUTIVE_PRODUCER" ||
    platformRole === "SUPER_ADMIN" ||
    platformRole === "ADVISER"
  );
}
