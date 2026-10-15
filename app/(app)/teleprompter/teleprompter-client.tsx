"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, ScrollText } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { EmptyState, ErrorState } from "@/components/kit/empty-state";
import { useHotkeys } from "@/components/kit/hotkeys";
import { useRememberedState } from "@/components/kit/remembered-state";
import { Sheet } from "@/components/kit/sheet";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/src/lib/utils";
import { createTeleprompterActions } from "./teleprompter-actions";
import { ScriptTitleDialog } from "./teleprompter-dialogs";
import { RefreshControl, TeleprompterHeader, WorkspaceSelect } from "./teleprompter-header";
import { useIdlePreload, useMeasuredWidth, useNow, useReformatProgress, useSeenDocs } from "./teleprompter-hooks";
import {
  codeColumnCh,
  formatAge,
  headerShowLine,
  pluralize,
  readData,
  showDateKey,
  sortDocsByRecent,
  todayDateKey,
  visibleRailDocs,
  workspaceLayout,
  type SectionDraft,
  type TeleprompterAutofillStatus,
  type TeleprompterDoc,
  type TeleprompterPayload,
  type TeleprompterSection,
  type WorkspaceSummary
} from "./teleprompter-model";
import { ScriptDetail, type ScriptDetailHandlers } from "./teleprompter-script-detail";
import { RunModeLoading, useRunModeModule } from "./teleprompter-run-mode-loader";
import { ScriptRailList, ScriptRailPane } from "./teleprompter-script-rail";
import { TeleprompterWorkspaceSkeleton } from "./teleprompter-skeleton";

const EMPTY_DRAFT: SectionDraft = { id: null, label: "", content: "" };
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/** Open Radix Select lists and ⋯ menus take single letters for type-ahead, so R leaves them alone. */
function letterKeyOwnedByWidget(event: KeyboardEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('[role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"]')) {
    return true;
  }
  return document.querySelector('[role="listbox"], [role="menu"][data-state="open"]') !== null;
}

const subscribeToNothing = () => () => {};
const isTeleprompterHost = () => window.location.hostname.toLowerCase().startsWith("teleprompter.");

export default function TeleprompterClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedWorkspaceId = searchParams.get("workspaceId")?.trim() ?? "";
  const requestedDocId = searchParams.get("doc")?.trim() ?? "";
  const requestedShowDate = searchParams.get("showDate")?.trim() ?? "";
  const [docs, setDocs] = useState<TeleprompterDoc[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [nextShowDateIso, setNextShowDateIso] = useState("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [working, setWorking] = useState(false);
  const [pendingDocDelete, setPendingDocDelete] = useState<TeleprompterDoc | null>(null);
  const [pendingSectionDeleteId, setPendingSectionDeleteId] = useState<string | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<{ run: () => void } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [autofillStatus, setAutofillStatus] = useState<TeleprompterAutofillStatus>({
    status: "ok"
  });
  const [canEdit, setCanEdit] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [docTitleDraft, setDocTitleDraft] = useState("");
  const [sectionEditorOpen, setSectionEditorOpen] = useState(false);
  const [sectionDraft, setSectionDraft] = useState<SectionDraft>(EMPTY_DRAFT);
  const [sectionDraftBaseline, setSectionDraftBaseline] = useState<SectionDraft>(EMPTY_DRAFT);
  const [runModeOpen, setRunModeOpen] = useState(false);
  const [scriptsSheetOpen, setScriptsSheetOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useRememberedState("teleprompter:rail-collapsed:v1", false, isBoolean);
  /** Full-app shell on teleprompter.infocuspaly.com (no packages sidebar). */
  const standaloneApp = useSyncExternalStore(subscribeToNothing, isTeleprompterHost, () => false);
  const [showAllDocs, setShowAllDocs] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  /** The doc collapsedSections and the inline editor were last matched to. */
  const [sectionsSyncedDoc, setSectionsSyncedDoc] = useState<TeleprompterDoc | null>(null);
  const progress = useReformatProgress();
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null);
  const [rootRef, rootWidth] = useMeasuredWidth<HTMLDivElement>();
  const now = useNow();
  const runMode = useRunModeModule();
  /** The workspace this page just wrote into the URL itself (see the refresh effect). */
  const selfWrittenWorkspaceRef = useRef<string | null>(null);
  const orderedDocs = useMemo(() => sortDocsByRecent(docs), [docs]);

  const activeDoc = useMemo(
    () => orderedDocs.find((doc) => doc.id === selectedDocId) ?? orderedDocs[0] ?? null,
    [orderedDocs, selectedDocId]
  );
  const activeDocId = activeDoc?.id ?? null;
  const rail = useMemo(() => visibleRailDocs(orderedDocs, showAllDocs, activeDocId), [orderedDocs, showAllDocs, activeDocId]);
  const layout = workspaceLayout(rootWidth, railCollapsed);
  const seen = useSeenDocs(activeDoc, hasLoaded);
  const draftDirty =
    sectionEditorOpen && (sectionDraft.label !== sectionDraftBaseline.label || sectionDraft.content !== sectionDraftBaseline.content);

  // The selection follows the doc on screen (none, or the first one when it is gone).
  if (selectedDocId !== activeDocId) {
    setSelectedDocId(activeDocId);
  }

  if (sectionsSyncedDoc !== activeDoc) {
    setSectionsSyncedDoc(activeDoc);
    if (!activeDoc) {
      setCollapsedSections({});
    } else {
      // Sections start open, so the rundown reads at a glance.
      setCollapsedSections((current) => {
        const next: Record<string, boolean> = {};
        for (const section of activeDoc.sections) {
          next[section.id] = current[section.id] ?? false;
        }
        return next;
      });
    }
    // Another script (or none) closes the inline editor, as closing the old section dialog did.
    if ((sectionsSyncedDoc?.id ?? null) !== activeDocId) {
      setSectionEditorOpen(false);
      setSectionDraft(EMPTY_DRAFT);
      setSectionDraftBaseline(EMPTY_DRAFT);
    }
  }

  const setWorkspaceInUrl = useCallback(
    (workspaceId: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (workspaceId) {
        params.set("workspaceId", workspaceId);
      } else {
        params.delete("workspaceId");
      }

      const query = params.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      router.replace(href as never, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setLoadFailed(false);
    try {
      const params = new URLSearchParams();
      if (requestedWorkspaceId) {
        params.set("workspaceId", requestedWorkspaceId);
      }
      if (requestedShowDate) {
        params.set("showDate", requestedShowDate);
      }
      const query = params.toString();
      const data = await readData<TeleprompterPayload>(query ? `/api/teleprompter?${query}` : "/api/teleprompter");
      setDocs(data.docs);
      setCanEdit(data.canEdit);
      setActiveWorkspaceId(data.workspaceId);
      setAutofillStatus(data.autofill);
      setNextShowDateIso(data.nextShowDateIso);
      setLastSyncedAt(Date.now());
      setHasLoaded(true);

      const matchedById = requestedDocId ? data.docs.find((doc) => doc.id === requestedDocId) : null;
      const matchedByDate = requestedShowDate
        ? data.docs.find((doc) => doc.showDate?.slice(0, 10) === requestedShowDate)
        : null;
      if (matchedById || matchedByDate) {
        setSelectedDocId((matchedById ?? matchedByDate)?.id ?? null);
      }

      if (data.workspaceId !== requestedWorkspaceId) {
        selfWrittenWorkspaceRef.current = data.workspaceId;
        setWorkspaceInUrl(data.workspaceId);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load scripts.");
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [requestedDocId, requestedShowDate, requestedWorkspaceId, setWorkspaceInUrl]);

  useEffect(() => {
    // Opening without ?workspaceId loads, then writes the resolved workspace into the URL. That
    // URL change only catches up with what is already on screen, so it doesn't load again.
    const selfWritten = selfWrittenWorkspaceRef.current;
    selfWrittenWorkspaceRef.current = null;
    if (selfWritten !== null && selfWritten === requestedWorkspaceId) {
      return;
    }
    void refresh();
    // requestedWorkspaceId is part of refresh's identity; listed for the check above.
  }, [refresh, requestedWorkspaceId]);

  // Loads once on mount; loadingWorkspaces starts true.
  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        const data = await readData<WorkspaceSummary[]>("/api/workspaces");
        setWorkspaces(data);
      } catch {
        setWorkspaces([]);
      } finally {
        setLoadingWorkspaces(false);
      }
    };
    void loadWorkspaces();
  }, []);

  useIdlePreload(hasLoaded, runMode.load);

  // The Scripts sheet exists only in the narrow layout; widening closes it for real, so it can't
  // stay "open" out of sight.
  if (layout.mode !== "narrow" && scriptsSheetOpen) {
    setScriptsSheetOpen(false);
  }

  const workspaceOptions = useMemo(
    () =>
      workspaces.map((workspace) => ({
        value: workspace.id,
        label: workspace.name
      })),
    [workspaces]
  );

  const selectedWorkspaceValue = useMemo(() => {
    if (activeWorkspaceId && workspaceOptions.some((option) => option.value === activeWorkspaceId)) {
      return activeWorkspaceId;
    }

    if (requestedWorkspaceId && workspaceOptions.some((option) => option.value === requestedWorkspaceId)) {
      return requestedWorkspaceId;
    }

    return workspaceOptions[0]?.value ?? "";
  }, [activeWorkspaceId, requestedWorkspaceId, workspaceOptions]);

  function closeSectionEditor() {
    setSectionEditorOpen(false);
    setSectionDraft(EMPTY_DRAFT);
    setSectionDraftBaseline(EMPTY_DRAFT);
  }

  /** Runs an action that would throw the open draft away; asks first when the draft has unsaved changes. */
  function guardDraft(action: () => void) {
    if (draftDirty) {
      setPendingDiscard({ run: action });
      return;
    }
    if (sectionEditorOpen) {
      closeSectionEditor();
    }
    action();
  }

  function openSectionDraft(draft: SectionDraft) {
    setSectionDraft(draft);
    setSectionDraftBaseline(draft);
    setSectionEditorOpen(true);
    const sectionId = draft.id;
    if (sectionId) {
      setCollapsedSections((current) => ({ ...current, [sectionId]: false }));
    }
  }

  function closeDocDialog() {
    setDocModalOpen(false);
    setDocTitleDraft("");
    setEditingDocId(null);
  }

  function openCreateDocModal() {
    setEditingDocId(null);
    setDocTitleDraft("");
    setDocModalOpen(true);
  }

  // Creating a script selects it, which closes an open section edit: ask first if it has changes.
  function startNewScript() {
    guardDraft(openCreateDocModal);
  }

  function openRenameDocModal(doc: TeleprompterDoc) {
    setEditingDocId(doc.id);
    setDocTitleDraft(doc.title);
    setDocModalOpen(true);
  }

  function selectDoc(docId: string) {
    if (docId !== activeDocId) {
      guardDraft(() => setSelectedDocId(docId));
    }
  }

  function requestRefresh() {
    guardDraft(() => void refresh());
  }

  // Deleting the open script closes an open section edit: ask first if it has changes.
  function requestDocDelete(doc: TeleprompterDoc) {
    if (doc.id === activeDocId) {
      guardDraft(() => setPendingDocDelete(doc));
    } else {
      setPendingDocDelete(doc);
    }
  }

  function toggleSectionCollapsed(sectionId: string) {
    if (sectionEditorOpen && sectionDraft.id === sectionId) {
      return;
    }
    setCollapsedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId]
    }));
  }

  function setAllSectionsCollapsed(collapsed: boolean) {
    if (!activeDoc) {
      return;
    }
    const editingId = sectionEditorOpen ? sectionDraft.id : null;
    setCollapsedSections(Object.fromEntries(activeDoc.sections.map((section) => [section.id, collapsed && section.id !== editingId])));
  }

  const actions = createTeleprompterActions({
    activeDoc,
    activeWorkspaceId,
    selectedDocId,
    editingDocId,
    docTitleDraft,
    sectionDraft,
    sectionEditorOpen,
    setDocs,
    setWorking,
    setMessage,
    setSelectedDocId,
    setCollapsedSections,
    setCopiedSectionId,
    closeDocDialog,
    closeSectionEditor,
    progress,
    markTouched: seen.markTouched
  });

  const canRun = Boolean(activeDoc && activeDoc.sections.length > 0) && !sectionEditorOpen;

  const closeRunMode = useCallback(() => setRunModeOpen(false), []);

  function openRunMode() {
    if (!canRun) {
      return;
    }
    if (!runMode.component) {
      void runMode.load();
    }
    setRunModeOpen(true);
  }

  // R opens run mode from the editor page (not while typing, editing, in a dialog or sheet, or
  // while a select or menu has focus).
  useHotkeys(
    {
      r: (event) => {
        if (!event.repeat && !letterKeyOwnedByWidget(event)) openRunMode();
      }
    },
    { enabled: canRun && !runModeOpen }
  );

  const todayKey = useMemo(() => todayDateKey(new Date(now)), [now]);
  const nextShowKey = requestedShowDate ? null : showDateKey(nextShowDateIso);
  const statusContext = useMemo(() => ({ todayKey, nextShowKey }), [todayKey, nextShowKey]);
  const hasDocs = orderedDocs.length > 0;
  const refreshing = loading && hasLoaded;
  const showWorkspaceSelect = !standaloneApp && workspaceOptions.length > 1;
  const showHeaderNewScript = canEdit && hasDocs;

  const showLine = activeWorkspaceId
    ? headerShowLine({ requestedShowDate, nextShowDateIso, docs: orderedDocs, todayKey })
    : null;

  const refreshControl = (
    <RefreshControl iconOnly={layout.phone} loading={loading} disabled={loading || working} onRefresh={requestRefresh} />
  );
  const newScriptButton = showHeaderNewScript ? (
    <Button type="button" variant="outline" onClick={startNewScript} disabled={working}>
      <Plus />
      New script
    </Button>
  ) : null;

  // Refresh stays put when New script appears after the first load: it is the row's last item
  // where the row is right-aligned (desktop) and its first where the row is left-aligned (phone).
  const headerActions = (
    <>
      {showWorkspaceSelect ? (
        <WorkspaceSelect
          value={selectedWorkspaceValue}
          options={workspaceOptions}
          disabled={loading || loadingWorkspaces || working}
          onChange={(workspaceId) => guardDraft(() => setWorkspaceInUrl(workspaceId))}
        />
      ) : null}
      {layout.phone ? refreshControl : newScriptButton}
      {layout.phone ? newScriptButton : refreshControl}
    </>
  );

  const railListProps = {
    docs: rail.visible,
    hiddenCount: rail.hiddenCount,
    showAll: showAllDocs,
    onToggleShowAll: () => setShowAllDocs((current) => !current),
    activeDocId,
    canEdit,
    statusContext,
    now,
    updatedSinceVisit: seen.docUpdatedSinceVisit
  };

  const detailHandlers: ScriptDetailHandlers = {
    onToggleSection: toggleSectionCollapsed,
    onExpandSection: (sectionId) => setCollapsedSections((current) => ({ ...current, [sectionId]: false })),
    onSetAllCollapsed: setAllSectionsCollapsed,
    onAddSection: () =>
      guardDraft(() => openSectionDraft({ id: null, label: `A${(activeDoc?.sections.length ?? 0) + 1}`, content: "" })),
    onEditSection: (section: TeleprompterSection) =>
      guardDraft(() => openSectionDraft({ id: section.id, label: section.label, content: section.content })),
    onDraftChange: setSectionDraft,
    onSaveDraft: () => void actions.saveSection(),
    onCancelDraft: () => {
      if (!working) closeSectionEditor();
    },
    onRequestDiscardDraft: () => setPendingDiscard({ run: () => undefined }),
    onCopySection: (section) => void actions.copySectionContent(section),
    onReformatSection: (section) => void actions.reformatSection(section),
    onRefetchSection: (section) => void actions.refetchBulletinSection(section),
    onDeleteSection: setPendingSectionDeleteId,
    onReformatDoc: () => {
      if (activeDoc) void actions.reformatDoc(activeDoc);
    },
    onRun: openRunMode,
    onShowRail: () => setRailCollapsed(false),
    onOpenScripts: () => setScriptsSheetOpen(true)
  };

  const withRundown = layout.rundownColumn && activeDoc;
  // Three panes: the script pane stops at a 50rem reading width and the side panes share
  // whatever is left, so wide screens get longer titles and beats instead of an empty band.
  const gridColumns = layout.railInline
    ? withRundown
      ? "grid-cols-[minmax(18rem,1fr)_minmax(0,50rem)_minmax(15rem,1fr)]"
      : "grid-cols-[18rem_minmax(0,1fr)]"
    : withRundown
      ? "grid-cols-[minmax(0,1fr)_15rem]"
      : "grid-cols-[minmax(0,1fr)]";

  let body: ReactNode;
  if (loading && !hasLoaded) {
    body = <TeleprompterWorkspaceSkeleton />;
  } else if (!hasDocs) {
    body = (
      <div className="rounded-md border border-border bg-card">
        {loadFailed ? (
          <ErrorState title="Couldn't load scripts" message={message} onRetry={requestRefresh} busy={loading} />
        ) : !activeWorkspaceId ? (
          <EmptyState icon={ScrollText} title="No workspace yet" description={autofillStatus.message} />
        ) : (
          <EmptyState
            icon={ScrollText}
            title="No scripts yet"
            description="Create a script to start a rundown."
            action={
              canEdit ? (
                <Button type="button" onClick={startNewScript} disabled={working}>
                  <Plus />
                  New script
                </Button>
              ) : null
            }
          />
        )}
      </div>
    );
  } else {
    // overflow-clip (not hidden) rounds the corners without breaking the sticky rail and toolbar.
    body = (
      <div
        aria-busy={refreshing || undefined}
        inert={refreshing || undefined}
        style={{ "--tp-code-w": `${codeColumnCh(activeDoc?.sections ?? [])}ch` } as CSSProperties}
        className={cn(
          "grid overflow-clip rounded-md border border-border bg-card transition-opacity duration-200",
          gridColumns,
          refreshing && "opacity-60"
        )}
      >
        {layout.railInline ? (
          <ScriptRailPane total={orderedDocs.length} onHide={() => setRailCollapsed(true)}>
            <ScriptRailList {...railListProps} onSelect={selectDoc} onRename={openRenameDocModal} onDelete={requestDocDelete} />
          </ScriptRailPane>
        ) : null}
        {activeDoc ? (
          <ScriptDetail
            view={{
              doc: activeDoc,
              layout,
              railCollapsed,
              canEdit,
              working,
              now,
              statusContext,
              reformatState: progress.reformatState,
              collapsedSections,
              copiedSectionId,
              editor: { open: sectionEditorOpen, draft: sectionDraft, dirty: draftDirty },
              sectionUpdatedSinceVisit: seen.sectionUpdatedSinceVisit
            }}
            handlers={detailHandlers}
          />
        ) : (
          <EmptyState title="Select a script to edit." />
        )}
      </div>
    );
  }

  const messageAlert = message && !(loadFailed && !hasDocs) ? message : null;
  const RunMode = runMode.component;
  const autofillAlert = autofillStatus.status !== "ok" && autofillStatus.message && activeWorkspaceId ? autofillStatus.message : null;

  return (
    <>
      <div ref={rootRef} className="space-y-5">
        <TeleprompterHeader
          firstLoad={loading && !hasLoaded}
          showLine={showLine}
          syncedAge={lastSyncedAt ? formatAge(lastSyncedAt, now) : null}
          actions={headerActions}
          compact={layout.phone}
        />

        {messageAlert || autofillAlert ? (
          <div className="space-y-2">
            {messageAlert ? (
              <Alert
                tone="danger"
                onDismiss={() => setMessage(null)}
                action={
                  loadFailed ? (
                    <Button type="button" variant="outline" size="sm" onClick={requestRefresh} disabled={loading}>
                      Try again
                    </Button>
                  ) : undefined
                }
              >
                {messageAlert}
              </Alert>
            ) : null}
            {autofillAlert ? <Alert tone="warning">{autofillAlert}</Alert> : null}
          </div>
        ) : null}

        {body}
      </div>

      {/* Bottom sheet on phones, a right drawer from md (a narrow workspace beside the sidebar). */}
      <Sheet
        open={scriptsSheetOpen && layout.mode === "narrow"}
        onOpenChange={setScriptsSheetOpen}
        title="Scripts"
        side="auto"
        width="sm"
        className="max-md:max-h-[85dvh]"
        bodyClassName="p-0 pb-[env(safe-area-inset-bottom,0px)] md:px-0"
        headerExtra={
          <span className="font-mono-broadcast text-xs tabular-nums text-muted-foreground">{pluralize(orderedDocs.length, "script")}</span>
        }
      >
        <ScriptRailList
          {...railListProps}
          inset="sheet"
          onSelect={(docId) => {
            setScriptsSheetOpen(false);
            selectDoc(docId);
          }}
          onRename={(doc) => {
            setScriptsSheetOpen(false);
            openRenameDocModal(doc);
          }}
          onDelete={(doc) => {
            setScriptsSheetOpen(false);
            requestDocDelete(doc);
          }}
        />
      </Sheet>

      <ScriptTitleDialog
        open={docModalOpen}
        renaming={editingDocId !== null}
        title={docTitleDraft}
        working={working}
        onTitleChange={setDocTitleDraft}
        onOpenChange={(isOpen) => {
          if (!isOpen && working) return;
          setDocModalOpen(isOpen);
          if (!isOpen) {
            setEditingDocId(null);
            setDocTitleDraft("");
          }
        }}
        onCancel={closeDocDialog}
        onSave={() => void actions.saveDoc()}
      />

      <ConfirmDialog
        open={pendingDocDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDocDelete(null);
        }}
        title={`Delete "${pendingDocDelete?.title ?? "this script"}"?`}
        description="The script and all of its sections are deleted."
        confirmLabel="Delete script"
        onConfirm={() => (pendingDocDelete ? actions.deleteDoc(pendingDocDelete) : undefined)}
      />
      <ConfirmDialog
        open={pendingSectionDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSectionDeleteId(null);
        }}
        title="Delete this section?"
        description="Its script text is deleted too."
        confirmLabel="Delete section"
        onConfirm={() => (pendingSectionDeleteId ? actions.deleteSection(pendingSectionDeleteId) : undefined)}
      />
      <ConfirmDialog
        open={pendingDiscard !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDiscard(null);
        }}
        title="Discard changes?"
        description="Your edits to this section aren't saved yet."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          const action = pendingDiscard?.run;
          closeSectionEditor();
          action?.();
        }}
      />

      {runModeOpen && activeDoc ? (
        RunMode ? (
          <RunMode doc={activeDoc} docs={orderedDocs} onSelectDoc={setSelectedDocId} onClose={closeRunMode} />
        ) : (
          <RunModeLoading failed={runMode.failed} onRetry={() => void runMode.load()} onClose={closeRunMode} />
        )
      ) : null}
    </>
  );
}
