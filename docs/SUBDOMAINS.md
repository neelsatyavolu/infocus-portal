# Subdomains

Same Next.js app, host-based routing in `middleware.ts`.

| Host | Surface | Home rewrite |
|------|---------|--------------|
| `infocuspaly.com` | main | packages dashboard |
| `grades.infocuspaly.com` | grades | `/grades` dashboard |
| `teleprompter.infocuspaly.com` | teleprompter | `/teleprompter` |
| `equipment.infocuspaly.com` | equipment | `/equipment` |
| `drive.infocuspaly.com` | separate app | InFocus Drive (other repo) |

## Shared sessions

Session cookie `infocus_session` is set with `Domain=.infocuspaly.com` in production so one Google sign-in works across grades/teleprompter/equipment/main.

OAuth redirect URI stays on `APP_BASE_URL` (`https://infocuspaly.com/api/auth/google/callback`). After login, `returnTo` can send users back to a subdomain path.

## Vercel / DNS

1. Add domains on the Vercel project:
   - `grades.infocuspaly.com`
   - `teleprompter.infocuspaly.com`
   - `equipment.infocuspaly.com`
2. Point DNS (Cloudflare recommended):
   - CNAME `grades` → `cname.vercel-dns.com` (or Vercel’s target)
   - CNAME `teleprompter` → same
   - CNAME `equipment` → same
3. Apply DB migration: `prisma/migrations/20260809_school_calendar_days`

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
