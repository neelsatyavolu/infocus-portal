# Package media on InFocus Drive (NAS)

Store package cycle videos on the school NAS (via Cloudflare Tunnel) instead of Bunny Stream.

**Status (2026-07-24):** Production uses `MEDIA_STORAGE_PROVIDER=NAS`. Drive service API is live. Layout is **flat files** under the cycle folder (no per-title / `v1/` wrappers).

**Desktop access to the same files:** Finder SMB `smb://<drive-lan-ip>` (NAS password). Off campus: Cloudflare WARP (per-email allowlist). See Drive repo `docs/FINDER-NETWORK-DRIVE.md` and `docs/REMOTE-SMB-WARP.md` (`~/infocus-drive-browser`).

---

## Folder layout on the NAS

Share root: `/volumeN/<share>` → Drive app path `Package Cycles/...` (producer Packages library) or `Package Storage/...` (student cycle-stage uploads).

```
Package Storage/
  Cycle {n}/
    {group name}/                    ← topic, or member last names
      A-roll B-roll/{file}.mp4
      Initial Cut/{file}.mp4
      Final Cut/{file}.mp4
  Publishing Queue/
    {title}/{file}.mp4               ← custom packages added from the queue

Package Cycles/
  {Project name}/                    ← producer Packages library
    {Folder name}/                   ← site folder, e.g. Final Cut
      {original-filename}.mp4
      {original-filename}.poster.jpg
    loose-file.mp4
```

**Example**

```
Package Cycles/Package Cycle 1/Final Cut/20260114_A741379.MP4
Package Cycles/Package Cycle 1/Final Cut/20260114_A741379.poster.jpg
```

**Not used anymore** (old nested layout, cleaned up on NAS):

```
…/Final Cut/{title}/v1/{file}.mp4   ← do not create
```

| Rule | Behavior |
|------|----------|
| Sanitization | `\/:*?"<>|` → `-`; trim; max ~120 chars per segment |
| Version 2+ of same base name | `{name}-v2.mp4` (avoids overwrite) |
| No site folder | File sits directly under the project/cycle folder |
| Poster | `{basename}.poster.jpg` next to the video |

Code: `src/lib/nas-storage.ts` → `buildNasMediaPath`, `nasPosterPath`.

---

## Architecture

```
Browser (infocuspaly.com)
  │ POST /api/media/init-upload
  ▼
Packages API (Vercel)
  │ service bearer → ensure-dir + mint-token
  ▼
drive.infocuspaly.com /api/service/*
  │
  ▼
NAS: /volumeN/<share>/Package Cycles/… or Package Storage/…
```

1. **Init** — packages builds path, mints short-lived path token on Drive.  
2. **Upload** — browser sends **directly to Drive** (not through Vercel). Files under 8 MiB are one POST; larger files go in retried 16 MiB chunks (`/api/service/upload/init|chunk|complete`) so the tunnel can drop a piece without killing the file.
3. **CORS** — Drive allows `https://infocuspaly.com` and `*.vercel.app`.  
4. **Complete** — `POST .../complete-nas-upload` → status `READY` (no Bunny processing).  
5. **Poster** — browser captures a frame → `POST .../poster` → Drive service upload.  
6. **Playback** — signed `GET /api/service/file?path=&token=` (progressive MP4).

### Drive service endpoints

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/service/ensure-dir` | Bearer `PACKAGES_SERVICE_TOKEN` |
| POST | `/api/service/mint-token` | Bearer |
| POST | `/api/service/upload` | Bearer **or** form `token` |
| GET | `/api/service/file` | Bearer **or** query `token` |
| DELETE | `/api/service/file` | Bearer |

Paths **must** stay under `Package Cycles/` (producer library) or `Package Storage/` (student cycle-stage uploads).

### Auth / identity on NAS

| Env (drive) | Purpose |
|-------------|---------|
| `PACKAGES_SERVICE_TOKEN` | Shared secret (= packages `DRIVE_SERVICE_TOKEN`) |
| `PACKAGES_SERVICE_USER` | NAS Linux user for writes (a real NAS account, uid ≥ 1000) |
| `PACKAGES_ROOT` | `Package Cycles` |

Compose must pass these into the container (`env_file: .env` + explicit `environment` keys). Files are owned by the service user.

---

## Packages configuration

### Local `.env` / `.env.local`

```env
MEDIA_STORAGE_PROVIDER=NAS
DRIVE_BASE_URL=https://drive.infocuspaly.com
DRIVE_SERVICE_TOKEN=<same-as-drive-PACKAGES_SERVICE_TOKEN>
NEXT_PUBLIC_MEDIA_STORAGE_HINT=InFocus Drive (Package Cycles)
```

### Vercel

Set for **Production** and **Development** (Preview optional — CLI may ask “Git branch?”; leave empty for all previews):

- `MEDIA_STORAGE_PROVIDER=NAS`
- `DRIVE_BASE_URL=https://drive.infocuspaly.com`
- `DRIVE_SERVICE_TOKEN=…`
- `NEXT_PUBLIC_MEDIA_STORAGE_HINT=InFocus Drive (Package Cycles)`

Redeploy after env changes: `vercel deploy --prod --yes`.

### Database

`MediaVersion` fields:

| Column | Meaning |
|--------|---------|
| `storageProvider` | `BUNNY` (default) or `NAS` |
| `nasPath` | Relative path under Drive root |
| `bunnyVideoId` | Bunny GUID, or synthetic `nas_{hex}` for NAS rows |

Migration: `prisma/migrations/20260724_media_nas_storage/` (also applied via `prisma db push` in setup).

Existing Bunny rows stay `BUNNY` and keep playing via Bunny.

---

## Client upload entry points (all NAS-aware)

| Component | Role |
|-----------|------|
| `components/project-media-tiles.tsx` | Main project grid upload + version re-upload |
| `components/simple-video-upload.tsx` | Simple upload control |
| `components/upload-panel.tsx` | Panel upload |
| `src/lib/nas-upload-client.ts` | XHR multipart to Drive |
| `src/lib/video-thumbnail-client.ts` | Capture frame → poster API |

Bunny path still uses `tus-js-client` when `provider !== "NAS"`.

---

## Thumbnails

| Backend | Source |
|---------|--------|
| Bunny | `…/thumbnail.jpg` from pull zone (via playback URL rewrite) |
| NAS | `{video}.poster.jpg` beside the file; captured in-browser after upload |

If poster is missing (older upload, capture failed), tile stays black until re-upload or poster is generated later.

Server: `resolveThumbnailUrl` / `resolvePlaybackUrl` in `src/lib/media-playback.ts`.

---

## Bunny vs NAS (product)

| | Bunny Stream | NAS + tunnel |
|--|--------------|--------------|
| New uploads (when `MEDIA_STORAGE_PROVIDER=NAS`) | No | Yes |
| Encoding / “processing” | Yes | No — READY when upload finishes |
| Adaptive HLS | Yes | Progressive MP4 |
| Global CDN | Yes | Cloudflare Tunnel origin |
| Monthly $ | Storage + egress | Already-owned disk |
| Appears in Drive UI | No | Yes under Package Cycles |

**Bunny is not required to process NAS uploads.** Old Bunny library can remain for legacy rows until migrated.

---

## Ops checklist (already done once)

1. ✅ Drive `.env` service token + `PACKAGES_SERVICE_USER=<service-user>`  
2. ✅ docker-compose passes `PACKAGES_*` into container  
3. ✅ Service API smoke-tested (ensure-dir, mint, upload)  
4. ✅ Packages prod env + DB schema  
5. ✅ CORS on Drive for `infocuspaly.com` / `*.vercel.app`  
6. ✅ Flattened nested test folders on NAS; fixed `nasPath` in DB  
7. ⚠️ Preview env vars may still need “all branches” in Vercel UI if missing  

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Upload fails in browser, curl works | CORS — ensure Drive CORS middleware deployed |
| Upload still goes to Bunny | `MEDIA_STORAGE_PROVIDER` not `NAS` on that Vercel env; redeploy |
| Black tile, video plays | No `*.poster.jpg` yet — re-upload or generate poster |
| Nested `title/v1/` folders | Old path builder — deploy flat `buildNasMediaPath`; clean NAS manually |
| 401 on service API | Token mismatch between Drive and packages |
| 503 service user | `PACKAGES_SERVICE_USER` missing or not a real NAS account |
| Vercel CLI `? Git branch?` | Preview env only; leave empty or set in dashboard |

### Useful checks

```bash
# Drive service (from laptop)
curl -sS -X POST https://drive.infocuspaly.com/api/service/ensure-dir \
  -H "Authorization: Bearer $DRIVE_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"Package Cycles"}'

# NAS tree
ssh … 'find "/volumeN/<share>/Package Cycles" -print'

# Vercel
vercel env ls | rg MEDIA_STORAGE|DRIVE_
vercel logs --environment production --since 1h --expand
```

---

## Related code map

| Area | Path |
|------|------|
| Drive service routes | `infocus-drive-browser/app/main.py` `/api/service/*` |
| Drive service auth | `infocus-drive-browser/app/service_auth.py` |
| Drive config | `PACKAGES_*` in `config.py` + compose |
| Packages NAS client | `src/lib/nas-storage.ts` |
| Browser upload | `src/lib/nas-upload-client.ts` |
| Playback / thumbs | `src/lib/media-playback.ts` |
| Init upload | `app/api/media/init-upload/route.ts` |
| Complete | `…/complete-nas-upload/route.ts` |
| Poster | `…/poster/route.ts` |
| Drive handoff docs | `~/infocus-drive-browser/AGENTS.md`, `docs/SYSTEM.md` |

---

## Still open (not automated)

- Bulk migrate historical Bunny assets → NAS  
- Backfill posters for existing NAS files without `*.poster.jpg`  
- Adaptive HLS on NAS (ffmpeg pipeline) if needed later  
