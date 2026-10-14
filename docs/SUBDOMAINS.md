# Subdomains

Same Next.js app, host-based routing in `middleware.ts`.

| Host | Surface | Home rewrite |
|------|---------|--------------|
| `infocuspaly.com` | main | packages dashboard |
| `grades.infocuspaly.com` | grades | `/grades` dashboard |
| `teleprompter.infocuspaly.com` | teleprompter | `/teleprompter` |
| `equipment.infocuspaly.com` | equipment | `/equipment` |
| `meet.infocuspaly.com` | meet | `/meetings` (also `/producers` → `/meet/producers`, `/<id>` → `/meet/<id>`) |
| `drive.infocuspaly.com` | separate app | InFocus Drive (other repo) |

## Shared sessions

Session cookie `infocus_session` is set with `Domain=.infocuspaly.com` in production so one Google sign-in works across grades/teleprompter/equipment/main.

OAuth redirect URI stays on `APP_BASE_URL` (`https://infocuspaly.com/api/auth/google/callback`). After login, `returnTo` can send users back to a subdomain path; absolute `returnTo` URLs are accepted only for `https://` on `infocuspaly.com` or a subdomain (`isTrustedReturnUrl` in `src/lib/auth.ts`). Sign-in from the meet host goes to the main host with `returnTo=https://meet.infocuspaly.com/…`.

## Hosting / DNS

The Portal is the Cloudflare Worker `infocus-portal` (see AGENTS.md "Deploying").

1. Each host has a proxied DNS record in Cloudflare and a zone route `<host>/*` in `wrangler.jsonc`. To add a host, add both.
2. `www.infocuspaly.com` is a Cloudflare redirect rule to `https://infocuspaly.com`.
3. Add any new meet origin to the meeting-room Worker's `ALLOWED_ORIGINS`.
4. While the Vercel project is kept as a fallback, the routes `<host>/.well-known/acme-challenge/*` and `<host>/.well-known/vercel/*` have no Worker, so Vercel can renew its certificates. Delete them when Vercel is retired.

## Local with cloudflared (optional)

```bash
# Example: tunnel local next to a quick subdomain for QA
cloudflared tunnel --url http://localhost:3000
```

For sticky names, configure a named tunnel with hostnames `grades` / `teleprompter` / `equipment` routing to the same origin.

## Env

| Var | Purpose |
|-----|---------|
| `APP_BASE_URL` | Canonical main origin (OAuth) |
| `SESSION_COOKIE_DOMAIN` | Override cookie domain (default `.infocuspaly.com` in prod) |
| `GRADES_APP_URL` | Optional absolute grades URL |
| `TELEPROMPTER_APP_URL` | Optional absolute teleprompter URL |
| `EQUIPMENT_APP_URL` | Optional absolute equipment URL |
| `MEET_APP_URL` / `NEXT_PUBLIC_MEET_APP_URL` | Meetings host (default `https://meet.infocuspaly.com`); set both alike |
