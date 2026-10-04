// Copies the RNNoise AudioWorklet and wasm from @sapphi-red/web-noise-suppressor into
// public/vendor/noise-suppressor/ so meetings load them same-origin.
// Run after upgrading the package: `npm run vendor:noise-suppressor`.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules/@sapphi-red/web-noise-suppressor");
const outDir = join(root, "public/vendor/noise-suppressor");
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

const files = [
  ["dist/rnnoise/workletProcessor.js", "rnnoiseWorklet.js"],
  ["dist/rnnoise.wasm", "rnnoise.wasm"],
  ["dist/rnnoise_simd.wasm", "rnnoise_simd.wasm"],
  ["LICENSE", "LICENSE"]
];

mkdirSync(outDir, { recursive: true });
for (const [from, to] of files) copyFileSync(join(pkgDir, from), join(outDir, to));
writeFileSync(join(outDir, "VERSION"), `@sapphi-red/web-noise-suppressor ${version}\n`);
process.stdout.write(`Vendored @sapphi-red/web-noise-suppressor ${version} into public/vendor/noise-suppressor\n`);
