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

// The processor compiles its wasm asynchronously and outputs silence until then. Post "ready"
// (or "error") on its port so voice-graph.ts keeps the raw mic until RNNoise really runs.
const READY_FROM = "this.processor=p(t,{bufferSize:128,maxChannels:e.processorOptions.maxChannels}),this.destroyed&&this.destroy()})()";
const READY_TO =
  "this.processor=p(t,{bufferSize:128,maxChannels:e.processorOptions.maxChannels}),this.port.postMessage(`ready`),this.destroyed&&this.destroy()})().catch(()=>this.port.postMessage(`error`))";

// Upstream listens for "destroy" with addEventListener but never starts the port, so it never
// arrives and a dropped node keeps its RNNoise state. Start the port.
const DESTROY_FROM = "this.port.addEventListener(`message`,e=>{e.data===`destroy`&&this.destroy()})";
const DESTROY_TO = `${DESTROY_FROM},this.port.start()`;

function withReadySignal(source) {
  if (!source.includes(READY_FROM) || !source.includes(DESTROY_FROM)) {
    throw new Error("rnnoiseWorklet.js changed upstream: update the ready-signal patch");
  }
  return source.replace(READY_FROM, READY_TO).replace(DESTROY_FROM, DESTROY_TO);
}

mkdirSync(outDir, { recursive: true });
for (const [from, to] of files) copyFileSync(join(pkgDir, from), join(outDir, to));
const workletPath = join(outDir, "rnnoiseWorklet.js");
writeFileSync(workletPath, withReadySignal(readFileSync(workletPath, "utf8")));
writeFileSync(join(outDir, "VERSION"), `@sapphi-red/web-noise-suppressor ${version}\n`);
process.stdout.write(`Vendored @sapphi-red/web-noise-suppressor ${version} into public/vendor/noise-suppressor\n`);
