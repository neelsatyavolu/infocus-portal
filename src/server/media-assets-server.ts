import crypto from "node:crypto";

export function createSyntheticImageVideoId() {
  return `img_${crypto.randomUUID().replace(/-/g, "")}`;
}
