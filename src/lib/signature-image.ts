/** Drawn signatures (Settings → Signature) are PNG data URLs: dark ink on a transparent background. */
export const SIGNATURE_DATA_URL_PREFIX = "data:image/png;base64,";
/** Characters of data URL. A trimmed 2x export of a signature is well under this. */
export const SIGNATURE_MAX_LENGTH = 400_000;
/** Pixels. Above the widest pad export (about 1900 px), low enough that three decode cheaply per render. */
const SIGNATURE_MAX_SIDE = 2400;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type SignatureImage = { src: string; width: number; height: number };

/** The certificate has one signature line for each of three executive producers. */
export const CERTIFICATE_SIGNER_COUNT = 3;

export type CertificateSigner = { name: string; signature: SignatureImage | null };

/** A drawn signature with its pixel size from the PNG header, or null if it isn't a usable PNG data URL. */
export function parseSignatureImage(src: string): SignatureImage | null {
  if (!src.startsWith(SIGNATURE_DATA_URL_PREFIX) || src.length > SIGNATURE_MAX_LENGTH) return null;
  const base64 = src.slice(SIGNATURE_DATA_URL_PREFIX.length);
  if (!BASE64.test(base64)) return null;

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 24 || PNG_MAGIC.some((byte, index) => bytes[index] !== byte)) return null;
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return null;

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > SIGNATURE_MAX_SIDE || height > SIGNATURE_MAX_SIDE) return null;
  return { src, width, height };
}

/** The largest size that keeps the signature's shape inside the box. */
export function fitSignature(image: SignatureImage, box: { width: number; height: number }) {
  const scale = Math.min(box.width / image.width, box.height / image.height);
  return { width: Math.round(image.width * scale), height: Math.round(image.height * scale) };
}
