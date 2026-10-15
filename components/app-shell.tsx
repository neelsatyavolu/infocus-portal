"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { PlatformRole } from "@prisma/client";
import { ChevronLeft } from "lucide-react";
import { HubTabs } from "@/components/hub-tabs";
import { PackageStageNav } from "@/components/package-cycle/package-stage-nav";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccountMenu } from "@/components/shell/account-menu";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { AppTopBar } from "@/components/shell/app-top-bar";
import { PhoneTabBar } from "@/components/shell/phone-tab-bar";
import { readProjectAssetView } from "@/components/shell/project-nav";
import { ViewAsNotice } from "@/components/shell/shell-notices";
import { assistantAudienceFor, shellRoute } from "@/components/shell/shell-route";
import { usePhoneDrawer } from "@/components/shell/use-phone-drawer";
import { useProjectShell } from "@/components/shell/use-project-shell";
import { useShellCrumbs } from "@/components/shell/use-shell-crumbs";
import { useOnMeetHost, useSlackCatchUp, useToastOffset } from "@/components/shell/use-shell-effects";
import { useShellLink } from "@/components/shell/use-shell-link";
import { useShellNav } from "@/components/shell/use-shell-nav";
import { setClientCacheOwner } from "@/src/lib/client-cache";
import { isRailRoute, isWideRoute } from "@/src/lib/sidebar-nav";
import { cn } from "@/src/lib/utils";

// The ✱ panel (assistant + messages), the ⌘K palette and View as load after the page, not with it.
const AssistantChat = dynamic(() => import("@/components/assistant-chat").then((m) => m.AssistantChat), { ssr: false });
const CommandPalette = dynamic(() => import("@/components/command-palette").then((m) => m.CommandPalette), { ssr: false });
const ViewAsMenu = dynamic(() => import("@/components/view-as-menu").then((m) => m.ViewAsMenu), { ssr: false });
// Project pages only, so other pages never download them.
const ProjectAssetsPanel = dynamic(() => import("@/components/shell/project-assets-panel").then((m) => m.ProjectAssetsPanel));
const PhoneFolderChips = dynamic(() => import("@/components/shell/phone-folder-chips").then((m) => m.PhoneFolderChips));
const CreateFolderDialog = dynamic(() => import("@/components/shell/create-folder-dialog").then((m) => m.CreateFolderDialog), {
  ssr: false
});

type AppShellProps = {
  children: React.ReactNode;
  platformRole: PlatformRole | null;
  currentUser: { name: string | null; email: string | null; imageUrl: string | null };
  canViewAs?: boolean;
  viewingAs?: boolean;
  /** An exec shared at least one Passwords login with this non-producer. */
  hasSharedPasswords?: boolean;
  /** Apple App Review account: Dashboard and Settings only (src/lib/app-review.ts). */
  sampleOnly?: boolean;
  /** Inside the native InFocus Portal iPhone app, which brings its own navigation (src/lib/embedded-app.ts). */
  embedded?: boolean;
};

/**
 * The frame every Portal page sits in: the sidebar (with status signals), the 56px top bar, the
 * project assets panel, the phone tab bar, and ONE content column (`max-w-[80rem]`, or the full
 * width on isWideRoute pages) that holds the hub tabs, the package stage bar and the page.
 */
export function AppShell({
  children,
  platformRole,
  currentUser,
  canViewAs = false,
  viewingAs = false,
  hasSharedPasswords = false,
  sampleOnly = false,
  embedded = false
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const bare = searchParams.get("bare") === "1";
  const route = useMemo(() => shellRoute(pathname, bare), [pathname, bare]);
  const chrome = !route.hideChrome && !embedded;
  const onMeetHost = useOnMeetHost();

  // Page caches belong to one signed-in person (View as switches the person).
  setClientCacheOwner(currentUser.email ?? null);
  useSlackCatchUp(!sampleOnly);

  const nav = useShellNav({ platformRole, sampleOnly, chrome, pathname, email: currentUser.email });
  const { isProducer, status, phoneTabs } = nav;
  const rail = isRailRoute(pathname);
  const wide = route.hideChrome || isWideRoute(pathname);
  useToastOffset(phoneTabs.length > 0);

  const drawer = usePhoneDrawer(pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [viewAsOpen, setViewAsOpen] = useState(false);
  // Lazy parts stay mounted once opened (View as keeps its loaded user list for the page's life).
  const [viewAsMounted, setViewAsMounted] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMounted, setFolderDialogMounted] = useState(false);
  const { pending, onLinkClick } = useShellLink(search ? `${pathname}?${search}` : pathname);

  const project = useProjectShell(route.projectId, route.mediaId);
  const assetView = useMemo(() => readProjectAssetView(new URLSearchParams(search)), [search]);
  const crumbs = useShellCrumbs({ route, project: project.data, assetView });

  const audience = assistantAudienceFor(platformRole);
  const viewedName = currentUser.name ?? currentUser.email ?? "another user";
  // The ✱ button floats over the bottom of the page; without it the page needs no extra room.
  const hasFloatingButton = chrome && !sampleOnly;
  const openViewAs = () => {
    setViewAsMounted(true);
    setViewAsOpen(true);
  };
  const openFolderDialog = () => {
    setFolderDialogMounted(true);
    setFolderDialogOpen(true);
  };
  const projectPanelProps = route.projectId
    ? {
        projectId: route.projectId,
        data: project.data,
        searchParams: search,
        view: assetView,
        loading: project.loading,
        onLinkClick,
        onCreateFolder: openFolderDialog
      }
    : null;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          route.hideChrome ? "h-dvh overflow-hidden" : "min-h-screen lg:h-screen lg:overflow-hidden",
          // Fixed bottom elements (page docks, the ✱ button, the upload toast) sit above the phone
          // tab bar; sticky panes sit below the top bar.
          phoneTabs.length > 0 ? "[--phone-tabbar-h:3.75rem] lg:[--phone-tabbar-h:0px]" : "",
          chrome ? "[--app-header-h:calc(3.5rem+env(safe-area-inset-top,0px))]" : "[--app-header-h:0px]",
          chrome ? (rail ? "lg:pl-16" : "lg:pl-[240px]") : ""
        )}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        {chrome ? (
          <>
            {drawer.open ? (
              <button
                type="button"
                tabIndex={-1}
                className="fixed inset-0 z-50 bg-black/60 lg:hidden"
                aria-label="Close menu"
                onClick={drawer.dismissDrawer}
              />
            ) : null}
            <AppSidebar
              sections={nav.sections}
              signals={nav.signals}
              cycleCard={nav.cycleCard}
              pathname={pathname}
              onMeetHost={onMeetHost}
              isProducer={isProducer}
              rail={rail}
              drawerOpen={drawer.open}
              onCloseDrawer={drawer.closeDrawer}
              onDismissDrawer={drawer.dismissDrawer}
            />
          </>
        ) : null}

        <div
          className={cn(
            route.hideChrome ? "h-full min-h-0 min-w-0" : "min-h-screen min-w-0 lg:h-screen lg:overflow-y-auto lg:scroll-pt-16",
            route.isBareReview && "max-xl:overflow-y-auto",
            route.isProjectAssetsRoute && "lg:grid lg:grid-cols-[240px_1fr]"
          )}
        >
          {route.isProjectAssetsRoute && projectPanelProps ? <ProjectAssetsPanel {...projectPanelProps} /> : null}
          <div className={cn("flex min-w-0 flex-col", route.hideChrome ? "h-full min-h-0" : "min-h-screen")}>
            {chrome ? (
              <AppTopBar
                crumbs={crumbs}
                onLinkClick={onLinkClick}
                pending={pending}
                wide={wide}
                showMenuButton={phoneTabs.length === 0}
                drawerOpen={drawer.open}
                onOpenDrawer={drawer.openDrawer}
                showSearch={!sampleOnly}
                onSearch={() => setPaletteOpen(true)}
                account={
                  <AccountMenu
                    currentUser={currentUser}
                    viewingAs={viewingAs}
                    canViewAs={canViewAs}
                    showPasswords={isProducer || hasSharedPasswords}
                    pathname={pathname}
                    onViewAs={openViewAs}
                  />
                }
              />
            ) : route.isBareReview && (!embedded || viewingAs) ? (
              // The iPhone app brings its own back button, so it gets only the viewing-as notice.
              <div className="space-y-3 px-4 pt-3 md:px-6">
                {embedded ? null : (
                  <Button type="button" variant="ghost" size="sm" className="-ml-2 max-md:h-10" onClick={() => router.back()}>
                    <ChevronLeft aria-hidden />
                    Back
                  </Button>
                )}
                {viewingAs ? <ViewAsNotice name={viewedName} canSwitch={canViewAs} onSwitch={openViewAs} /> : null}
              </div>
            ) : null}

            <main
              id="main"
              tabIndex={-1}
              className={cn(
                "min-w-0 flex-1 outline-none",
                route.isClassBoard
                  ? "flex min-h-0 flex-col overflow-hidden"
                  : cn(
                      "px-4 pt-4 md:px-6 md:pt-6 lg:pb-6",
                      hasFloatingButton
                        ? "pb-[calc(6rem+var(--phone-tabbar-h,0px))]"
                        : "pb-[calc(1.5rem+var(--phone-tabbar-h,0px))]"
                    )
              )}
            >
              {route.isClassBoard ? (
                children
              ) : (
                <div className={cn("mx-auto w-full min-w-0", !wide && "max-w-[80rem]")}>
                  {chrome && viewingAs ? (
                    <ViewAsNotice name={viewedName} canSwitch={canViewAs} onSwitch={openViewAs} className="mb-5" />
                  ) : null}
                  {nav.hubTabs ? <HubTabs tabs={nav.hubTabs} /> : null}
                  {nav.showPackageStageNav ? (
                    <PackageStageNav
                      pathname={pathname}
                      unlocked={nav.unlocked}
                      statuses={status.package?.hasRow ? status.package.statuses : null}
                      unread={status.package?.unread ?? null}
                      remainingExecutiveSignoffs={status.package?.hasRow ? status.package.remainingExecutiveSignoffs : null}
                      extensionRequestsAwaiting={status.extensionRequestsAwaiting ?? 0}
                      showExtensionRequests={!isProducer}
                      viewer={currentUser.email}
                    />
                  ) : null}
                  {route.isProjectAssetsRoute && projectPanelProps ? <PhoneFolderChips {...projectPanelProps} /> : null}
                  {children}
                </div>
              )}
            </main>
          </div>
        </div>

        {phoneTabs.length > 0 ? (
          <PhoneTabBar
            tabs={phoneTabs}
            signals={nav.signals}
            pathname={pathname}
            onMeetHost={onMeetHost}
            isProducer={isProducer}
            moreUpdates={nav.more.count}
            moreLive={nav.more.live}
            drawerOpen={drawer.open}
            onOpenMore={drawer.openDrawer}
          />
        ) : null}
        {hasFloatingButton ? (
          <>
            <AssistantChat canMutate={platformRole === "SUPER_ADMIN" || platformRole === "ADVISER"} audience={audience} />
            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} audience={audience} />
          </>
        ) : null}
        {canViewAs && viewAsMounted ? (
          <ViewAsMenu currentUser={currentUser} canViewAs={canViewAs} viewingAs={viewingAs} open={viewAsOpen} onOpenChange={setViewAsOpen} />
        ) : null}
        {route.projectId && folderDialogMounted ? (
          <CreateFolderDialog
            projectId={route.projectId}
            open={folderDialogOpen}
            onOpenChange={setFolderDialogOpen}
            onCreated={project.appendFolder}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
