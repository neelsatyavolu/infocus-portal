# InFocus Portal

The production hub for **InFocus News**, the student broadcast journalism program at Palo Alto High School. Students, producers, and the adviser use it to run the class every day: pitching and producing video packages, reviewing cuts, grading, planning the daily show, and running the teleprompter.

Built by [Neel Satyavolu](https://n3el.dev). It runs in production for the class every school day.

## What it does

- **Package cycles**: Each group moves through pitch → proof of contact → A-roll/B-roll → initial cut → final cut. There's a three-stage approval chain (assigned producer → adviser → executive producers), deadlines, extension requests, and late penalties.
- **Video review**: Frame-accurate comments on uploaded cuts, version history, and needs-changes / approve flows. Uploads are resumable and served from a self-hosted NAS ("InFocus Drive"), with an H.264 proxy for camera originals.
- **Grades**: Check-in, livestream, participation, and final-cut scores that release per stage. There's a Grade Editor for producers and a gradebook for students.
- **The Show**: Master calendar, anchor and cast rotation, show-manager rotation, and a publishing queue that auto-assigns finished packages to upcoming shows and schedules YouTube uploads.
- **Teleprompter**: Script builder with AI-assisted announcement rewrites and a kiosk mode for the studio Mac.
- **Portal assistant**: A chat assistant (Gemini, with Groq fallback) that answers from `docs/knowledge/` and looks up groups and grades with role-gated tools.
- **Also included**: Announcements, class board, group messages, equipment checkout with passkeys, a shared password vault, web push and email notifications, and hourly database backups.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Prisma + Postgres · Tailwind + shadcn/ui · Inngest (background jobs) · Resend (email) · Web Push · Vitest. Deployed on Vercel.

## Getting started

Requires Node 22+ and a Postgres database.

```bash
npm install
# create .env with the variables in docs/ENVIRONMENT.md
npm run db:push            # create the schema
npm run dev
```

Only `DATABASE_URL`, `APP_AUTH_SECRET`, and Google OAuth are needed to sign in. Every integration (Drive/NAS, Gemini, Slack, YouTube, R2 backups, web push) is optional and switches off when its variables are unset. See [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md).

Staff identities live in env vars, not in the code:

| Variable | Purpose |
|---|---|
| `PLATFORM_SUPER_ADMIN_EMAIL` | Technical super admin (role assignment, View as) |
| `PACKAGE_ADVISER_EMAIL` | The class adviser: Stage 2 approval, with the same admin powers as super admin |
| `VIEW_AS_LIMITED_ACTORS` | Optional `actor=target\|target;actor2=target` grants for limited View as |
| `HUB_MAINTENANCE_BYPASS_EMAILS` | Optional comma-separated emails that skip maintenance mode |

## Development

| Task | Command |
|---|---|
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Tests | `npm run test` |
| Build | `npm run build` |

Class rules (roles, approval chain, grading, extensions) are in [`docs/class-rules-2026-27.md`](docs/class-rules-2026-27.md). The product documentation used by the assistant is in [`docs/knowledge/`](docs/knowledge/README.md).

## Privacy & analytics

The site uses two cookieless page-view counters:

- **Vercel Analytics and Speed Insights**: page views and performance metrics, collected by Vercel.
- **n3el analytics**: a small script from `analytics.n3el.dev`, run by the developer. It sends only the hostname, the page path (query strings removed, IDs replaced, only the first two path segments kept), and the referring site. It sets no cookies, stores no IP addresses, and sends no names, emails, grades, or content. Guest review links (`/g/…`) are not counted.

Neither sets cookies or identifies visitors, so there is nothing to opt out of per account.

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
