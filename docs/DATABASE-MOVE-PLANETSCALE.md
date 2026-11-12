# Moving the Portal database from Supabase to PlanetScale

Supabase is plain Postgres to the Portal: no Supabase SDK, auth, storage or realtime. The move copies the `public` schema to a PlanetScale Postgres database created and billed through the Cloudflare account, then points Hyperdrive and the `DATABASE_URL`/`DIRECT_URL` settings at it. No app code changes.

**Status: done on November 12, 2026.** Production moved at 13:19 PT: the Supabase write freeze, dump, restore, row-count check, Hyperdrive switch and Worker secrets took 30 seconds (118 tables, 20,665 rows, 43 MB). Supabase is still read-only as the fallback; retire it after November 26 (section 6). The PlanetScale database is org `infocus`, database `infocus-portal`, Postgres 17, AWS us-west-2, HA PS-10 ($30/month on the Cloudflare invoice). The app role `portal-app` is in 1Password (Private, "InFocus Portal DB (PlanetScale)"); the old Supabase URLs are in "InFocus Portal DB (Supabase, retiring)".

Three things the rehearsal turned up:
- The dump contains `CREATE SCHEMA public`, which already exists on PlanetScale. Restore through a list that drops that entry: `pg_restore -l "$DUMP" | grep -vE ' SCHEMA - public | COMMENT - SCHEMA public ' > restore.list`, then `pg_restore ... -L restore.list`.
- PlanetScale's URL ends in `&sslrootcert=system`. `psql` understands it; node-postgres reads it as a file path and fails with `ENOENT ... 'system'`. Drop that parameter from `DATABASE_URL`/`DIRECT_URL`, and give Hyperdrive the URL without any query string.
- Production has no `_prisma_migrations` table (schema changes go through `prisma db push`), so `prisma migrate status` reports every migration as unapplied on both databases. Use `prisma db push` (it should say "already in sync") to check the schema instead.

Who runs what: anything that creates a paid resource, changes Hyperdrive or changes Worker secrets is run by the owner (in Claude Code, prefix with `!`). Never paste connection strings into chat, files or commits. Keep both databases' URLs in 1Password and read them with `op read`.

## 1. Prep (any day before the move)

1. **Measure the current database** (Supabase SQL editor):
   ```sql
   select version();
   select pg_size_pretty(pg_database_size(current_database()));
   select count(*) from pg_stat_activity where datname = current_database();
   select schemaname, tablename, policyname from pg_policies where schemaname = 'public';
   select extname from pg_extension;
   ```
   Note the Postgres major version, the size, the busiest connection count you see, and any RLS policies on `public` (policies that call `auth.uid()` won't restore anywhere else; drop them from the dump or before it).
2. **Find Supabase's region** (Project Settings → General). Create PlanetScale in the AWS region closest to it.
3. **Create the database** (owner): Cloudflare dashboard → Storage & databases → Postgres & MySQL (Hyperdrive) → Create PlanetScale database.
   - Engine Postgres, major version equal to or newer than Supabase's.
   - Cluster: **HA (primary + 2 replicas)**. Size from step 1: start at the smallest size whose memory exceeds the database size, and go one up if unsure. It resizes later without downtime.
4. **Create a role** in PlanetScale for the app, and save its direct connection string (port 5432, `sslmode=verify-full`) in 1Password as a new item. Don't create a new Hyperdrive config yet.
5. **Local tools**: `pg_dump`/`psql` 17 are installed (`/opt/homebrew/opt/postgresql@17/bin`). If either database is Postgres 18, install `postgresql@18` and use its client.

## 2. Rehearsal (a weeknight, Portal stays up)

Same commands as the real move, minus the write freeze, into the new database. It times the copy and finds restore errors before the move counts.

```sh
export SRC="$(op --account <account> read 'op://<vault>/<supabase item>/direct url')"
export DST="$(op --account <account> read 'op://<vault>/<planetscale item>/direct url')"
DUMP="$HOME/portal-db-$(date +%Y%m%dT%H%M).dump"

time pg_dump "$SRC" --schema=public --no-owner --no-privileges --format=custom --file="$DUMP"
time pg_restore --dbname="$DST" --no-owner --no-privileges --exit-on-error --jobs=4 "$DUMP"
```

- `--schema=public` leaves out Supabase's own schemas (`auth`, `storage`, `realtime`, `graphql`, `vault`, …). Prisma's tables and `_prisma_migrations` are all in `public`.
- Keep the dump file out of the repo and delete it after the fallback window: it holds student data.

**Check the copy** (run against both, compare):
```sh
for DB in "$SRC" "$DST"; do
  psql "$DB" -XAtq -c "select format('select %L, count(*) from public.%I', tablename, tablename) from pg_tables where schemaname='public' order by 1" \
    | psql "$DB" -XAtq > "/tmp/counts-$(echo "$DB" | md5 | cut -c1-6).txt"
done
diff /tmp/counts-*.txt && echo "row counts match"
```
Also run `npx prisma migrate status` with `DATABASE_URL="$DST" DIRECT_URL="$DST"`; it should report the schema is up to date (75 migrations).

**Smoke test** (no browser): point a local shell at `$DST` and run `npm run test`, plus `scripts/editor-shell.mjs` or any read-only script you trust. Then wipe the rehearsal copy (`drop schema public cascade; create schema public;`) so the real restore starts clean.

Write down how long dump + restore took. That's the downtime.

## 3. The move (quiet night or weekend)

1. **Optional heads-up**: set `HUB_MAINTENANCE_MODE = true` in `src/lib/maintenance.ts` with a new ETA/body, push, and wait for the deploy. This only shows non-producers a notice; step 2 is what stops writes.
2. **Freeze writes on Supabase** (SQL editor):
   ```sql
   alter database postgres set default_transaction_read_only = on;
   select pg_terminate_backend(pid) from pg_stat_activity
   where datname = 'postgres' and pid <> pg_backend_pid() and usename = 'postgres';
   ```
   New sessions are read-only from here; pages still load, saves fail. The every-minute cron, Inngest and the apps get errors until step 5, which is expected.
3. **Dump and restore** with the commands from the rehearsal. `pg_dump` works on a read-only database.
4. **Check the copy**: row-count diff and `prisma migrate status`, as above. Don't continue on a mismatch.
5. **Point Hyperdrive at PlanetScale** (owner). Updating the existing config moves both Workers that use it (`infocus-portal` and `producers-forward`) without a deploy:
   ```sh
   ! npx wrangler hyperdrive update ed1d440dbd764d159d1e6071f2c51435 \
       --connection-string "$(op --account <account> read 'op://<vault>/<planetscale item>/direct url')" \
       --origin-connection-limit 20
   ```
   20 replaces the old cap of 10, which only existed because of Supabase's 15-client pooler.
6. **Update Worker secrets** (owner), each reading from 1Password via stdin:
   ```sh
   ! op --account <account> read 'op://<vault>/<planetscale item>/direct url' | npx wrangler secret put DATABASE_URL
   ! op --account <account> read 'op://<vault>/<planetscale item>/direct url' | npx wrangler secret put DIRECT_URL
   ```
   On Workers the app connects through Hyperdrive; these two are only fallbacks, but leaving them on Supabase would be a trap.
7. **Update local `.env` and `.env.local`** (both currently point at production) to the PlanetScale URL.
8. **Turn maintenance mode off** if you turned it on.

## 4. Verify (right after)

- `GET https://infocusportal.com/api/service/runtime-check` with `Authorization: Bearer $CRON_SECRET` returns ok.
- `npx wrangler tail infocus-portal` for a few minutes: the every-minute tick runs without database errors.
- In PlanetScale's query insights, queries are arriving; in Supabase, `select count(*) from pg_stat_activity where usename='postgres'` falls to zero.
- Make one harmless write as a producer (e.g. a note on a test package) and confirm it lands in PlanetScale.
- The next hourly Hub backup to R2 succeeds (it reads through Hyperdrive, so it now backs up PlanetScale).

## 5. Rollback

Anything wrong within the first few hours and no important writes yet:
1. `alter database postgres set default_transaction_read_only = off;` on Supabase.
2. `wrangler hyperdrive update` back to the Supabase URL with `--origin-connection-limit 10`, and put the old `DATABASE_URL`/`DIRECT_URL` secrets back.

After real writes have landed in PlanetScale, rolling back loses them; fix forward instead, or dump PlanetScale back into Supabase the same way.

## 6. After two weeks

- Take a final `pg_dump` of Supabase into 1Password-protected storage or R2, then pause/delete the Supabase project.
- Delete the stale Worker secrets: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_*`, `POSTGRES_*`.
- Delete the local dump files.

## Code and docs to update in the same change

- `src/lib/prisma-workers.ts`: comments about Supabase's 15-client pooler and the Hyperdrive cap of 10; `nodePgAdapter`'s small pool can stay.
- `app/privacy/page.tsx`: "Hosting and database: Vercel and Supabase" → Cloudflare and PlanetScale.
- `CLAUDE.md`/`AGENTS.md` Deploying → Database: "Supabase's session pooler allows 15 clients and Hyperdrive holds up to 10".
- `docs/ENVIRONMENT.md` if it names Supabase.
