"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Lets a page shell hand content (Groups: Initial Cut's approval path) to the stage's decision
 * bar, so the steps and the decisions share one block. The shell keeps drawing it itself until a
 * decision bar claims it, so it never disappears while the stage loads or has no bar.
 */
type DecisionLeadValue = { node: ReactNode; claim: () => () => void };

const DecisionLeadContext = createContext<DecisionLeadValue | null>(null);

export function useDecisionLeadHost(node: ReactNode) {
  const [claims, setClaims] = useState(0);
  const value: DecisionLeadValue = {
    node,
    claim: () => {
      setClaims((count) => count + 1);
      return () => setClaims((count) => count - 1);
    }
  };
  return { value, claimed: claims > 0 };
}

export const DecisionLeadProvider = DecisionLeadContext.Provider;

/** The handed-over content, claimed while the caller is mounted (null when there is none). */
export function useDecisionLead(enabled: boolean): ReactNode {
  const context = useContext(DecisionLeadContext);
  const hasNode = Boolean(context?.node);
  const claim = context?.claim;
  useEffect(() => {
    if (!enabled || !hasNode || !claim) return;
    return claim();
    // `claim` is rebuilt each render; only enabled/presence decide the claim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasNode]);
  return enabled ? (context?.node ?? null) : null;
}
