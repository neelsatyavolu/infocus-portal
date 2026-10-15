"use client";

import { useState } from "react";
import { Alert } from "@/components/kit/alert";
import type { VaultImportResult } from "@/src/lib/password-vault";

const SHOWN_WARNINGS = 5;

/** The import result: how many came in, then each skipped part as its own line. */
export function ImportNotice({ result, onDismiss }: { result: VaultImportResult; onDismiss: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const warnings = showAll ? result.warnings : result.warnings.slice(0, SHOWN_WARNINGS);
  const hidden = result.warnings.length - SHOWN_WARNINGS;

  return (
    <Alert
      tone="success"
      title={`Imported ${result.imported} password${result.imported === 1 ? "" : "s"}.`}
      onDismiss={onDismiss}
    >
      {result.warnings.length ? (
        <>
          <ul className="list-disc space-y-0.5 pl-5">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              aria-expanded={showAll}
              className="mt-1 rounded-sm text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showAll ? "Show fewer" : `Show ${hidden} more`}
            </button>
          ) : null}
        </>
      ) : null}
    </Alert>
  );
}
