"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GuestPermissionValue } from "@/src/lib/types";

type ShareLink = {
  id: string;
  token: string;
  permission: GuestPermissionValue;
  expiresAt: string | null;
  revokedAt: string | null;
};

export function ShareLinksPanel({
  projectId,
  existingLinks
}: {
  projectId: string;
  existingLinks: ShareLink[];
}) {
  const [passcode, setPasscode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [permission, setPermission] = useState<GuestPermissionValue>("COMMENT");
  const [message, setMessage] = useState<string | null>(null);

  async function createLink() {
    const response = await fetch("/api/guest-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        permission,
        passcode: passcode || undefined,
        expiresAt: expiresAt || undefined
      })
    });

    setMessage(response.ok ? "Share link created. Refreshing..." : "Failed to create share link.");
    if (response.ok) window.location.reload();
  }

  async function revoke(id: string) {
    const response = await fetch(`/api/guest-links/${id}/revoke`, {
      method: "POST"
    });

    setMessage(response.ok ? "Share link revoked." : "Failed to revoke link.");
    if (response.ok) window.location.reload();
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/g/${token}`;
    void navigator.clipboard.writeText(url);
    setMessage("Copied guest link to clipboard.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share Links</CardTitle>
        <CardDescription>Create secure guest review links with expiry and optional passcode.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <select
            value={permission}
            onChange={(event) => setPermission(event.target.value as GuestPermissionValue)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          >
            <option value="COMMENT">View + Comment</option>
            <option value="VIEW">View only</option>
          </select>
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            placeholder="Expires at"
          />
          <Input
            type="password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="Optional passcode"
          />
          <Button onClick={createLink}>Create Link</Button>
        </div>

        <ul className="space-y-2">
          {existingLinks.length === 0 ? (
            <li className="text-sm text-muted-foreground">No guest links yet.</li>
          ) : (
            existingLinks.map((link) => (
              <li key={link.id} className="rounded-lg border border-border bg-muted p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-foreground">{link.permission === "COMMENT" ? "Can comment" : "View only"}</p>
                    <p className="text-xs text-muted-foreground">
                      {link.revokedAt
                        ? "Revoked"
                        : link.expiresAt
                          ? `Expires ${new Date(link.expiresAt).toLocaleString()}`
                          : "No expiry"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => copyLink(link.token)}>
                      Copy
                    </Button>
                    {!link.revokedAt ? (
                      <Button variant="destructive" size="sm" onClick={() => revoke(link.id)}>
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>

        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
