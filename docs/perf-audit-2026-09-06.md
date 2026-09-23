# Performance audit — 2026-09-06

Static review of the Hub (Next 15 App Router on Vercel, Prisma/Postgres). No browser
profiling was done. Findings are ranked by expected impact on real users.

## Status (2026-09-06)

Fixed the same day:
- Finding 1: `getRealSessionUser`, `getSessionUser`, `syncUserProfile`,
  `getPlatformRoleForEmail`, and `isEmailAllowedToUsePlatform` are wrapped in React
  `cache()` (request-scoped memo). The layout runs its two role lookups in parallel and
  skips the second one unless View as is active. Route handlers do not get the memo
  (no render pass), so the API chain still runs once per call.
- Finding 2: unread counts are one grouped `count` query per request instead of
  loading every message. Badge polling pauses while the tab is hidden.
- Finding 3: Messages panel polling pauses while the tab is hidden. Intervals unchanged.

Not done: `ensurePackageProgressDefaults` on the read path, Slack sync on mount,
upload refresh loop, lazy-loading the assistant panel, `User.email` index, dependency
cleanup.

## 1. Every page runs the same auth queries 3–4 times (server TTFB) — HIGH

Nothing in the request path is memoized with React `cache()`, so each helper re-runs its
database calls whenever it is called again in the same request.

Typical `/groups` request, in order:

| Where | Call | DB round trips |
|---|---|---|
| `app/(app)/layout.tsx` | `requireUserId()` → `getSessionUser()` | 0–1 (View as) |
| layout | `syncUserProfile()` → `getSessionUser()` again, `user.findUnique`, `isEmailAllowedToUsePlatform` (`user.findFirst` by email) | 2–3 |
| layout | `getPlatformRoleForEmail(user.email)` | 1 |
| layout | `getPlatformRoleForEmail(realSession.email)` — runs even when not viewing as | 1 |
| `groups/page.tsx` | `getCurrentAppUser()` → `getSessionUser()` + `getPlatformRoleForEmail` again | 1 |
| page | `loadPackageProgressData()` → `getProgramSettings`, `packageCycle.findMany`, `packageProgressRow` distinct scan (write-guard on every read) | 3 sequential |
| page | `platformRoleAssignment.findUnique` again | 1 |

That is roughly 8–10 mostly sequential round trips before the first package row is
fetched. On Vercel with a remote Postgres each hop is 5–40 ms, so this alone can add
100–400 ms to TTFB on every navigation. API routes repeat the same chain
(`requireUserId` + `syncUserProfile` + `getPlatformAccess`).

Fixes (no schema change):
- Wrap `getRealSessionUser`, `getSessionUser`, `syncUserProfile`, `getPlatformRoleForEmail`,
  and `isEmailAllowedToUsePlatform` in `cache()` from `react` so a request pays once.
- In the layout, skip the second role lookup when `realSession.userId === userId`, and
  run the two role lookups in `Promise.all`.
- `syncUserProfile` already fetched the user row; `isEmailAllowedToUsePlatform` should
  short-circuit when that row exists instead of doing a second `findFirst` by email.
- Move `ensurePackageProgressDefaults()` (creates missing cycles/rows) out of the read
  path. Run it when program settings are saved, or guard it with a process-level
  “already ensured for these cycle numbers” flag.

## 2. Hub chat unread badge: heavy query, polled by every open tab — HIGH

`components/assistant-chat.tsx` calls `GET /api/hub-chat/unread` every 15 s for every
signed-in tab, from first paint, whether or not the panel was ever opened.
`unreadHubChatCount` in `src/server/hub-chat.ts` loads **every message of every chat the
user belongs to** (`chat.messages` with no `take`) just to count. The route also runs the
full auth chain from finding 1.

With a class of ~40 people that is ~160 function invocations per minute that each scan
whole chat histories, growing linearly with message volume.

Fixes:
- Count in SQL: one `hubChatMessage.count` (or `groupBy chatId`) with
  `createdAt > lastReadAt AND authorId != userId` per membership, or a single
  `$queryRaw` join. Same for `listHubInbox`, which re-scans all non-own messages for
  unread counts.
- Pause polling when `document.visibilityState !== "visible"`.
- Consider 30–60 s for the badge and only fast-poll while the Messages panel is open.

## 3. Messages panel polls at 4–5 s — MEDIUM/HIGH

`components/hub-messages.tsx`: inbox every 5 s, open thread every 4 s. `listHubInbox`
does `viewerFor` + `loadFilledGroups` (all package rows with members) + memberships +
the unread scan on every tick. Add visibility pause, and cheapen the tick: return
`updatedAt`/`lastMessageId` and only refetch bodies when it changed.

## 4. `POST /api/slack/sync` on every app-shell mount — MEDIUM

`components/app-shell.tsx` fires this on every full page load. The server has a cooldown,
but each call still costs a function invocation plus the auth chain. Move it to a cron
(Inngest already runs several) or only fire it from the pages that show Slack data.

## 5. `router.refresh()` every 4 s while uploads process — MEDIUM

`components/project-media-tiles.tsx` refreshes the entire server tree (layout auth chain +
project queries) every 4 s while any version is UPLOADING/PROCESSING. Poll a small status
endpoint for the pending version ids instead, and refresh once when they finish.

## 6. Client JS: the authenticated layout ships ~615 KB — MEDIUM

From `.next/app-build-manifest.json` (uncompressed):

| Route | JS |
|---|---|
| `/(app)/layout` (baseline for every page) | 615 KB |
| `/projects/[projectId]` | 638 KB |
| `/groups/[rowId]/[stage]`, a-roll, initial-cut, final-cut | 550–560 KB |

`AppShell` statically imports `AssistantChat` (955 lines) which imports `HubMessages`,
plus dialogs and the View-as menu. There is no `next/dynamic` anywhere in the app.
`hls.js` is already lazy (good).

Fixes:
- `next/dynamic` the assistant/messages panel and `ViewAsMenu` so they load on first open.
- Add `@next/bundle-analyzer` once to identify the two 169 KB shared chunks
  (`4bd1b696`, `1255`) that every page loads.
- Remove `@clerk/nextjs` (unused, per `CLAUDE.md`). Swap `googleapis` (whole-suite
  package, slow cold starts) for the scoped `@googleapis/docs` / `@googleapis/sheets`
  packages used by `src/lib/google-docs-sync.ts`, `submitted-announcements.ts`,
  `college-visits-sheet.ts`.

## 7. `User.email` has no index — MEDIUM (schema change, ask first)

`prisma.user.findFirst({ where: { email } })` runs on every request via
`isEmailAllowedToUsePlatform`, and in hub-chat, auth provisioning, and the assistant.
The table is small today, so this is cheap now, but it is a sequential scan on the hottest
path. Add `@@index([email])` to `User` in `prisma/schema.prisma`.

## 8. Sequential awaits in server pages — LOW/MEDIUM

- `app/(app)/dashboard/page.tsx`: `getCurrentAppUser` → `getDashboardData` → panels.
  `getDashboardData` does not depend on the panels; start both after the user resolves.
- `app/(app)/groups/page.tsx`: three sequential awaits that could be two.
- `src/server/package-progress-data.ts`: the “previous cycle rows” query waits for the
  main `Promise.all` even though it only needs `activeCycleNumber`.

## 9. Smaller items — LOW

- No `Cache-Control` on any GET API except two image routes. User-scoped data should
  stay `private`, but static-ish payloads (school calendar days, scenic images, program
  settings) could carry `private, max-age=60` or `s-maxage` where not user-specific.
- `app/(app)/loading.tsx` exists, but the layout awaits the whole auth chain before the
  shell renders, so the skeleton appears late. Finding 1 fixes most of this.
- Prisma uses the default pool with no `connection_limit`. Fine on Fluid Compute if
  `DATABASE_URL` is the pooled URL (schema has `directUrl`, which suggests it is). Verify.
- `<img>` for signed thumbnails is correct (signed URLs bypass `next/image`). The
  master-calendar scenic image already uses `loading="lazy"`.

## Suggested order

1. `cache()` the auth helpers and drop the duplicate role lookup (finding 1). One file
   each in `src/lib/auth.ts` and `src/lib/platform-admin.ts`; no behavior change.
2. SQL count for unread + visibility-aware polling (findings 2–3).
3. Lazy-load the assistant panel (finding 6).
4. Move `ensurePackageProgressDefaults` off the read path and add the email index.
5. Bundle analyzer pass and dependency cleanup.
