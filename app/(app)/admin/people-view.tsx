"use client";

import type { PlatformUser, ReportMessage, RoleAssignment } from "./admin-types";
import { PeopleSection } from "./people-section";
import { ProducerTeamSection } from "./producer-team-section";

/**
 * Admin → People: everyone who can sign in on the left (flows with the page), the Producer Team
 * beside it from a 56rem content column, so a laptop window with the sidebar open keeps both in
 * view (sticky, with its own scroll only when taller than the window). Stacked on narrower
 * screens, People first.
 */
export function PeopleView({
  active,
  users,
  roles,
  canManageRoles,
  onChanged,
  onMessage,
  onUserUpdated,
  onUserRemoved
}: {
  active: boolean;
  users: PlatformUser[];
  roles: RoleAssignment[];
  canManageRoles: boolean;
  onChanged: () => Promise<void>;
  onMessage: ReportMessage;
  onUserUpdated: (user: PlatformUser) => void;
  onUserRemoved: (userId: string) => void;
}) {
  return (
    <div className="grid gap-5 @4xl:grid-cols-[minmax(0,1fr)_20rem] @4xl:items-start">
      <PeopleSection
        users={users}
        roles={roles}
        active={active}
        onMessage={onMessage}
        onUserUpdated={onUserUpdated}
        onUserRemoved={onUserRemoved}
      />
      <ProducerTeamSection
        roles={roles}
        users={users}
        canManage={canManageRoles}
        onChanged={onChanged}
        onMessage={onMessage}
        className="@4xl:sticky @4xl:top-[var(--app-header-h,0px)] @4xl:max-h-[calc(100dvh-var(--app-header-h,0px)-1.5rem)] @4xl:overflow-y-auto"
      />
    </div>
  );
}
