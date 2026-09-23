import {
  MAX_PROOF_IMAGE_BYTES,
  MAX_PROOF_SOURCE_BYTES,
  proofJpegFileName
} from "@/src/lib/package-brainstorm";

const MAX_EDGE = 1920;

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error("Could not compress the image."));
      },
      "image/jpeg",
      quality
    );
  });
}

async function decodeImage(file: File) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image."));
      el.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shrink phone photos / long screenshots so the POST stays under Vercel’s 4.5 MB limit. */
export async function compressProofImage(file: File): Promise<File> {
  if (file.size <= 0 || (file.type && !file.type.startsWith("image/"))) {
    throw new Error("Upload a JPG, PNG, or WebP image.");
  }
  if (file.size > MAX_PROOF_SOURCE_BYTES) {
    throw new Error("Image is too large. Use a smaller screenshot or photo.");
  }

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decodeImage(file);
  } catch {
    if (isProofImageFileSafeOriginal(file)) return file;
    throw new Error("Could not read that image. Save it as a JPG or PNG and try again.");
  }

  const width = "width" in source && source.width ? source.width : 0;
  const height = "height" in source && source.height ? source.height : 0;
  if (!width || !height) {
    if ("close" in source) source.close();
    if (isProofImageFileSafeOriginal(file)) return file;
    throw new Error("Could not read that image. Save it as a JPG or PNG and try again.");
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if ("close" in source) source.close();
    throw new Error("Could not compress the image.");
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source) source.close();

  let quality = 0.82;
  let blob = await canvasToJpeg(canvas, quality);
  while (blob.size > MAX_PROOF_IMAGE_BYTES && quality > 0.5) {
    quality = Math.round((quality - 0.12) * 100) / 100;
    blob = await canvasToJpeg(canvas, quality);
  }

  if (blob.size > MAX_PROOF_IMAGE_BYTES) {
    throw new Error("Image is too large. Use a smaller screenshot or photo.");
  }

  return new File([blob], proofJpegFileName(file.name), { type: "image/jpeg" });
}

function isProofImageFileSafeOriginal(file: File) {
  return (
    (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") &&
    file.size <= MAX_PROOF_IMAGE_BYTES
  );
}
