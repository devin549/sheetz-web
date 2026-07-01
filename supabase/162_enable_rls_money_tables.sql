-- 162 — SECURITY (audit P0-3): these tables shipped WITHOUT row-level security. Supabase exposes the `public`
-- schema to the browser anon key, so any of them was directly readable/writable via PostgREST — bypassing all
-- of lib/guard.js + lib/roles.js (which only run inside server actions). Enabling RLS with NO policies makes
-- each table service-role-only (exactly how every server action already reaches it) — matching the rest of the
-- schema, whose model is "RLS on, no anon/auth policies = locked by default" (see 104_pricebook.sql).
--
-- Concrete holes this closes (all were reachable with the shipped anon key, unauthenticated):
--   pricing_settings  → zero/spike the company-wide after-hours markup
--   service_tiers     → move base prices reserved to owner-only (canMovePrice)
--   terminal_readers  → reroute in-person card charges to an attacker's reader; read all reader ids
--   stripe_events     → pre-insert a future evt_ id so the webhook skips reconciling a real payment
--   legal_terms       → overwrite the signed work-authorization language customers agree to
alter table public.pricing_settings      enable row level security;
alter table public.service_tiers         enable row level security;
alter table public.terminal_readers      enable row level security;
alter table public.stripe_events         enable row level security;
alter table public.legal_terms           enable row level security;
alter table public.receipt_flags         enable row level security;
alter table public.asset_locations       enable row level security;
alter table public.equipment_fleet       enable row level security;
alter table public.equipment_scans       enable row level security;
alter table public.equipment_service     enable row level security;
alter table public.equipment_job_use     enable row level security;
alter table public.app_settings          enable row level security;

-- Belt-and-suspenders: no table in public should be reachable by the browser roles directly.
revoke all on all tables in schema public from anon, authenticated;

-- Guardrail — run this any time to list public tables that FORGOT RLS (should return zero rows):
--   select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
