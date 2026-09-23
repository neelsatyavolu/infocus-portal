import type { PackageCategory, PlatformRole } from "@prisma/client";
import { filterGroupsForViewer } from "@/src/lib/groups-visibility";
import { hasPlatformRole } from "@/src/lib/platform-admin";

export const PROOF_OF_CONTACT_SLOTS = [1, 2, 3] as const;

export type ProofOfContactSlot = (typeof PROOF_OF_CONTACT_SLOTS)[number];

export const PROOF_OF_CONTACT_REQUIRED = PROOF_OF_CONTACT_SLOTS.length;
/** Hard cap after client compression. Must stay under Vercel’s 4.5 MB body limit. */
export const MAX_PROOF_IMAGE_BYTES = 3.5 * 1024 * 1024;
export const MAX_PROOF_SOURCE_BYTES = 25 * 1024 * 1024;

export type BrainstormProofView = {
  id: string;
  slot: number;
  fileName: string;
  mimeType: string;
  imageUrl: string;
};

export function isProofOfContactSlot(value: number): value is ProofOfContactSlot {
  return PROOF_OF_CONTACT_SLOTS.includes(value as ProofOfContactSlot);
}

export function proofImageUrl(proofId: string) {
  return `/api/brainstorming/proofs/${proofId}/image`;
}

export function serializeProofs(
  proofs: Array<{ id: string; slot: number; fileName: string; mimeType: string }>
): BrainstormProofView[] {
  return [...proofs]
    .sort((a, b) => a.slot - b.slot)
    .map((proof) => ({
      id: proof.id,
      slot: proof.slot,
      fileName: proof.fileName,
      mimeType: proof.mimeType,
      imageUrl: proofImageUrl(proof.id)
    }));
}

export function isGoogleDocUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "docs.google.com" || host === "drive.google.com";
  } catch {
    return false;
  }
}

export function brainstormMaterialsReady(proofCount: number, docUrl: string) {
  return proofCount >= PROOF_OF_CONTACT_REQUIRED && isGoogleDocUrl(docUrl);
}

export function isProofImageFile(file: { type: string; size: number }) {
  return file.type.startsWith("image/") && file.size > 0 && file.size <= MAX_PROOF_IMAGE_BYTES;
}

export function proofJpegFileName(name: string) {
  const base = name.trim().replace(/\.[^/.]+$/, "") || "proof";
  return `${base.slice(0, 170)}.jpg`;
}

export function proofUploadFailureMessage(status: number, bodyText: string) {
  const trimmed = bodyText.trim();
  if (
    status === 413 ||
    /^request entity too large/i.test(trimmed) ||
    trimmed.startsWith("Request En")
  ) {
    return "Image is too large. Use a smaller screenshot or photo.";
  }

  try {
    const parsed = JSON.parse(trimmed) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // platform proxies sometimes return plain text
  }

  if (trimmed && !trimmed.startsWith("{") && trimmed.length <= 180) {
    return trimmed;
  }
  return "Could not upload proof.";
}

type BrainstormVisibilityRow = {
  id: string;
  assignedProducerUserId?: string | null;
  category?: PackageCategory | null;
  members: Array<{ userId: string }>;
};

export function filterBrainstormRowsForViewer<T extends BrainstormVisibilityRow>(
  rows: T[],
  viewer: {
    userId: string;
    platformRole: PlatformRole | null;
    producerCategory: PackageCategory | null;
  }
): T[] {
  const memberRows = rows.filter((row) => row.members.some((member) => member.userId === viewer.userId));
  if (!hasPlatformRole(viewer.platformRole, "ASSOCIATE_PRODUCER")) {
    return memberRows;
  }

  const visible = filterGroupsForViewer(rows, {
    platformRole: viewer.platformRole,
    currentUserId: viewer.userId,
    producerCategory: viewer.producerCategory
  });
  const seen = new Set(visible.map((row) => row.id));
  for (const row of memberRows) {
    if (!seen.has(row.id)) {
      visible.push(row);
    }
  }
  return visible;
}
