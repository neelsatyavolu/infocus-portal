"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { MAX_PORTFOLIO_POINTS } from "@/src/lib/grading";
import { cn } from "@/src/lib/utils";
import { ScoreInput } from "./grade-editor-table";

/**
 * Saved Portfolio scores for the Total grade table (one semester, the current one unless the
 * caller passes another). Each cell posts to /api/grades/portfolio on blur; the API enforces who
 * may grade (executive producer and up), the same people who can open the Grade Editor.
 */
export type PortfolioEntry = { points: number | null; link: string | null };

export const PORTFOLIO_COLUMN = {
  label: "Portfolio",
  sub: `/${MAX_PORTFOLIO_POINTS}`,
  title: "Saved portfolio score for this semester (empty = ungraded)",
  width: 112,
  align: "right" as const
};

type PortfolioPayload = {
  semester: string;
  grades: Array<{ userId: string; points: number | null; link: string | null }>;
};

export function usePortfolioGrades(semester?: string) {
  const [semesterLabel, setSemesterLabel] = useState<string | null>(semester ?? null);
  const [byUserId, setByUserId] = useState<ReadonlyMap<string, PortfolioEntry>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const query = semester ? `?semester=${encodeURIComponent(semester)}` : "";
    fetch(`/api/grades/portfolio${query}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { data?: PortfolioPayload; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Failed to load portfolios.");
        return payload.data;
      })
      .then((data) => {
        if (cancelled) return;
        setSemesterLabel(data.semester);
        setByUserId(new Map(data.grades.map((grade) => [grade.userId, { points: grade.points, link: grade.link }])));
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Failed to load portfolios.");
      });
    return () => {
      cancelled = true;
    };
  }, [semester]);

  const save = useCallback(
    async (userId: string, points: number | null) => {
      const response = await fetch("/api/grades/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, points, ...(semesterLabel ? { semester: semesterLabel } : {}) })
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Failed to save the portfolio score.");
      setByUserId((current) => {
        const next = new Map(current);
        next.set(userId, { points, link: current.get(userId)?.link ?? null });
        return next;
      });
    },
    [semesterLabel]
  );

  return { semester: semesterLabel, byUserId, save };
}

/** Parses a typed score: "" or "-" clears it; otherwise a whole number 0–100. undefined = invalid. */
export function parsePortfolioInput(raw: string): number | null | undefined {
  const value = raw.trim();
  if (value === "" || value === "-") return null;
  if (!/^\d+(\.\d+)?$/.test(value)) return undefined;
  const points = Math.round(Number(value));
  return points <= MAX_PORTFOLIO_POINTS ? points : undefined;
}

export function PortfolioCell({
  name,
  entry,
  onSave
}: {
  name: string;
  entry: PortfolioEntry | undefined;
  onSave: (points: number | null) => Promise<void>;
}) {
  const saved = entry?.points ?? null;
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function commit() {
    if (draft === null) return;
    const points = parsePortfolioInput(draft);
    if (points === undefined) {
      toast.error(`Portfolio score must be 0–${MAX_PORTFOLIO_POINTS}, or empty for ungraded.`);
      setDraft(null);
      return;
    }
    if (points === saved) {
      setDraft(null);
      return;
    }
    setSaving(true);
    try {
      await onSave(points);
      setDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save the portfolio score.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="flex items-center justify-end gap-1.5">
      {entry?.link ? (
        <a
          href={entry.link}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${name}'s portfolio`}
          aria-label={`Open ${name}'s portfolio`}
          className="text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ) : null}
      <span className={cn(saving && "opacity-60")}>
        <ScoreInput
          label={`${name} portfolio score`}
          title="Saved score out of 100. Empty or - for ungraded."
          value={draft ?? (saved === null ? "" : String(saved))}
          max={null}
          inputMode="numeric"
          navKey="total-portfolio"
          disabled={saving}
          onChange={setDraft}
          onBlur={() => void commit()}
        />
      </span>
    </span>
  );
}
