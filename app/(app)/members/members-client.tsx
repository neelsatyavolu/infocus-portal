"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Lock, RotateCw, Users } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { useListHotkeys } from "@/components/kit/hotkeys";
import { ListDetail } from "@/components/kit/layout";
import { CyclePicker } from "@/components/kit/pickers";
import { useMediaQuery, useRememberedState } from "@/components/kit/remembered-state";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { isNameSortKey, useMounted } from "@/components/people/people-ui";
import { Button } from "@/components/ui/button";
import { neighborIds } from "@/src/lib/keyboard-nav";
import { MEMBER_GENERAL_CYCLE_NUMBER, isGeneralMemberNoteCycle, memberNoteKey } from "@/src/lib/member-notes";
import { type NameSortKey, sortNamedPeople } from "@/src/lib/name-sort";
import { MemberDetail, MemberStepper } from "./member-detail";
import { MemberList, RosterEmpty, RosterHeader } from "./member-list";
import {
  type MembersLayout,
  type MembersPayload,
  type NoteFilter,
  isCycleTabValue,
  isMembersLayout,
  isNoteFilter,
  isString,
  parseNoteKey,
  tabDescription,
  tabTitle,
  tabsWithNotes
} from "./member-notes-model";
import { MemberSheet } from "./member-sheet";
import { MembersBodySkeleton } from "./members-skeleton";
import { useMemberNotes } from "./use-member-notes";
import { usePhoneDetail } from "./use-phone-detail";

/**
 * Members (People hub): producer notes on each class member. "Person": the roster on the left
 * and the selected person on the right (the active tab's note, their General note and every other
 * cycle). "Class": every member's note for the active tab on one page. Notes autosave.
 */
export default function MembersClient({ initialData }: { initialData: MembersPayload | null }) {
  const notes = useMemberNotes(initialData);
  const mounted = useMounted();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [tab, setTab, tabLoaded] = useRememberedState<number>(
    "people:members:tab:v1",
    MEMBER_GENERAL_CYCLE_NUMBER,
    isCycleTabValue
  );
  const [sortBy, setSortBy, sortLoaded] = useRememberedState<NameSortKey>("people:members:sort:v1", "lastName", isNameSortKey);
  const [filter, setFilter, filterLoaded] = useRememberedState<NoteFilter>("people:members:filter:v1", "all", isNoteFilter);
  const [selectedId, setSelectedId, selectedLoaded] = useRememberedState<string>("people:members:selected:v1", "", isString);
  const [layout, setLayout, layoutLoaded] = useRememberedState<MembersLayout>(
    "people:members:layout:v1",
    "person",
    isMembersLayout
  );
  // The remembered choices land right after mount. Until then the body stays a skeleton (one
  // frame), so a return visit never flashes the default layout, tab or person first.
  const prefsLoaded = tabLoaded && sortLoaded && filterLoaded && selectedLoaded && layoutLoaded;
  // The person being worked on stays in a filtered list even after their note stops matching it.
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const primaryRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const focusEditorRef = useRef(false);
  const revealRowRef = useRef(false);
  const { flushAll, flushNote, setNote, drafts } = notes;
  const phone = usePhoneDetail({ isDesktop, mounted, onLeave: flushAll });

  const cycles = useMemo(() => notes.data?.cycles ?? [], [notes.data]);
  const members = useMemo(() => notes.data?.members ?? [], [notes.data]);
  const tabs = useMemo(() => [MEMBER_GENERAL_CYCLE_NUMBER, ...cycles.map((cycle) => cycle.cycleNumber)], [cycles]);
  const activeTab =
    isGeneralMemberNoteCycle(tab) || cycles.some((cycle) => cycle.cycleNumber === tab) ? tab : MEMBER_GENERAL_CYCLE_NUMBER;
  const isGeneral = isGeneralMemberNoteCycle(activeTab);
  const activeCycle = cycles.find((cycle) => cycle.cycleNumber === activeTab) ?? null;
  const tabName = tabTitle(activeTab);
  const personLayout = layout === "person";

  const hasNote = useCallback(
    (memberId: string) => (drafts[memberNoteKey(memberId, activeTab)] ?? "").trim().length > 0,
    [drafts, activeTab]
  );

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? members.filter((member) => {
          const name = (member.name ?? "").toLowerCase();
          const email = (member.email ?? "").toLowerCase();
          return name.includes(q) || email.includes(q);
        })
      : members;
    return sortNamedPeople(filtered, sortBy);
  }, [members, query, sortBy]);

  const counts = useMemo(() => {
    const withNote = searched.filter((member) => hasNote(member.id)).length;
    return { all: searched.length, with: withNote, without: searched.length - withNote };
  }, [searched, hasNote]);

  const visible = useMemo(
    () =>
      filter === "all"
        ? searched
        : searched.filter((member) => member.id === pinnedId || hasNote(member.id) === (filter === "with")),
    [searched, filter, pinnedId, hasNote]
  );

  const selected = visible.find((member) => member.id === selectedId) ?? visible[0] ?? null;
  const neighbors = useMemo(
    () => (selected ? neighborIds(visible.map((member) => member.id), selected.id) : { previous: null, next: null }),
    [visible, selected]
  );

  const savingMembers = useMemo(() => {
    const ids = new Set<string>();
    for (const key of notes.savingKeys) {
      const parsed = parseNoteKey(key);
      if (parsed) ids.add(parsed.userId);
    }
    return ids;
  }, [notes.savingKeys]);

  const errorMembers = useMemo(() => {
    const byMember = new Map<string, string>();
    for (const [key, message] of Object.entries(notes.errorKeys)) {
      const parsed = parseNoteKey(key);
      if (parsed && !byMember.has(parsed.userId)) byMember.set(parsed.userId, message);
    }
    return byMember;
  }, [notes.errorKeys]);

  function selectMember(memberId: string, options: { focusEditor?: boolean; openOnPhone?: boolean; reveal?: boolean } = {}) {
    const changing = memberId !== selected?.id;
    // A field that disappears never blurs, so send what was typed before switching.
    if (changing) flushAll();
    setSelectedId(memberId);
    setPinnedId(memberId);
    if (options.reveal) revealRowRef.current = true;
    if (options.focusEditor) {
      if (changing) focusEditorRef.current = true;
      else primaryRef.current?.focus();
    }
    if (options.openOnPhone && !isDesktop && !phone.open) phone.openDetail();
  }

  useEffect(() => {
    if (revealRowRef.current && selected) {
      revealRowRef.current = false;
      if (isDesktop) {
        const index = visible.findIndex((member) => member.id === selected.id);
        const row = listRef.current?.children[index];
        if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" });
      }
    }
    if (focusEditorRef.current) {
      focusEditorRef.current = false;
      primaryRef.current?.focus();
    }
  }, [selected, visible, activeTab, isDesktop, phone.open]);

  function step(direction: "previous" | "next", focusEditor = false) {
    const target = neighbors[direction];
    if (target) selectMember(target, { reveal: true, focusEditor });
  }

  useListHotkeys({
    enabled: personLayout && visible.length > 0,
    onNext: () => step("next"),
    onPrevious: () => step("previous")
  });

  function saveAndNext() {
    if (!selected) return;
    flushNote(memberNoteKey(selected.id, activeTab));
    step("next", true);
  }

  function changeTab(next: number) {
    if (next === activeTab) return;
    flushAll();
    if (selected) setPinnedId(selected.id);
    setTab(next);
  }

  function openCycle(cycleNumber: number) {
    changeTab(cycleNumber);
    // Desktop: straight into that cycle's note. Phones: back to the top of the person, no keyboard.
    if (isDesktop) focusEditorRef.current = true;
    else phone.detailRef.current?.scrollIntoView({ block: "start" });
  }

  function changeFilter(next: NoteFilter) {
    setPinnedId(null);
    setFilter(next);
  }

  function changeLayout(next: MembersLayout) {
    if (next === layout) return;
    flushAll();
    if (phone.open) phone.closeDetail();
    setLayout(next);
  }

  const handlers = useMemo(
    () => ({
      noteState: notes.noteState,
      errorFor: (key: string) => notes.errorKeys[key],
      onChange: (key: string, value: string) => {
        const parsed = parseNoteKey(key);
        if (parsed) setPinnedId(parsed.userId);
        setNote(key, value);
      },
      onFlush: (key: string) => flushNote(key)
    }),
    [notes.noteState, notes.errorKeys, setNote, flushNote]
  );

  const stepper = {
    onPrevious: () => step("previous"),
    onNext: () => step("next"),
    hasPrevious: Boolean(neighbors.previous),
    hasNext: Boolean(neighbors.next)
  };

  const rosterHeader = (wide: boolean) => (
    <RosterHeader
      wide={wide}
      query={query}
      onQueryChange={setQuery}
      sortBy={sortBy}
      onSortChange={setSortBy}
      filter={filter}
      counts={counts}
      onFilterChange={changeFilter}
      tabName={tabName}
    />
  );
  const rosterEmpty =
    visible.length === 0 ? (
      <RosterEmpty
        query={query}
        filter={filter}
        tabName={tabName}
        onClearSearch={() => setQuery("")}
        onShowAll={() => changeFilter("all")}
      />
    ) : null;

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow="Producer notes"
        status={
          <StatusTag
            tone="neutral"
            icon={Lock}
            title="Shared by every producer who can open Members. Students never see these notes."
          >
            Producers only
          </StatusTag>
        }
        title="Members"
        description={prefsLoaded ? tabDescription(isGeneral, activeTab, activeCycle) : "\u00a0"}
        actions={
          notes.data && prefsLoaded ? (
            <>
              <SegmentedControl<MembersLayout>
                ariaLabel="Notes layout"
                value={layout}
                onChange={changeLayout}
                // The header row holds its controls at h-9; below md they match the 40px roster controls.
                className="max-sm:*:flex-1 max-md:h-10!"
                options={[
                  { value: "person", label: "Person", title: "One member at a time, with all their notes" },
                  { value: "class", label: "Class", title: `Everyone's ${tabName} note on one page` }
                ]}
              />
              <CyclePicker
                cycles={cycles}
                value={activeTab}
                onChange={changeTab}
                leadingOptions={[{ value: MEMBER_GENERAL_CYCLE_NUMBER, label: "General" }]}
                ariaLabel="Cycles"
                className="max-sm:min-w-0 max-sm:max-w-none max-md:h-10!"
              />
            </>
          ) : null
        }
      />

      {notes.loadError ? (
        <Alert
          tone={notes.data ? "warning" : "danger"}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void notes.reload()} disabled={notes.fetching}>
              {notes.fetching ? <Spinner /> : <RotateCw aria-hidden />}
              Try again
            </Button>
          }
        >
          {notes.loadError}
        </Alert>
      ) : null}
      {notes.saveError ? (
        <Alert
          tone="danger"
          onDismiss={notes.dismissSaveError}
          action={
            <Button type="button" variant="outline" size="sm" onClick={notes.retryFailed} disabled={notes.savingKeys.size > 0}>
              {notes.savingKeys.size > 0 ? <Spinner /> : <RotateCw aria-hidden />}
              Try again
            </Button>
          }
        >
          {notes.saveError}
        </Alert>
      ) : null}

      {notes.loading || (notes.data && !prefsLoaded) ? (
        <MembersBodySkeleton />
      ) : !notes.data ? null : members.length === 0 ? (
        <div className="rounded-md border border-border bg-card">
          <EmptyState icon={Users} title="No class members to show." description="Executives, the adviser and super admin aren't listed." />
        </div>
      ) : !personLayout ? (
        <MemberSheet
          header={rosterHeader(true)}
          empty={rosterEmpty}
          members={visible}
          activeTab={activeTab}
          drafts={drafts}
          handlers={handlers}
        />
      ) : (
        <ListDetail
          listWidth="20rem"
          showDetailOnPhone={phone.open && Boolean(selected)}
          list={
            <MemberList
              header={rosterHeader(false)}
              empty={rosterEmpty}
              members={visible}
              tabs={tabs}
              activeTab={activeTab}
              selectedId={selected?.id ?? null}
              onSelect={(memberId, { viaKeyboard }) =>
                selectMember(memberId, { focusEditor: viaKeyboard, openOnPhone: true })
              }
              filledTabs={(memberId) => tabsWithNotes(drafts, memberId, tabs)}
              savingFor={(memberId) => savingMembers.has(memberId)}
              errorFor={(memberId) => errorMembers.get(memberId) ?? null}
              listRef={listRef}
            />
          }
          detail={
            // Nobody listed: the roster's own empty row says why, so this side stays empty.
            selected ? (
              <div ref={phone.detailRef} className="min-w-0 scroll-mt-24 space-y-3">
                <div className="flex items-center justify-between gap-2 lg:hidden">
                  <Button type="button" variant="ghost" className="-ml-2 h-10 px-2" onClick={phone.closeDetail}>
                    <ArrowLeft aria-hidden />
                    Members
                  </Button>
                  <MemberStepper {...stepper} className="h-10" />
                </div>
                <MemberDetail
                  member={selected}
                  cycles={cycles}
                  activeTab={activeTab}
                  drafts={drafts}
                  handlers={handlers}
                  primaryRef={primaryRef}
                  onSaveAndNext={saveAndNext}
                  onOpenCycle={openCycle}
                  stepper={stepper}
                />
              </div>
            ) : null
          }
        />
      )}
    </div>
  );
}
