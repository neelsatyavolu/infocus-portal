"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

  // Once the refreshed server value arrives, the override is spent.
  useEffect(() => {
    setOverrides((current) => pruneFlagOverrides(current, { pitching, proofOfContact }));
  }, [pitching, proofOfContact]);

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

  useEffect(() => {
    if (!enabled || typeof PerformanceObserver === "undefined") return;
    const origin = window.location.origin;
    const observer = new PerformanceObserver((list) => {
      if (list.getEntries().some((entry) => isStageWrite(entry as PerformanceResourceTiming, origin, rowId))) {
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
  }, [enabled, rowId, router]);
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
  const [changed, setChanged] = useState<ReadonlySet<StageCellKey>>(() => new Set());
  // A stable dependency: the signatures object is rebuilt on every render.
  const signaturesKey = JSON.stringify(signatures);

  useEffect(() => {
    const result = nextSeenSignatures(readSeen(rowId), JSON.parse(signaturesKey) as CellSignatures, activeKey);
    writeSeen(rowId, result.seen);
    setChanged(result.flagged);
  }, [rowId, signaturesKey, activeKey]);

  return changed;
}
