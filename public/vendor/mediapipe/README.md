# MediaPipe Tasks Vision (background blur for Meetings)

- `vision_bundle.mjs` and `wasm/` come from [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) (Apache-2.0, Google). Only the SIMD and no-SIMD wasm builds are kept.
- `selfie_segmenter.tflite` is Google's MediaPipe Selfie Segmentation model (float16), from the MediaPipe model storage. See the MediaPipe Image Segmenter model card for its terms.
- The exact versions and the source URL are in `VERSION`.

Meetings load these files same-origin, and only when background blur is on. Video is processed on the device; nothing is sent anywhere for this.

To update: `node scripts/vendor-mediapipe.mjs --from <unpacked npm pack @mediapipe/tasks-vision>` (or install the package and run the script without `--from`).
