# Subdomains

Same Next.js app, host-based routing in `middleware.ts`. The Portal answers on two domains (`PORTAL_DOMAINS` in `src/lib/hosts.ts`): **infocusportal.com**, the canonical one, and **infocuspaly.com**, the original.

| Host | Surface | Home rewrite |
|------|---------|--------------|
| `infocusportal.com` | main | packages dashboard |
| `grades.infocusportal.com` | grades | `/grades` dashboard |
| `teleprompter.infocusportal.com` | teleprompter | `/teleprompter` |
| `equipment.infocusportal.com` | equipment | `/equipment` |
| `meet.infocusportal.com` | meet | `/meetings` (also `/producers` → `/meet/producers`, `/<id>` → `/meet/<id>`) |
| `drive.infocusportal.com` | separate app | InFocus Drive (other repo, Cloudflare Tunnel); `drive.infocuspaly.com` still reaches it and moves browsers here |

Each of those Portal hosts also exists on infocuspaly.com (`meet.infocuspaly.com`, …).

## The two domains

`APP_BASE_URL` decides which domain is canonical (`canonicalPortalDomain()`; in the browser, `NEXT_PUBLIC_APP_URL`). Links, emails and Slack posts use it.

- **Browsers** on the other domain get a 308 to the same page on the canonical one (`legacyPortalRedirect`). Only `GET`/`HEAD` pages move: API calls, `/_next`, `/.well-known` and `/meet-scribe` answer on both domains. Drive's notes taker opens `/meet-scribe` on the origin Drive pins (its `PORTAL_BASE_URL`, now infocusportal.com).
- **Not moved:** the InFocus iPhone app (`?app=1`, its embedded cookie or `InFocusiOSApp/` user agent), the InFocus Mac app (`InFocusMacApp/`), and kiosks that hold the teleprompter kiosk or equipment station cookie. The apps already installed only treat infocuspaly.com as the Portal; anything else opens in Safari.
- **Links on the old domain:** pages served on infocuspaly.com move a clicked link to the canonical domain onto infocuspaly.com (`PortalDomainLinks`, mounted in `app/layout.tsx`), so the apps keep the page in the app.
- **App notifications** (APNs, iPhone and Mac) rewrite Portal links to infocuspaly.com (`toInstalledAppUrl` in `src/lib/native-push.ts`), so the installed apps open them in the app.
- **Equipment passkeys** keep the RP ID `infocuspaly.com` on both domains. `https://infocuspaly.com/.well-known/webauthn` (answered in `worker.ts`) lists the infocusportal.com origins, so Safari and Chrome let them use those passkeys (WebAuthn related origins). Firefox doesn't support this yet.

To switch the canonical domain, set `APP_BASE_URL` and `NEXT_PUBLIC_APP_URL` (Worker secrets and the deploy workflow's repository variables) and redeploy. Setting them back reverses it.

## Shared sessions

Session cookie `infocus_session` gets the request's domain (`Domain=.infocusportal.com` or `Domain=.infocuspaly.com`) in production, so one Google sign-in works across grades/teleprompter/equipment/meet/main on that domain. The two domains don't share a sign-in.

Google sign-in returns to the main host of the domain it started on (`https://<domain>/api/auth/google/callback`), so both callbacks are registered on the Google OAuth client. After login, `returnTo` can send users back to a subdomain path; absolute `returnTo` URLs are accepted only for `https://` on a Portal domain or its subdomain (`isTrustedReturnUrl` in `src/lib/auth.ts`). Sign-in from the meet host goes to the same domain's main host with `returnTo=https://meet.<domain>/…`.

## Hosting / DNS

The Portal is the Cloudflare Worker `infocus-portal` (see AGENTS.md "Deploying").

1. Each host has a proxied DNS record in Cloudflare and a zone route `<host>/*` in `wrangler.jsonc`. To add a host, add both (on both zones if it's a Portal host).
2. `www.infocuspaly.com` is a Cloudflare redirect rule to `https://infocuspaly.com`. `www.infocusportal.com` has its own Worker route.
3. Add any new meet origin to the meeting-room Worker's `ALLOWED_ORIGINS`, and any new Portal origin to Drive's CORS list (`infocus-drive` `app/main.py`).
4. While the Vercel project is kept as a fallback, the routes `<host>/.well-known/acme-challenge/*` and `<host>/.well-known/vercel/*` on infocuspaly.com have no Worker, so Vercel can renew its certificates. Delete them when Vercel is retired.

## Local with cloudflared (optional)

```bash
# Example: tunnel local next to a quick subdomain for QA
cloudflared tunnel --url http://localhost:3000
```

For sticky names, configure a named tunnel with hostnames `grades` / `teleprompter` / `equipment` routing to the same origin.

## Env

| Var | Purpose |
|-----|---------|
| `APP_BASE_URL` | Canonical main origin; its domain is the canonical Portal domain |
| `SESSION_COOKIE_DOMAIN` | Override cookie domain outside a request (default `.<canonical domain>` in prod) |
| `GRADES_APP_URL` | Optional absolute grades URL |
| `TELEPROMPTER_APP_URL` | Optional absolute teleprompter URL |
| `EQUIPMENT_APP_URL` | Optional absolute equipment URL |
| `MEET_APP_URL` / `NEXT_PUBLIC_MEET_APP_URL` | Meetings host (default `https://meet.<canonical domain>`); set both alike |

## Retiring infocuspaly.com

Already moved: every Portal host, Drive (`drive.infocusportal.com`), the meeting server (`meet-api.infocusportal.com`), the NAS control panel and SSH (`ugos.` and `ssh.infocusportal.com`; the old `ugos.` and `www.` redirect), Google sign-in and YouTube callbacks, email (Resend sends from `@infocusportal.com`; Email Routing forwards `producers@infocusportal.com`), and the editing Mac's `portal_url`. App releases from Oct 24, 2026 on (iPhone Portal 1.3.0, InFocus News 1.0.1, InFocus for Mac and CLI 1.1.0) use infocusportal.com and move old links, pushes, cookies and the saved Drive address over. The CLI also follows Drive's `X-Drive-Moved-To` header by itself, and the editor maps an old `portal_url`.

Still on infocuspaly.com, to finish before letting it go:

1. **Older app builds.** iPhone builds before 1.3.0 and Mac builds before 1.1.0 only know infocuspaly.com. Wait until the App Store and the Mac app's auto-update have replaced them (`NativePushDevice.appVersion` shows what's registered), then drop the `toInstalledAppUrl` call in `src/lib/native-push.ts` and the app exemptions in `legacyPortalRedirect`'s caller (`middleware.ts`).
2. **Equipment passkeys.** RP ID is `infocuspaly.com` (`PASSKEY_RP_ID`). Switch it to infocusportal.com and have managers register new passkeys.
3. **Vercel fallback.** The `/.well-known/{acme-challenge,vercel}` routes and the Vercel project.
