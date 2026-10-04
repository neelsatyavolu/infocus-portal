// Vendors MediaPipe Tasks Vision (Apache-2.0) and the selfie segmentation model into
// public/vendor/mediapipe/ so background blur loads same-origin (no CDN during calls).
//
// Usage:
//   npm run vendor:mediapipe                      (uses node_modules/@mediapipe/tasks-vision; runs as prebuild)
//   node scripts/vendor-mediapipe.mjs --refresh-model   (also re-download the segmentation model)
//   node scripts/vendor-mediapipe.mjs --from <dir> (an unpacked `npm pack @mediapipe/tasks-vision`)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fromFlag = process.argv.indexOf("--from");
const pkgDir =
  fromFlag > -1 ? resolve(process.argv[fromFlag + 1]) : join(root, "node_modules/@mediapipe/tasks-vision");
const outDir = join(root, "public/vendor/mediapipe");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

if (!existsSync(join(pkgDir, "package.json"))) {
  process.stderr.write(`@mediapipe/tasks-vision not found at ${pkgDir}\n`);
  process.exit(1);
}
const { version, license } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

// SIMD build plus the no-SIMD fallback; forVisionTasks() picks one at runtime.
const files = [
  ["vision_bundle.mjs", "vision_bundle.mjs"],
  ["wasm/vision_wasm_internal.js", "wasm/vision_wasm_internal.js"],
  ["wasm/vision_wasm_internal.wasm", "wasm/vision_wasm_internal.wasm"],
  ["wasm/vision_wasm_nosimd_internal.js", "wasm/vision_wasm_nosimd_internal.js"],
  ["wasm/vision_wasm_nosimd_internal.wasm", "wasm/vision_wasm_nosimd_internal.wasm"]
];

mkdirSync(join(outDir, "wasm"), { recursive: true });
for (const [from, to] of files) copyFileSync(join(pkgDir, from), join(outDir, to));

// The model is committed; only fetch it when missing or asked to (--refresh-model), so builds stay offline.
const modelPath = join(outDir, "selfie_segmenter.tflite");
if (!existsSync(modelPath) || process.argv.includes("--refresh-model")) {
  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    process.stderr.write(`Model download failed: ${response.status}\n`);
    process.exit(1);
  }
  writeFileSync(join(outDir, "selfie_segmenter.tflite"), Buffer.from(await response.arrayBuffer()));

  writeFileSync(
    join(outDir, "VERSION"),
    `@mediapipe/tasks-vision ${version} (${license})\nselfie_segmenter.tflite from ${MODEL_URL}\nvendored ${new Date().toISOString().slice(0, 10)}\n`
  );
}

process.stdout.write(`Vendored @mediapipe/tasks-vision ${version} and the selfie segmenter into public/vendor/mediapipe\n`);
