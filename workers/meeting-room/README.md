# infocus-meeting-room

Cloudflare Worker for InFocus Meetings. It runs one Durable Object (`MeetingRoom`) per meeting and does three jobs:

- **Room socket** (`GET /rooms/:id/ws?token=…`): presence, lobby, raised hands, reactions, end-to-end-encrypted chat fan-out (the room only sees ciphertext), and host moderation. It uses the WebSocket Hibernation API, so idle rooms cost nothing.
- **Media proxy** (`/rooms/:id/partytracks/*?token=…`): forwards [partytracks](https://github.com/cloudflare/partykit/tree/main/packages/partytracks) calls to the Cloudflare Realtime SFU and mints TURN credentials. Media frames are encrypted on the device, so the SFU relays only ciphertext.
- **Portal events** (`POST /internal/rooms/:id/events`): the Portal admits, denies, removes, rekeys, changes settings and ends meetings.

The room also reports back to the Portal at `POST <PORTAL_BASE_URL>/api/service/meetings/<id>/room` with `started`, `knock` and `empty`.

Design: `docs/superpowers/specs/2026-10-03-meetings-design.md`. Shared contracts: `src/lib/meetings/protocol.ts` and `src/lib/meetings/room-token.ts` (imported by relative path).

## Layout

| File | Role |
|---|---|
| `src/index.ts` | Router, Origin checks, ticket checks, Portal event endpoint |
| `src/partytracks-proxy.ts` | SFU proxy with session-ownership checks |
| `src/meeting-room.ts` | The Durable Object (sockets, alarm, RPC) |
| `src/room-state.ts`, `src/room-messages.ts`, `src/media-auth.ts`, `src/rate-limit.ts`, `src/validation.ts` | Pure logic (unit tested) |

## Configuration

`vars` in `wrangler.jsonc` hold placeholders only. Set the real values at deploy time, in the dashboard (Worker → Settings → Variables) or with `--var`:

| Var | Meaning |
|---|---|
| `PORTAL_BASE_URL` | Portal origin for reports, no trailing slash |
| `ALLOWED_ORIGINS` | Comma-separated browser origins allowed to open sockets and call the media proxy (the Portal origin) |

Secrets are never committed:

| Secret | Where it comes from |
|---|---|
| `MEETING_ROOM_SECRET` | One random value of 32+ bytes, shared with the Portal (`openssl rand -base64 48`) |
| `REALTIME_APP_ID`, `REALTIME_APP_TOKEN` | Realtime SFU app: [dash.cloudflare.com/?to=/:account/realtime/sfu/create](https://dash.cloudflare.com/?to=/:account/realtime/sfu/create) |
| `TURN_KEY_ID`, `TURN_KEY_TOKEN` | TURN key: [dash.cloudflare.com/?to=/:account/realtime/turn/create](https://dash.cloudflare.com/?to=/:account/realtime/turn/create). Optional; without it the proxy hands out Cloudflare STUN only. |

```sh
cd workers/meeting-room
npx wrangler secret put MEETING_ROOM_SECRET
npx wrangler secret put REALTIME_APP_ID
npx wrangler secret put REALTIME_APP_TOKEN
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_TOKEN
```

For `wrangler dev`, put the same names in `.dev.vars` (git-ignored).

Observability stays on. Invocation logs are off and query strings are redacted, because tickets travel in `?token=`.

## Develop and deploy

```sh
cd workers/meeting-room
npm install
npm run typecheck
npm test
npx wrangler deploy --dry-run --outdir /tmp/meeting-room-dry   # bundle check
npx wrangler deploy                                            # needs the user's go-ahead
```

The Durable Object uses a `new_sqlite_classes` migration, which works on the Workers free plan.

**Hostname:** the Worker is served by a zone **route** (`<host>/*`, added in the dashboard under Worker → Settings → Domains & Routes) plus a proxied `AAAA 100::` DNS record for that host. Set the Portal's `MEETING_ROOM_URL` to `https://<that host>`. Keep the real hostname out of this repo.

Do not use a Worker **Custom Domain** (or `custom_domain: true`). A Custom Domain issues its own certificate, and Cloudflare then serves it for the zone apex too. That certificate doesn't cover the other subdomains. Browsers reuse the apex connection for those subdomains, and Cloudflare answers the mismatched requests with an empty 403. That's what intermittently blocked InFocus Drive in October 2026.

## Client notes

- **Tickets:** every socket and proxy call carries the Portal room ticket as `?token=`. The proxy strips it before forwarding to Cloudflare.
- **partytracks prefix:** `new PartyTracks({ prefix: MEETING_ROOM_URL + "/rooms/<id>/partytracks", apiExtraParams: "token=<ticket>", iceServers })`.
- **ICE servers:** partytracks does not append `apiExtraParams` to `generate-ice-servers`. So fetch `<prefix>/generate-ice-servers?token=<ticket>` yourself and pass the result's `iceServers` to `PartyTracks`.
- **Order:** open the room socket and wait for `welcome` before starting PartyTracks. The proxy only serves uids that have an open room socket. When a uid's last socket closes, its media sessions are forgotten, so after a socket reconnect, create a fresh PartyTracks session.
- **Limits:** at most 4 live media sessions per uid (429 beyond that) and 60 proxy calls per 10 s per uid. Each socket can send 30 messages per 5 s, chat is limited to 10 per 10 s and reactions to 20 per 10 s. A room holds at most 100 participants and 100 waiting.
- **Bodies:** proxy JSON bodies are capped at 256 KB and rebuilt from the fields partytracks sends before they reach Cloudflare.
- **Proxy access:** only `adm: true` tickets can use the proxy. A Scribe ticket can pull but cannot push (`location: "local"`). Pulls must name sessions created in the same meeting.
- **Socket close codes:** `4003` removed, `4004` denied, `4010` ended, `4029` room full. Send `{"t":"ping"}` exactly; the room auto-replies `{"t":"pong"}` without waking.
