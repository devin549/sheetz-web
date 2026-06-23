# Ship checklist — roles + QA + ETA relay

Everything below is built and tested on branch **`feat/roles-qa-foundation`** (stacked on
`feat/board-dispatcher-phase-a` → `feat/job-file-and-board-views` → `main`). The features are
**fail-open**: they do nothing harmful until the SQL is run, so you can do these steps in order.

## 1. Run the database migrations (one paste)
Supabase → SQL Editor → New query → paste **`supabase/RUN_ALL_ROLES_QA.sql`** → Run.
That bundles, in dependency order:
- `23_job_photo_spine.sql` — Job File photos + private `job-photos` Storage bucket
- `24_profiles.sql` — roles/scope table (seeds **you** as `owner`)
- `25_qa_spine.sql` — QA reviews + per-job-type closeout rules + audit log
- `26_eta_updates.sql` — the Running-Late ETA relay

Idempotent — safe to re-run.

## 2. Turn on tech isolation (on /team)
After #1, open **Team**:
- Each person's **role** now saves to the profiles table (server-authoritative).
- For each **tech / helper**, use the **"link to tech"** dropdown to connect their login to their
  roster row. Once linked, that tech sees **only their own jobs** on My Day + the Job File, and
  can't status-change anyone else's. (Until linked, it falls back to name-matching.)

## 3. What goes live
- **Board**: date nav + search + clickable filters + ops-first + photo badges + Map/Roster/Week/Capacity
- **Job File** (`/job/[id]`): photo spine + Closeout Gate + per-photo QA pass/fail
- **QA / Closeouts** (`/supervisor/jobs`): supervisor review queue (FS/foreman/GM/owner)
- **Close-gate**: a job can't go *done* until the media rule is met (override = supervisor, logged)
- **Running-Late relay**: tech reports a delay → office controls the customer message (no auto-send)

## 4. Merge to production (your call)
Merge the PRs bottom-up so each is reviewable, or fast-forward in order:
`feat/job-file-and-board-views` → `feat/board-dispatcher-phase-a` → `feat/roles-qa-foundation` → `main`.
Pushing `main` auto-deploys to the production Vercel URL.

## Known follow-ups (not blockers)
- **HEIC previews** — iPhone photos store fine but won't thumbnail until a server-side convert.
- **Annotation circles** — `job_photo_annotations` table is ready; the draw-on-photo UI is v2.
- **SMS consent guard** — "Send text" is human-gated today; wire `customer_master` consent when it lands.
