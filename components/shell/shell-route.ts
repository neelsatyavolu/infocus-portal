import type { PlatformRole } from "@prisma/client";
import type { AssistantAudience } from "@/src/lib/assistant-access";

/** What the shell needs to know about the current route. */
export function shellRoute(pathname: string, bare: boolean) {
  const segments = pathname.split("/").filter(Boolean);
  const isProjectRoute = segments[0] === "projects" && Boolean(segments[1]);
  const isReviewRoute = isProjectRoute && segments[2] === "review";
  const isBareReview = isReviewRoute && bare;
  const isClassBoard = pathname === "/class-board";
  return {
    segments,
    isDashboardRoute: segments[0] === "dashboard",
    isProjectRoute,
    isReviewRoute,
    isProjectAssetsRoute: isProjectRoute && !isReviewRoute,
    isBareReview,
    isClassBoard,
    /** Bare review and the class board fill the screen: no sidebar, top bar, tabs or assistant. */
    hideChrome: isBareReview || isClassBoard,
    projectId: isProjectRoute ? segments[1]! : null,
    mediaId: isReviewRoute ? segments[3] ?? null : null
  };
}

export type ShellRoute = ReturnType<typeof shellRoute>;

const ROLE_WEIGHT: Record<PlatformRole, number> = {
  ASSOCIATE_PRODUCER: 1,
  ADVISER: 2,
  EXECUTIVE_PRODUCER: 2,
  SUPER_ADMIN: 3
};

export function hasRole(role: PlatformRole | null, minimum: PlatformRole) {
  return role ? ROLE_WEIGHT[role] >= ROLE_WEIGHT[minimum] : false;
}

export function assistantAudienceFor(role: PlatformRole | null): AssistantAudience {
  if (role === "SUPER_ADMIN" || role === "ADVISER") return "admin";
  if (role === "EXECUTIVE_PRODUCER") return "executive";
  if (role === "ASSOCIATE_PRODUCER") return "associate";
  return "member";
}
