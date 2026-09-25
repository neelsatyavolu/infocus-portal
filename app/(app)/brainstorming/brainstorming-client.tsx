"use client";

import ProducerFeedbackDialog from "@/components/package-cycle/producer-feedback-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCcw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  proofUploadFailureMessage,
  PROOF_OF_CONTACT_SLOTS,
  type BrainstormProofView
} from "@/src/lib/package-brainstorm";
import { compressProofImage } from "@/src/lib/proof-image-client";
import { StageComments } from "@/components/package-cycle/stage-comments";
import { StageStatusChip } from "@/components/package-cycle/stage-status-chip";
import { cycleStageStatus, emptyCycleStageStatusInput, type CycleStageStatus } from "@/src/lib/package-stage-status";
import { cn } from "@/src/lib/utils";

type Member = {
  userId: string;
  name: string | null;
  email: string | null;
};

type PackageCard = {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  brainstormDocUrl: string;
  proofOfContact: boolean;
  canEdit: boolean;
  assignedProducer: { userId: string; name: string | null; email: string | null } | null;
  members: Member[];
  proofs: BrainstormProofView[];
};

type Payload = {
  currentUserId: string;
  canApprove: boolean;
  activeCycleNumber: number;
  cycles: Array<{ cycleNumber: number; focus: string }>;
  packages: PackageCard[];
};

function personLabel(person: { name: string | null; email: string | null } | null | undefined) {
  if (!person) return null;
  return person.name?.trim() || person.email || null;
}

function packageStatus(pkg: PackageCard): CycleStageStatus {
  return cycleStageStatus("brainstorming", {
    ...emptyCycleStageStatusInput(),
    proofOfContact: pkg.proofOfContact,
    proofCount: pkg.proofs.length,
    brainstormDocUrl: pkg.brainstormDocUrl
  });
}

async function fetchPayload(cycleNumber?: number) {
  const query = typeof cycleNumber === "number" ? `?cycle=${cycleNumber}` : "";
  const response = await fetch(`/api/brainstorming${query}`, { cache: "no-store" });
  const body = (await response.json()) as { data?: Payload; error?: { message?: string } };
  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "Failed to load brainstorming.");
  }
  return body.data;
}

export default function BrainstormingClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDocId, setSavingDocId] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [docDrafts, setDocDrafts] = useState<Record<string, string>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async (cycleNumber?: number) => {
    setLoading(true);
    try {
      const data = await fetchPayload(cycleNumber);
      setPayload(data);
      setDocDrafts(Object.fromEntries(data.packages.map((pkg) => [pkg.id, pkg.brainstormDocUrl])));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load brainstorming.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cycle = Number(new URLSearchParams(window.location.search).get("cycle"));
    void load(Number.isInteger(cycle) && cycle > 0 ? cycle : undefined);
  }, [load]);

  function replacePackage(next: PackageCard) {
    setPayload((current) => {
      if (!current) return current;
      return {
        ...current,
        packages: current.packages.map((pkg) =>
          pkg.id === next.id ? { ...next, canEdit: next.canEdit ?? pkg.canEdit } : pkg
        )
      };
    });
    setDocDrafts((current) => ({ ...current, [next.id]: next.brainstormDocUrl }));
  }

  async function saveDoc(pkg: PackageCard) {
    const url = (docDrafts[pkg.id] ?? "").trim();
    setSavingDocId(pkg.id);
    try {
      const response = await fetch("/api/brainstorming", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "doc", rowId: pkg.id, url })
      });
      const body = (await response.json()) as {
        data?: { package: PackageCard };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "Could not save the Google Doc link.");
      }
      replacePackage(body.data.package);
      toast.success("Google Doc saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the Google Doc link.");
    } finally {
      setSavingDocId(null);
    }
  }

  async function uploadProof(pkg: PackageCard, slot: number, file: File) {
    const key = `${pkg.id}-${slot}`;
    setUploadingKey(key);
    try {
      const compressed = await compressProofImage(file);
      const form = new FormData();
      form.set("rowId", pkg.id);
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
      const nextProofs = [...pkg.proofs.filter((proof) => proof.slot !== slot), body.data.proof].sort(
        (a, b) => a.slot - b.slot
      );
      replacePackage({ ...pkg, proofs: nextProofs });
      toast.success(`Proof ${slot} uploaded.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload proof.");
    } finally {
      setUploadingKey(null);
    }
  }

  async function removeProof(pkg: PackageCard, slot: number) {
    try {
      const response = await fetch(`/api/brainstorming/proofs?rowId=${pkg.id}&slot=${slot}`, {
        method: "DELETE"
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Could not remove proof.");
      }
      replacePackage({ ...pkg, proofs: pkg.proofs.filter((proof) => proof.slot !== slot) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove proof.");
    }
  }

  const cycles = payload?.cycles ?? [];
  const activeCycleNumber = payload?.activeCycleNumber ?? 1;
  const packages = payload?.packages ?? [];

  return (
    <div className="route-enter mx-auto w-full max-w-[80rem] space-y-5 pb-24">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow">Production</div>
            <h1 className="display-md mt-2 text-foreground">Brainstorming</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload three proofs of contact and link the group Google Doc. Your producer reviews this on
              Groups and approves the check-in.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {payload?.canApprove ? (
              <Link
                href={"/groups" as never}
                className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
              >
                Review on Groups
              </Link>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load(activeCycleNumber)}
              disabled={loading}
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <ProducerFeedbackDialog initialCycle={activeCycleNumber} />
          </div>
        </div>
      </section>

      {loading && !payload ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Loading your packages…
        </p>
      ) : packages.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {payload?.canApprove
            ? "No packages to review in this cycle. Open Groups to review brainstorming for a package."
            : "You are not on a package group for this cycle yet. Once a producer adds you on Package Cycle, this page will open for that package."}
        </p>
      ) : (
        <div className="space-y-4">
          {packages.map((pkg) => {
            const status = packageStatus(pkg);
            const producerName = personLabel(pkg.assignedProducer);
            return (
              <article key={pkg.id} className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-foreground">
                      {pkg.groupTopic.trim() || "Untitled package"}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pkg.members.map((member) => personLabel(member) ?? "Member").join(", ") || "No members"}
                      {producerName ? ` · Producer ${producerName}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <StageComments
                      rowId={pkg.id}
                      stage="brainstorming"
                      canWrite={Boolean(payload?.canApprove)}
                    />
                    <StageStatusChip status={status} size="lg" />
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Proofs of contact
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {PROOF_OF_CONTACT_SLOTS.map((slot) => {
                      const proof = pkg.proofs.find((item) => item.slot === slot);
                      const key = `${pkg.id}-${slot}`;
                      const uploading = uploadingKey === key;
                      return (
                        <div key={slot} className="rounded-xl border border-border bg-black/30 light:bg-muted p-2">
                          <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Proof {slot}</span>
                            {proof && pkg.canEdit ? (
                              <button
                                type="button"
                                className="rounded p-0.5 hover:bg-secondary hover:text-foreground"
                                onClick={() => void removeProof(pkg, slot)}
                                aria-label={`Remove proof ${slot}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                          {proof ? (
                            <a href={proof.imageUrl} target="_blank" rel="noreferrer" className="block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={proof.imageUrl}
                                alt={proof.fileName}
                                className="h-36 w-full rounded-lg object-cover"
                              />
                            </a>
                          ) : pkg.canEdit ? (
                            <button
                              type="button"
                              disabled={uploading}
                              onClick={() => fileInputs.current[key]?.click()}
                              className="flex h-36 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-[var(--brand-green)]/50 hover:text-foreground"
                            >
                              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                              {uploading ? "Uploading…" : "Upload image"}
                            </button>
                          ) : (
                            <div className="flex h-36 w-full items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                              No proof yet
                            </div>
                          )}
                          <input
                            ref={(node) => {
                              fileInputs.current[key] = node;
                            }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              if (file) void uploadProof(pkg, slot, file);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Brainstorm Google Doc
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={docDrafts[pkg.id] ?? ""}
                      onChange={(event) =>
                        setDocDrafts((current) => ({ ...current, [pkg.id]: event.target.value }))
                      }
                      placeholder="https://docs.google.com/document/d/…"
                      disabled={!pkg.canEdit}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-black/40 light:bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--brand-green)]/50 disabled:opacity-70"
                    />
                    <div className="flex gap-2">
                      {pkg.brainstormDocUrl ? (
                        <a
                          href={pkg.brainstormDocUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open
                        </a>
                      ) : null}
                      {pkg.canEdit ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={savingDocId === pkg.id}
                          onClick={() => void saveDoc(pkg)}
                        >
                          {savingDocId === pkg.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Save link
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>

              </article>
            );
          })}
        </div>
      )}

      <section className="sticky bottom-4 z-20 mx-auto flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-xl border border-foreground/[0.08] bg-black/85 light:bg-muted p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur">
          {cycles.map((cycle) => {
            const active = cycle.cycleNumber === activeCycleNumber;
            return (
              <button
                key={cycle.cycleNumber}
                type="button"
                onClick={() => void load(cycle.cycleNumber)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.18em] transition",
                  active
                    ? "bg-[var(--brand-green)] text-[var(--ink)]"
                    : "text-[var(--ink-text)] hover:bg-foreground/5 hover:text-foreground"
                )}
              >
                Cycle
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono-broadcast text-[10px] font-bold",
                    active ? "bg-black/35 text-[var(--ink)]" : "bg-black/40 light:bg-foreground/10 text-[var(--ink-text)]"
                  )}
                >
                  {String(cycle.cycleNumber).padStart(2, "0")}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
