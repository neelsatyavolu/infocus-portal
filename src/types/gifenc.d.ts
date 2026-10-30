/** The parts of gifenc (no bundled types) that the birthday GIF uses. */
declare module "gifenc" {
  export type Palette = number[][];
  export type GifFrameOptions = { palette?: Palette; delay?: number; repeat?: number };
  export type GifEncoder = {
    writeFrame(index: Uint8Array, width: number, height: number, options?: GifFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): GifEncoder;
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): Palette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette): Uint8Array;
}
