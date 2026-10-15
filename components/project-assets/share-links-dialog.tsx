"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Copy, Send } from "lucide-react";
import { Field, fieldClass } from "@/components/kit/field";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import type { GuestPermissionValue, ShareLink } from "@/components/project-assets/types";

type ShareMessage = { tone: "ok" | "error"; text: string } | null;

/**
 * Guest review links for the project: create (permission, expiry, optional passcode), copy and
 * revoke. Loads the list each time it opens. Messages stay inside the dialog; failures show as
 * an error line (icon + Danger words), confirmations as a muted line.
 */
export default function ShareLinksDialog({
  projectId,
  open,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareMessage, setShareMessage] = useState<ShareMessage>(null);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const ok = (text: string) => setShareMessage({ tone: "ok", text });
  const fail = (text: string) => setShareMessage({ tone: "error", text });
  const [sharePermission, setSharePermission] = useState<GuestPermissionValue>("COMMENT");
  const [sharePasscode, setSharePasscode] = useState("");
  const [shareExpiry, setShareExpiry] = useState("");

  const loadShareLinks = useCallback(async () => {
    setShareLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/guest-links`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed");
      }

      const payload = await response.json();
      setShareLinks(payload.data as ShareLink[]);
    } catch {
      setShareMessage({ tone: "error", text: "Could not load share links." });
    } finally {
      setShareLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setShareMessage(null);
    void loadShareLinks();
  }, [loadShareLinks, open]);

  async function createShareLink(event: FormEvent) {
    event.preventDefault();
    if (creating) {
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/guest-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId,
          permission: sharePermission,
          passcode: sharePasscode || undefined,
          expiresAt: shareExpiry || undefined
        })
      });

      if (!response.ok) {
        fail("Failed to create share link.");
        return;
      }

      ok("Share link created.");
      setSharePasscode("");
      setShareExpiry("");
      await loadShareLinks();
    } catch {
      fail("Failed to create share link.");
    } finally {
      setCreating(false);
    }
  }

  async function revokeShareLink(id: string) {
    setRevokingId(id);
    try {
      const response = await fetch(`/api/guest-links/${id}/revoke`, {
        method: "POST"
      });

      if (!response.ok) {
        fail("Failed to revoke share link.");
        return;
      }
      ok("Share link revoked.");
      await loadShareLinks();
    } catch {
      fail("Failed to revoke share link.");
    } finally {
      setRevokingId(null);
    }
  }

  async function copyShareLink(token: string) {
    try {
      const url = `${window.location.origin}/g/${token}`;
      await navigator.clipboard.writeText(url);
      ok("Copied share link.");
    } catch {
      fail("Could not copy share link.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share links</DialogTitle>
          <DialogDescription>Create links for reviewers and keep full control with expiry and passcodes.</DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void createShareLink(event)} className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Field label="Permission" htmlFor="share-permission">
            <NativeSelect
              id="share-permission"
              value={sharePermission}
              onChange={(event) => setSharePermission(event.target.value as GuestPermissionValue)}
            >
              <option value="COMMENT">View + Comment</option>
              <option value="VIEW">View only</option>
            </NativeSelect>
          </Field>
          <Field label="Expires" htmlFor="share-expiry">
            <input
              id="share-expiry"
              type="datetime-local"
              value={shareExpiry}
              onChange={(event) => setShareExpiry(event.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Passcode (optional)" htmlFor="share-passcode">
            <input
              id="share-passcode"
              type="password"
              value={sharePasscode}
              onChange={(event) => setSharePasscode(event.target.value)}
              placeholder="Optional passcode"
              autoComplete="new-password"
              className={fieldClass}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={creating}>
              <Send aria-hidden />
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>

        <div className="min-w-0">
          {shareLoading ? (
            <p className="py-3 text-sm text-muted-foreground">Loading links...</p>
          ) : shareLinks.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No share links yet.</p>
          ) : (
            <ul className="max-h-[44vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
              {shareLinks.map((link) => (
                <li key={link.id} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <StatusTag tone={link.revokedAt ? "muted" : "neutral"}>
                      {link.permission === "COMMENT" ? "Can comment" : "View only"}
                    </StatusTag>
                    <span className="min-w-0 truncate text-[13px] text-muted-foreground">
                      {link.revokedAt
                        ? "Revoked"
                        : link.expiresAt
                          ? `Expires ${new Date(link.expiresAt).toLocaleString()}`
                          : "No expiry"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void copyShareLink(link.token)}>
                      <Copy aria-hidden />
                      Copy
                    </Button>
                    {!link.revokedAt ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive-quiet"
                        disabled={revokingId === link.id}
                        onClick={() => void revokeShareLink(link.id)}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div aria-live="polite" className="min-h-5">
          {/* Not InlineError: its role="alert" would announce twice inside this live region. */}
          {shareMessage?.tone === "error" ? (
            <p className="flex items-start gap-1.5 text-[13px] leading-snug text-danger">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">{shareMessage.text}</span>
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">{shareMessage?.text}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
