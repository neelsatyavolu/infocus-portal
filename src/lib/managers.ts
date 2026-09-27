/** The Managers tab: one card per appointed-manager area, each linking to the tool that manager uses. */
export type ManagerAreaId = "equipment" | "livestreams" | "website" | "social-media";

export type ManagerArea = {
  id: ManagerAreaId;
  title: string;
  tool: string;
  description: string;
  href: string;
  /** Who can open it, shown on the card. */
  access: string;
  canOpen: boolean;
};

export type ManagerAccess = {
  /** Associate producer or higher. */
  isProducer: boolean;
  /** Appointed on the equipment manager roster. */
  isEquipmentManager: boolean;
  /** Appointed website (publishing) manager: read-only Publishing Queue. */
  isPublishingManager: boolean;
  /** Appointed social media manager: the Instagram Post Maker. */
  isSocialMediaManager: boolean;
};

export function managerAreas({ isProducer, isEquipmentManager, isPublishingManager, isSocialMediaManager }: ManagerAccess): ManagerArea[] {
  return [
    {
      id: "equipment",
      title: "Equipment",
      tool: "Equipment Dashboard",
      description: "Check gear in and out, review requests, and keep the inventory current.",
      href: "/equipment/manage",
      access: "Producers and appointed equipment managers",
      canOpen: isProducer || isEquipmentManager
    },
    {
      id: "livestreams",
      title: "Livestream",
      tool: "Livestream Tracker",
      description: "Schedule livestreams, assign crews and managers, and approve sign-ups.",
      href: "/livestreams",
      access: "Everyone can view. Producers and livestream managers edit.",
      canOpen: true
    },
    {
      id: "website",
      title: "Website",
      tool: "Publishing Queue",
      description: "See which packages air on each show and copy their YouTube embed codes for the site.",
      href: "/publishing-queue",
      access: "Producers and appointed website managers (view only)",
      canOpen: isProducer || isPublishingManager
    },
    {
      id: "social-media",
      title: "Social media",
      tool: "Instagram Post Maker",
      description: "Make on-brand Instagram stories from your photos and download them as PNGs.",
      href: "/managers/social-media",
      access: "Producers and appointed social media managers",
      canOpen: isProducer || isSocialMediaManager
    }
  ];
}

const AREA_ORDER: ManagerAreaId[] = ["equipment", "livestreams", "website", "social-media"];

/** People appointed to each area, as shown on the Managers cards (display names, never emails). */
export type ManagerRosters = Record<ManagerAreaId, { userId: string; name: string }[]>;

/** The areas this person is appointed to, in card order. */
export function appointedAreas(userId: string, rosters: ManagerRosters): ManagerAreaId[] {
  return AREA_ORDER.filter((id) => rosters[id].some((person) => person.userId === userId));
}

export function accessFromAppointments(isProducer: boolean, appointed: ManagerAreaId[]): ManagerAccess {
  return {
    isProducer,
    isEquipmentManager: appointed.includes("equipment"),
    isPublishingManager: appointed.includes("website"),
    isSocialMediaManager: appointed.includes("social-media")
  };
}
