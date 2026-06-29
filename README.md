<!--
  PROPRIETARY & CONFIDENTIAL — (c) 2026 Clog Busterz Plumbing, LLC. All rights reserved.
  NOT open source. Do not copy, fork, redistribute, or reverse-engineer. Keep this repo PRIVATE.
  Access is limited to authorized personnel under a signed NDA. See LICENSE.
-->

> **Proprietary & confidential — (c) 2026 Clog Busterz Plumbing, LLC. All rights reserved.**
> Not open source. No copying, forking, or reverse-engineering. Keep this repository **private**;
> access is limited to authorized personnel under a signed NDA. See [`LICENSE`](LICENSE).

# Sheetz web app (CB)

The new Clog Busterz stack — **Next.js on Vercel + Supabase** — replacing the Apps Script board +
tech iPad, one screen at a time. See `../docs/WEB_MIGRATION_PLAN.md` for the big picture.

**Right now this contains the beachhead:** the tech iPad **"My Day"** screen, reading real jobs from
Supabase. Get this loading fast on Vercel and the foundation is proven.

---

## Get it running (about 10 minutes)

You'll need a free [Node.js](https://nodejs.org) install. Then, in this folder:

### 1. Install
```bash
npm install
```

### 2. Add your Supabase keys
- Supabase dashboard → **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
- Copy `.env.example` to `.env.local` and paste them in:
```bash
cp .env.example .env.local
```
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

### 3. Add a few sample jobs
Your Supabase already has the `jobs` / `customers` / `techs` tables (relational — jobs link to
customers + techs by id), they're just empty.
- Supabase dashboard → **SQL Editor → New query** → paste the contents of `supabase/seed.sql` → **Run**.
- That drops in a sample tech, 3 customers, and 3 jobs for today.

### 4. Run it
```bash
npm run dev
```
Open <http://localhost:3000> → click **Tech · My Day**. You should see the sample jobs, fast.
(Add `?tech=Matt Shepard` to the URL to filter to one tech.)

---

## Put it on the internet (Vercel)

1. **Push this folder to a new GitHub repo** (you create the empty repo on github.com, then push —
   I can give you the exact commands).
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import that GitHub repo.
   - If you pushed the whole `CB_Ecosystem` repo, set Vercel's **Root Directory** to `sheetz-web`.
   - If you pushed only this folder, leave it at the root.
3. In Vercel → the project → **Settings → Environment Variables**, add the same two keys from step 2
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. **Deploy.** Vercel gives you a live URL. Every future `git push` auto-deploys.

That's it — the My Day screen is live on the internet, loading from Supabase.

---

## What's here
```
sheetz-web/
  app/
    layout.js          ← shared shell + CB amber theme
    page.js            ← home / status
    my-day/page.js     ← THE BEACHHEAD: tech's jobs, live from Supabase
    globals.css        ← CB brand theme (dark amber, never neon)
  lib/supabaseClient.js ← Supabase connection (safe anon client)
  supabase/seed.sql     ← sample rows for your existing jobs/customers/techs tables
  .env.example          ← copy to .env.local with your keys
```

## What's next (I'll build these)
job detail → photo upload (Supabase Storage) → My Truck/tools → van check → real login (Supabase
Auth) → then the dispatch board. Each ships to the same Vercel app as it's done.

## Safety notes
- The **anon key is fine in the browser** — it's protected by Row-Level Security (RLS). The
  **service-role key is a secret** — never put it in this app; it's only for server-side migration
  scripts later.
- The current RLS policy is wide-open *read* so the beachhead works before auth. We tighten it (a
  tech only sees their own jobs) in the auth phase — see the migration plan.
