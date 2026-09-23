import { describe, expect, it } from "vitest";

import {
  brainstormMaterialsReady,
  filterBrainstormRowsForViewer,
  isGoogleDocUrl,
  isProofImageFile,
  isProofOfContactSlot,
  MAX_PROOF_IMAGE_BYTES,
  proofJpegFileName,
  proofUploadFailureMessage,
  PROOF_OF_CONTACT_REQUIRED,
  serializeProofs
} from "@/src/lib/package-brainstorm";

describe("package brainstorm helpers", () => {
  it("accepts https Google Docs and Drive links only", () => {
    expect(isGoogleDocUrl("https://docs.google.com/document/d/abc/edit")).toBe(true);
    expect(isGoogleDocUrl("https://drive.google.com/file/d/abc/view")).toBe(true);
    expect(isGoogleDocUrl("http://docs.google.com/document/d/abc/edit")).toBe(false);
    expect(isGoogleDocUrl("https://example.com/doc")).toBe(false);
    expect(isGoogleDocUrl("")).toBe(false);
    expect(isGoogleDocUrl("not a url")).toBe(false);
  });

  it("is ready only with three proofs and a Google Doc", () => {
    expect(PROOF_OF_CONTACT_REQUIRED).toBe(3);
    expect(brainstormMaterialsReady(3, "https://docs.google.com/document/d/abc/edit")).toBe(true);
    expect(brainstormMaterialsReady(2, "https://docs.google.com/document/d/abc/edit")).toBe(false);
    expect(brainstormMaterialsReady(3, "")).toBe(false);
  });

  it("validates proof slots and image files", () => {
    expect(isProofOfContactSlot(1)).toBe(true);
    expect(isProofOfContactSlot(3)).toBe(true);
    expect(isProofOfContactSlot(0)).toBe(false);
    expect(isProofOfContactSlot(4)).toBe(false);
    expect(isProofImageFile({ type: "image/png", size: 1200 })).toBe(true);
    expect(isProofImageFile({ type: "application/pdf", size: 1200 })).toBe(false);
    expect(isProofImageFile({ type: "image/jpeg", size: 0 })).toBe(false);
    expect(isProofImageFile({ type: "image/jpeg", size: MAX_PROOF_IMAGE_BYTES + 1 })).toBe(false);
  });

  it("rewrites proof filenames to jpg", () => {
    expect(proofJpegFileName("IMG_1234.HEIC")).toBe("IMG_1234.jpg");
    expect(proofJpegFileName("proof-1.png")).toBe("proof-1.jpg");
    expect(proofJpegFileName("")).toBe("proof.jpg");
  });

  it("maps proxy 413 text into a readable upload error", () => {
    expect(proofUploadFailureMessage(413, "Request Entity Too Large")).toBe(
      "Image is too large. Use a smaller screenshot or photo."
    );
    expect(proofUploadFailureMessage(400, '{"error":{"message":"Upload a JPG, PNG, or WebP image."}}')).toBe(
      "Upload a JPG, PNG, or WebP image."
    );
  });

  it("serializes proofs into authenticated image URLs", () => {
    expect(
      serializeProofs([
        { id: "b", slot: 2, fileName: "two.png", mimeType: "image/png" },
        { id: "a", slot: 1, fileName: "one.jpg", mimeType: "image/jpeg" }
      ])
    ).toEqual([
      {
        id: "a",
        slot: 1,
        fileName: "one.jpg",
        mimeType: "image/jpeg",
        imageUrl: "/api/brainstorming/proofs/a/image"
      },
      {
        id: "b",
        slot: 2,
        fileName: "two.png",
        mimeType: "image/png",
        imageUrl: "/api/brainstorming/proofs/b/image"
      }
    ]);
  });
});

const brainstormRows = [
  {
    id: "assigned-ep",
    assignedProducerUserId: "ap-1",
    category: "NEWS" as const,
    members: [{ userId: "student-1" }]
  },
  {
    id: "other-ap",
    assignedProducerUserId: "ap-2",
    category: "FEATURE" as const,
    members: [{ userId: "student-2" }]
  },
  {
    id: "student-also-on",
    assignedProducerUserId: "ap-2",
    category: "FEATURE" as const,
    members: [{ userId: "ap-1" }]
  }
];

describe("filterBrainstormRowsForViewer", () => {
  it("hides packages from students who are not members", () => {
    expect(
      filterBrainstormRowsForViewer(brainstormRows, {
        userId: "student-3",
        platformRole: null,
        producerCategory: null
      }).map((row) => row.id)
    ).toEqual([]);
  });

  it("lets an assigned executive see packages they are not a member of", () => {
    expect(
      filterBrainstormRowsForViewer(brainstormRows, {
        userId: "ep-1",
        platformRole: "SUPER_ADMIN",
        producerCategory: null
      }).map((row) => row.id)
    ).toEqual(["assigned-ep", "other-ap", "student-also-on"]);
  });

  it("lets associates see assigned packages plus any they are a member of", () => {
    expect(
      filterBrainstormRowsForViewer(brainstormRows, {
        userId: "ap-1",
        platformRole: "ASSOCIATE_PRODUCER",
        producerCategory: "NEWS"
      }).map((row) => row.id)
    ).toEqual(["assigned-ep", "student-also-on"]);
  });
});
