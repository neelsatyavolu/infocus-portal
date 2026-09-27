import { MAX_PHOTO_SIDE, downscaledSize } from "@/src/lib/story-maker";
import type { StoryPhoto } from "./story-templates";

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Reads a photo on this device (it never leaves the browser) and downscales it so exports stay fast.
 * Throws when the browser can't decode it (e.g. HEIC outside Safari).
 */
export async function readStoryPhoto(file: File): Promise<StoryPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("NOT_AN_IMAGE");
  const image = new Image();
  image.src = await readAsDataUrl(file);
  await image.decode();
  const size = downscaledSize(image.naturalWidth, image.naturalHeight, MAX_PHOTO_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("NO_CANVAS");
  context.drawImage(image, 0, 0, size.width, size.height);
  return { src: canvas.toDataURL("image/jpeg", 0.92), x: 50, y: 50, zoom: 100 };
}
