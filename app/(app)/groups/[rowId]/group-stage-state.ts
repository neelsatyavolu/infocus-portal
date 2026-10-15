"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useParams, useRouter } from "next/navigation";
import { requestNavStatusRefresh } from "@/src/lib/sidebar-nav";
import {
  pruneFlagOverrides,
  resolveFlag,
  type FlagKey,
  type FlagOverride,
  type FlagOverrides,
  type StageCellKey
} from "./stage-bar-model";
import { nextSeenSignatures, type CellSignatures } from "./stage-changes";
import { isStageWrite } from "./stage-writes";

type GroupStageState = {
  overrides: FlagOverrides;
  setFlag: (key: FlagKey, override: FlagOverride) => void;
};

/**
 * Optimistic Pitch and Contact approvals, shared by the stage panels and the shell's stage bar,
 * so the bar and the decision bar's tag flip together before router.refresh() brings the server
 * value.
 */
export const GroupStageStateContext = createContext<GroupStageState | null>(null);

export function useGroupStageOverrides(server: Record<FlagKey, boolean>): GroupStageState {
  const [overrides, setOverrides] = useState<FlagOverrides>({});
  const { pitching, proofOfContact } = server;

  // Once the refreshed server value arrives, the override is spent (pruned while rendering).
  const [prunedFor, setPrunedFor] = useState({ pitching, proofOfContact });
  if (prunedFor.pitching !== pitching || prunedFor.proofOfContact !== proofOfContact) {
    setPrunedFor({ pitching, proofOfContact });
    setOverrides((current) => pruneFlagOverrides(current, { pitching, proofOfContact }));
  }

  const setFlag = useCallback((key: FlagKey, override: FlagOverride) => {
    setOverrides((current) => ({ ...current, [key]: override }));
  }, []);

  return useMemo(() => ({ overrides, setFlag }), [overrides, setFlag]);
}

/** `[value, set]` for one flag: the server value, or the panel's change until the server catches up. */
export function useStageFlag(key: FlagKey, base: boolean): [boolean, (next: boolean) => void] {
  const state = useContext(GroupStageStateContext);
  const setFlag = state?.setFlag;
  const set = useCallback((next: boolean) => setFlag?.(key, { value: next, base }), [setFlag, key, base]);
  return [resolveFlag(state?.overrides[key], base), set];
}

/**
 * The hosted StageWorkspace (A/B-roll, Initial, Final) saves through its own requests and then
 * reloads only its own view, so the server-rendered stage bar and approval path would keep the
 * old statuses next to its fresh decision bar. It offers no change callback, so this watches its
 * finished writes (Resource Timing) and refreshes the server data and the sidebar's Groups count
 * after each one.
 */
export function useRefreshAfterStageWrites(rowId: string, enabled: boolean) {
  const router = useRouter();
  const stage = useParams<{ stage?: string }>()?.stage;

  useEffect(() => {
    if (!enabled || typeof PerformanceObserver === "undefined") return;
    const origin = window.location.origin;
    const observer = new PerformanceObserver((list) => {
      if (list.getEntries().some((entry) => isStageWrite(entry as PerformanceResourceTiming, origin, rowId, stage))) {
        router.refresh();
        requestNavStatusRefresh(["groups"]);
      }
    });
    try {
      observer.observe({ type: "resource" });
    } catch {
      // No Resource Timing: the statuses update on the next visit, as before.
      return;
    }
    return () => observer.disconnect();
  }, [enabled, rowId, stage, router]);
}

function subscribeNever() {
  return () => undefined;
}

function seenKey(rowId: string) {
  return `infocus:ui:group-stages:seen:v1:${rowId}`;
}

function readSeen(rowId: string): CellSignatures {
  try {
    const raw = window.localStorage.getItem(seenKey(rowId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as CellSignatures) : {};
  } catch {
    return {};
  }
}

function writeSeen(rowId: string, seen: CellSignatures) {
  try {
    window.localStorage.setItem(seenKey(rowId), JSON.stringify(seen));
  } catch {
    // Storage blocked or full: changes just won't be remembered for this viewer.
  }
}

/**
 * Which of this group's stages changed since this viewer last opened them (this browser only;
 * see stage-changes.ts). Empty until the browser storage is read, so server and client agree.
 */
export function useGroupStageChanges(
  rowId: string,
  signatures: CellSignatures,
  activeKey: StageCellKey | null
): ReadonlySet<StageCellKey> {
  // False on the server and while hydrating, so the first render matches the server's.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  // A stable comparison: the signatures object is rebuilt on every render.
  const signaturesKey = JSON.stringify(signatures);
  const inputKey = `${rowId}\n${signaturesKey}\n${activeKey}`;
  const [state, setState] = useState<{
    inputKey: string | null;
    changed: ReadonlySet<StageCellKey>;
    write: { rowId: string; seen: CellSignatures } | null;
  }>(() => ({ inputKey: null, changed: new Set(), write: null }));

  // Worked out while rendering when the inputs change; storage is only written after commit, so
  // a repeated render reads the same stored copy.
  if (hydrated && state.inputKey !== inputKey) {
    const result = nextSeenSignatures(readSeen(rowId), JSON.parse(signaturesKey) as CellSignatures, activeKey);
    setState({ inputKey, changed: result.flagged, write: { rowId, seen: result.seen } });
  }

  const { write } = state;
  useEffect(() => {
    if (write) writeSeen(write.rowId, write.seen);
  }, [write]);

  return state.changed;
}
