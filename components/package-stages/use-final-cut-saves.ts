"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { FinalCutScoreInput } from "@/components/package-cycle/final-cut-grade-card";

type SaveResponse = {
  data?: { savedCount: number; gradedCount: number; complete: boolean };
  error?: { message?: string };
};

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => ({}))) as SaveResponse;
  return { response, payload };
}

/**
 * Final Cut saves: member scores (with the "Saved. …" preview line), the anchors' toss, the
 * shared cycle grade note and Publish Grades. Each reloads the stage quietly afterwards, so
 * typed-but-unsaved scores survive (FinalCutGradeCard resets them only when saved scores change).
 */
export function useFinalCutSaves({ rowId, reload }: { rowId: string | null; reload: () => Promise<void> }) {
  const [gradePreview, setGradePreview] = useState<string | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [publishingGrades, setPublishingGrades] = useState(false);
  const [tossOpen, setTossOpen] = useState(false);
  const [savingToss, setSavingToss] = useState(false);

  async function saveGrade(scores: FinalCutScoreInput[]) {
    if (!rowId) return;
    const { response, payload } = await postJson("/api/package-cycle/grade", { rowId, scores });
    if (!response.ok || !payload.data) {
      toast.error(payload.error?.message ?? "Could not save scores.");
      return;
    }
    if (payload.data.savedCount === 0) {
      toast.error("Nothing saved. Those members keep their earlier grade.");
      await reload();
      return;
    }
    const { complete, gradedCount } = payload.data;
    setGradePreview(
      complete
        ? "Saved. Every member has an official grade."
        : gradedCount > 0
          ? `Saved. ${gradedCount} member${gradedCount === 1 ? "" : "s"} now have an official grade.`
          : "Saved. Waiting on other executive producers."
    );
    toast.success("Scores saved.");
    await reload();
  }

  async function saveToss(toss: string) {
    if (!rowId) return;
    setSavingToss(true);
    try {
      const { response, payload } = await postJson("/api/package-cycle/toss", { rowId, toss });
      if (!response.ok) {
        toast.error(payload.error?.message ?? "Could not save the toss.");
        return;
      }
      setTossOpen(false);
      toast.success("Toss saved.");
      await reload();
    } finally {
      setSavingToss(false);
    }
  }

  async function saveCycleFeedback(feedback: string) {
    if (!rowId) return;
    setSavingFeedback(true);
    try {
      const { response, payload } = await postJson("/api/package-cycle/grade/feedback", { rowId, feedback });
      if (!response.ok) {
        toast.error(payload.error?.message ?? "Could not save feedback.");
        return;
      }
      toast.success("Cycle grade feedback saved.");
      await reload();
    } finally {
      setSavingFeedback(false);
    }
  }

  async function publishCycleGrades(feedback: string) {
    if (!rowId) return;
    setPublishingGrades(true);
    try {
      const { response, payload } = await postJson("/api/package-cycle/grade/publish", { rowId, feedback });
      if (!response.ok) {
        toast.error(payload.error?.message ?? "Could not publish grades.");
        return;
      }
      toast.success("Grades published. Students can see them on Grades.");
      await reload();
    } finally {
      setPublishingGrades(false);
    }
  }

  return {
    gradePreview,
    savingFeedback,
    publishingGrades,
    tossOpen,
    setTossOpen,
    savingToss,
    saveGrade,
    saveToss,
    saveCycleFeedback,
    publishCycleGrades
  };
}
