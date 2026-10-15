"use client";

import { ManagerRosterButton } from "@/components/manager-roster-button";

export default function PublishingManagers() {
  return (
    <ManagerRosterButton
      endpoint="/api/package-cycle/queue/managers"
      noun="publishing managers"
      // Beside Past shows and Add package in the page header (h-9, same type size).
      size="default"
      title="Publishing managers"
      description="Website managers can view the queue and published packages and copy YouTube embed codes. Producers manage the queue."
    />
  );
}
