# Sheetz web app — BUILD STATUS (the one source of truth)

Read this first. It's the running checklist so nothing gets lost or rebuilt twice. Update it as
work lands. Companion files: `API_INTEGRATIONS_BY_ROLE.md` (the AI/API layer per role),
`../lib/roles.js` (the canonical 15-role permission model, ported from the live board).

**Where it runs:** Next.js → Vercel (auto-deploys from GitHub `main`), data in Supabase
(`vwkcxwefqjgbdaeawtir`). Production URL = `sheetz-web-git-main-devin-tackett-s-projects.vercel.app`
(always latest — NOT the hash URLs, those are frozen). Local Windows build crash after
"✓ Compiled successfully" is a false alarm; only that line matters.

## Migration rule (locked)
PORT from the existing Sheets/HTML — do NOT reinvent. The old board + iPad are the spec. Source of
truth for anything already built = `Dispatch_Sheet/` (board: `dispatchboard_*.html` + `CB_Dispatch_*.js`).

## Roles & access — DONE ✅
15 roles ported verbatim from `Dispatch_Sheet/dispatchboard_roles.html` → `lib/roles.js`:
owner/admin · dispatcher · csr · foreman · tech · helper · viewer · customer · gm · om ·
accounting · fs · sales · marketing · shop. Nav + page guards are permission-driven
(`lib/nav.js` + `lib/guard.js` `requireHref`). Unknown role → viewer (safe). Add people via the
**Team** screen (no bulk import — Devin adds as he hires, picks position).

## Screens
| Screen | Route | Status | Notes |
|---|---|---|---|
| Login (email+password) | /login | ✅ live | per-user Supabase auth |
| Account / change password | /account | ✅ live | everyone; sets own password |
| Team (add hire, set role) | /team | ✅ live | manageUsers only; server-enforced |
| Home command center | / | ✅ live | role-aware KPIs + Owner-Sheet tile map |
| My Day | /my-day | ✅ live (read) | ⏳ self-scope to logged-in tech; helper→paired tech |
| My Truck (fleet + detail) | /my-truck | ✅ live (read) | ⏳ actions: request transfer, loan a tool |
| Shop (reorder + restock) | /shop | ✅ live (read) | ⏳ self-issue review queue (Reed) |
| Customers search | /customers | ✅ live | 13k ST base, CB numbers |
| Past Due (AR) | /past-due | ✅ live | $1.6M, top 100 |
| Light/dark + blinking alerts | (global) | ✅ live | toggle in topbar |

## Next ports (in easiest-first order)
1. ⏳ **My Day self-scope** — a tech sees only their jobs; a **helper** sees their *paired tech's*
   day (needs `helper_assignments` table — migration `supabase/06_helper_assign.sql` ready to run).
2. ⏳ **Truck actions** — request parts transfer + loan a tool (port from `CB_Dispatch_*Tools*`).
3. ⏳ **Dispatch board** — the big one. Spec = `dispatchboard_app.html` + endpoints. Live booking/
   assignment + the board grid.
4. ⏳ **Booking / intake**, then the AI/API layer per `API_INTEGRATIONS_BY_ROLE.md`.

## Open loops / owed
- [ ] Run `supabase/06_helper_assign.sql` in Supabase (helper pairings table).
- [ ] Rotate `SUPABASE_SERVICE_ROLE_KEY` once staff are on per-user auth (it was pasted in chat).
- [ ] Devin's own login password — change it on /account (was set in chat earlier).
- [ ] 2FA (Supabase MFA) — the board has email-2FA; port when ready.

## Migrations run (Supabase SQL editor)
02 customers ST cols · 03 CB numbers · 04 invoices AR · 05 truck+tools · **06 helper_assign (PENDING)**.
