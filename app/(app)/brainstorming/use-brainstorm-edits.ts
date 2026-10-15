"use client";

import { useState } from "react";
import { toast } from "sonner";
import { isGoogleDocUrl, proofUploadFailureMessage, type BrainstormProofView } from "@/src/lib/package-brainstorm";
import { compressProofImage } from "@/src/lib/proof-image-client";
import { requestNavStatusRefresh } from "@/src/lib/sidebar-nav";
import {
  mergeSavedPackage,
  withoutProof,
  withProof,
  type BrainstormPackage,
  type SavedBrainstormPackage
} from "./brainstorm-view";

type UpdatePackage = (packageId: string, update: (pkg: BrainstormPackage) => BrainstormPackage) => void;

/** The stage bar's Brainstorming tag and the My package statuses come from the nav "package" part. */
function refreshPackageNav() {
  requestNavStatusRefresh(["package"]);
}

function withoutKey(record: Record<string, string>, key: string) {
  return Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== key));
}

/**
 * The page's changes: proof upload (one at a time) and removal, and the Google Doc link with
 * its typed drafts and inline errors. Each success updates the package on screen and the shell's
 * package statuses.
 */
export function useBrainstormEdits(updatePackage: UpdatePackage) {
  const [savingDocId, setSavingDocId] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ packageId: string; slot: number } | null>(null);
  // Only what the person typed; an untouched field shows the saved link.
  const [docDrafts, setDocDrafts] = useState<Record<string, string>>({});
  const [docErrors, setDocErrors] = useState<Record<string, string>>({});

  /** A Refresh or cycle switch shows the saved links again. */
  function resetDrafts() {
    setDocDrafts({});
    setDocErrors({});
  }

  function editDraft(packageId: string, value: string) {
    setDocDrafts((current) => ({ ...current, [packageId]: value }));
    setDocErrors((current) => withoutKey(current, packageId));
  }

  async function saveDoc(pkg: BrainstormPackage) {
    const url = (docDrafts[pkg.id] ?? pkg.brainstormDocUrl).trim();
    if (url && !isGoogleDocUrl(url)) {
      setDocErrors((current) => ({ ...current, [pkg.id]: "Paste a Google Docs or Drive link." }));
      return;
    }
    setSavingDocId(pkg.id);
    setDocErrors((current) => withoutKey(current, pkg.id));
    try {
      const response = await fetch("/api/brainstorming", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "doc", rowId: pkg.id, url })
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { package: SavedBrainstormPackage };
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.data) {
        throw new Error(body?.error?.message ?? "Could not save the Google Doc link.");
      }
      const saved = body.data.package;
      updatePackage(pkg.id, (current) => mergeSavedPackage(current, saved));
      // Keep anything typed after this save started.
      setDocDrafts((current) => (current[pkg.id]?.trim() === url ? withoutKey(current, pkg.id) : current));
      toast.success("Google Doc saved.");
      refreshPackageNav();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save the Google Doc link.";
      setDocErrors((current) => ({ ...current, [pkg.id]: message }));
      toast.error(message);
    } finally {
      setSavingDocId(null);
    }
  }

  async function uploadProof(packageId: string, slot: number, file: File) {
    setUploadingKey(`${packageId}-${slot}`);
    try {
      const compressed = await compressProofImage(file);
      const form = new FormData();
      form.set("rowId", packageId);
      form.set("slot", String(slot));
      form.set("file", compressed);
      const response = await fetch("/api/brainstorming/proofs", { method: "POST", body: form });
      const text = await response.text();
      let body: { data?: { proof: BrainstormProofView }; error?: { message?: string } } = {};
      try {
        body = JSON.parse(text) as typeof body;
      } catch {
        throw new Error(proofUploadFailureMessage(response.status, text));
      }
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? proofUploadFailureMessage(response.status, text));
      }
      const uploaded = body.data.proof;
      updatePackage(packageId, (current) => withProof(current, uploaded));
      toast.success(`Proof ${slot} uploaded.`);
      refreshPackageNav();
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : "Could not upload proof.");
    } finally {
      setUploadingKey(null);
    }
  }

  // Throws on failure so the confirm dialog stays open for a retry.
  async function removeProof(packageId: string, slot: number) {
    try {
      const response = await fetch(`/api/brainstorming/proofs?rowId=${packageId}&slot=${slot}`, { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Could not remove proof.");
      }
      updatePackage(packageId, (current) => withoutProof(current, slot));
      toast.success("Proof removed");
      refreshPackageNav();
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : "Could not remove proof.");
      throw removeError;
    }
  }

  return {
    savingDocId,
    uploadingKey,
    pendingRemoval,
    setPendingRemoval,
    docDrafts,
    docErrors,
    resetDrafts,
    editDraft,
    saveDoc,
    uploadProof,
    removeProof
  };
}
