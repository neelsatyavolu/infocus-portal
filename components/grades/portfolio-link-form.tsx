"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { portfolioLinkSchema } from "@/src/lib/portfolio";

/**
 * The student's own portfolio link for this semester (PUT /api/grades/portfolio). Graders see it
 * beside the Portfolio score in the Grade Editor. Clearing the box and saving removes it.
 */
export function PortfolioLinkForm({ initialLink, semesterLabel }: { initialLink: string | null; semesterLabel?: string }) {
  const [saved, setSaved] = useState(initialLink ?? "");
  const [value, setValue] = useState(initialLink ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const trimmed = value.trim();
  const dirty = trimmed !== saved;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed) {
      const parsed = portfolioLinkSchema.safeParse(trimmed);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Enter a valid https:// link.");
        return;
      }
    }
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/grades/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: trimmed || null })
      });
      const payload = (await response.json()) as { data?: { link: string | null }; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Couldn't save your portfolio link.");
      const next = payload.data?.link ?? "";
      setSaved(next);
      setValue(next);
      toast.success(next ? "Portfolio link saved." : "Portfolio link removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save your portfolio link.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-1.5" noValidate>
      <label htmlFor="portfolio-link" className="text-xs font-medium text-foreground">
        Portfolio link{semesterLabel ? ` (${semesterLabel})` : ""}
      </label>
      <div className="flex gap-2">
        <Input
          id="portfolio-link"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "portfolio-link-error" : undefined}
          disabled={saving}
          className="min-w-0 flex-1"
        />
        <Button type="submit" size="sm" variant="outline" disabled={saving || !dirty} className="shrink-0 self-center">
          {saving ? "Saving" : saved ? "Update" : "Submit"}
        </Button>
      </div>
      {error ? (
        <p id="portfolio-link-error" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Your graders see this link next to your portfolio score.</p>
      )}
    </form>
  );
}
