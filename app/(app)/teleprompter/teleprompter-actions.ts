import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { getSectionDisplayParts } from "@/src/lib/teleprompter-run-script";
import type { useReformatProgress } from "./teleprompter-hooks";
import { readData, type SectionDraft, type TeleprompterDoc, type TeleprompterSection } from "./teleprompter-model";

export type TeleprompterActionsContext = {
  activeDoc: TeleprompterDoc | null;
  activeWorkspaceId: string;
  selectedDocId: string | null;
  editingDocId: string | null;
  docTitleDraft: string;
  sectionDraft: SectionDraft;
  sectionEditorOpen: boolean;
  setDocs: Dispatch<SetStateAction<TeleprompterDoc[]>>;
  setWorking: (working: boolean) => void;
  setMessage: (message: string | null) => void;
  setSelectedDocId: Dispatch<SetStateAction<string | null>>;
  setCollapsedSections: Dispatch<SetStateAction<Record<string, boolean>>>;
  setCopiedSectionId: Dispatch<SetStateAction<string | null>>;
  /** Closes the New / Rename script dialog and clears its fields. */
  closeDocDialog: () => void;
  closeSectionEditor: () => void;
  progress: ReturnType<typeof useReformatProgress>;
  /** Sections this viewer just changed (not shown as "updated since your last visit"). */
  markTouched: (sectionIds: string[]) => void;
};

/**
 * The script and section API calls, with the same payloads, messages and error contracts as
 * before the redesign. Delete actions throw on failure so their confirm dialog stays open.
 */
export function createTeleprompterActions(ctx: TeleprompterActionsContext) {
  const { activeDoc, setDocs, setWorking, setMessage, progress } = ctx;

  function replaceSection(docId: string, updated: TeleprompterSection) {
    setDocs((current) =>
      current.map((doc) =>
        doc.id === docId
          ? { ...doc, sections: doc.sections.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)) }
          : doc
      )
    );
  }

  async function saveDoc() {
    const title = ctx.docTitleDraft.trim();

    if (!title) {
      return;
    }

    if (!ctx.activeWorkspaceId) {
      setMessage("Select a workspace before creating a script.");
      return;
    }

    setWorking(true);
    setMessage(null);

    try {
      if (ctx.editingDocId) {
        const updated = await readData<{ id: string; title: string }>(`/api/teleprompter/docs/${ctx.editingDocId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title })
        });

        setDocs((current) => current.map((entry) => (entry.id === updated.id ? { ...entry, title: updated.title } : entry)));
      } else {
        const created = await readData<TeleprompterDoc>("/api/teleprompter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: ctx.activeWorkspaceId, title })
        });

        setDocs((current) => [...current, created]);
        ctx.setSelectedDocId(created.id);
      }

      ctx.closeDocDialog();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save script.");
    } finally {
      setWorking(false);
    }
  }

  async function deleteDoc(doc: TeleprompterDoc) {
    setWorking(true);
    setMessage(null);

    try {
      await readData<{ id: string }>(`/api/teleprompter/docs/${doc.id}`, {
        method: "DELETE"
      });

      setDocs((current) => current.filter((entry) => entry.id !== doc.id));
      if (ctx.selectedDocId === doc.id) {
        ctx.setSelectedDocId(null);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete script.";
      setMessage(errorMessage);
      toast.error(errorMessage);
      throw error;
    } finally {
      setWorking(false);
    }
  }

  async function saveSection() {
    if (!activeDoc) {
      return;
    }

    const label = ctx.sectionDraft.label.trim();
    if (!label) {
      return;
    }

    setWorking(true);
    setMessage(null);

    try {
      if (ctx.sectionDraft.id) {
        const updated = await readData<TeleprompterSection>(`/api/teleprompter/sections/${ctx.sectionDraft.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, content: ctx.sectionDraft.content })
        });

        replaceSection(activeDoc.id, updated);
        ctx.markTouched([updated.id]);
      } else {
        const created = await readData<TeleprompterSection>(`/api/teleprompter/docs/${activeDoc.id}/sections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, content: ctx.sectionDraft.content })
        });

        setDocs((current) =>
          current.map((doc) => (doc.id === activeDoc.id ? { ...doc, sections: [...doc.sections, created] } : doc))
        );
        ctx.markTouched([created.id]);
      }

      ctx.closeSectionEditor();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save section.");
    } finally {
      setWorking(false);
    }
  }

  async function deleteSection(sectionId: string) {
    if (!activeDoc) {
      return;
    }

    setWorking(true);
    setMessage(null);

    try {
      await readData<{ id: string }>(`/api/teleprompter/sections/${sectionId}`, {
        method: "DELETE"
      });

      setDocs((current) =>
        current.map((doc) =>
          doc.id === activeDoc.id ? { ...doc, sections: doc.sections.filter((section) => section.id !== sectionId) } : doc
        )
      );
      if (ctx.sectionEditorOpen && ctx.sectionDraft.id === sectionId) {
        ctx.closeSectionEditor();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete section.";
      setMessage(errorMessage);
      toast.error(errorMessage);
      throw error;
    } finally {
      setWorking(false);
    }
  }

  /** Reformat (AI) or refetch (A2 bulletin) one section; the section opens afterwards. */
  async function runSectionJob(section: TeleprompterSection, job: "reformat" | "refetch") {
    if (!activeDoc) {
      return;
    }

    setWorking(true);
    setMessage(null);
    progress.startReformatProgress("section", section.id);

    try {
      const updated = await readData<TeleprompterSection>(`/api/teleprompter/sections/${section.id}/${job}`, {
        method: "POST"
      });

      replaceSection(activeDoc.id, updated);
      ctx.markTouched([section.id]);
      ctx.setCollapsedSections((current) => ({ ...current, [section.id]: false }));
      progress.finishReformatProgress("section", section.id);
    } catch (error) {
      const fallback = job === "reformat" ? "Failed to reformat section." : "Failed to refetch announcements.";
      setMessage(error instanceof Error ? error.message : fallback);
      progress.resetReformatProgress();
    } finally {
      progress.clearReformatProgress();
      setWorking(false);
    }
  }

  async function copySectionContent(section: TeleprompterSection) {
    const display = getSectionDisplayParts(section);
    const text = display.content || section.content || "";
    try {
      await navigator.clipboard.writeText(text);
      ctx.setCopiedSectionId(section.id);
      setMessage(null);
      window.setTimeout(() => {
        ctx.setCopiedSectionId((current) => (current === section.id ? null : current));
      }, 1500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to copy section.");
    }
  }

  async function reformatDoc(doc: TeleprompterDoc) {
    setWorking(true);
    setMessage(null);
    progress.startReformatProgress("doc", doc.id);

    try {
      const updated = await readData<TeleprompterDoc>(`/api/teleprompter/docs/${doc.id}/reformat`, {
        method: "POST"
      });

      setDocs((current) => current.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)));
      ctx.markTouched(updated.sections.map((section) => section.id));
      ctx.setCollapsedSections(Object.fromEntries(updated.sections.map((section) => [section.id, false])));
      progress.finishReformatProgress("doc", doc.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to reformat script.");
      progress.resetReformatProgress();
    } finally {
      progress.clearReformatProgress();
      setWorking(false);
    }
  }

  return {
    saveDoc,
    deleteDoc,
    saveSection,
    deleteSection,
    reformatSection: (section: TeleprompterSection) => runSectionJob(section, "reformat"),
    refetchBulletinSection: (section: TeleprompterSection) => runSectionJob(section, "refetch"),
    copySectionContent,
    reformatDoc
  };
}
