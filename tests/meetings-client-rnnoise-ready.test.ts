import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { processorReady } from "@/src/lib/meetings/client/rnnoise-engine";

describe("RNNoise processor readiness", () => {
  it("resolves when the worklet posts ready", async () => {
    const { port1, port2 } = new MessageChannel();
    const ready = processorReady(port1, 1000);
    port2.postMessage("ready");
    await expect(ready).resolves.toBeUndefined();
    port1.close();
  });

  it("rejects when the worklet reports a failed wasm start", async () => {
    const { port1, port2 } = new MessageChannel();
    const ready = processorReady(port1, 1000);
    port2.postMessage("error");
    await expect(ready).rejects.toThrow("failed");
    port1.close();
  });

  it("rejects after the timeout so the raw mic keeps flowing", async () => {
    const { port1 } = new MessageChannel();
    await expect(processorReady(port1, 10)).rejects.toThrow("too long");
    port1.close();
  });

  it("the vendored worklet posts ready/error (re-vendoring keeps the patch)", () => {
    const source = readFileSync(join(process.cwd(), "public/vendor/noise-suppressor/rnnoiseWorklet.js"), "utf8");
    expect(source).toContain("this.port.postMessage(`ready`)");
    expect(source).toContain(".catch(()=>this.port.postMessage(`error`))");
    // Without start() the processor never receives "destroy" and keeps its RNNoise state.
    expect(source).toContain("this.destroy()}),this.port.start()");
  });
});
