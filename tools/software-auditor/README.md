# Sheetz Software Auditor

Read-only checks for the Sheetz web app. The auditor studies the codebase, optional live routes,
and optional Supabase schema access, then writes a plain-English Markdown report.

It does **not** write to Supabase, submit forms, send messages, merge code, or change production.

## Run

```bash
npm run audit:software
```

The report is written to:

```text
.audits/software-auditor-report.md
```

## Crawl a running app

Set a base URL before running:

```bash
SOFTWARE_AUDITOR_BASE_URL=http://localhost:3000 npm run audit:software
```

For a protected preview, pass temporary cookies or headers. The auditor never prints their values:

```bash
SOFTWARE_AUDITOR_BASE_URL=https://your-preview.vercel.app \
SOFTWARE_AUDITOR_COOKIE="cookie=value; another=value" \
npm run audit:software
```

## Inspect Supabase Read-Only

If `psql` is installed, provide a temporary read-only Postgres URL:

```bash
SOFTWARE_AUDITOR_DATABASE_URL="postgresql://codex_readonly:..." npm run audit:software
```

The live database checks only run read-only metadata queries against `information_schema`, `pg_class`,
and `pg_indexes`.

## What It Checks

- App routes under `app/`
- Middleware public-route blockers
- Missing CI workflow
- Potential service-role usage from client components
- Potential hardcoded secrets
- Board action hardening gaps
- Deferred work hotspots in docs/source
- Local Supabase SQL files and, when configured, live DB tables/RLS/indexes
