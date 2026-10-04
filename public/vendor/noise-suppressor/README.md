# RNNoise (voice isolation for Meetings)

Copied from [`@sapphi-red/web-noise-suppressor`](https://github.com/sapphi-red/web-noise-suppressor) (MIT; RNNoise by Xiph.Org, BSD). The exact version is in `VERSION`.

Meetings load these files same-origin, and only when voice isolation is on. Audio is processed on the device; nothing is sent anywhere for this.

To update: bump the package, then run `npm run vendor:noise-suppressor`.
