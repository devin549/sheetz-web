-- Tech Settings: the daily roast LEVEL (the intensity ceiling for Hank's coach/roast) + per-tech UI prefs.
-- Mirrors the Apps Script tech iPad Settings pane: roast level is PICK-ONCE-THEN-LOCK so a tech can't game
-- it up and down — PG is the safe default/floor; roasts are NEVER customer-facing. Owner/GM can override or
-- unlock any tech's level. `prefs` holds the small toggles (notifications, reduce-motion, big-text, theme).
-- Idempotent. Run in the Supabase SQL editor.
alter table public.profiles add column if not exists roast_level  text    not null default 'PG';
alter table public.profiles add column if not exists roast_locked boolean not null default false;
alter table public.profiles add column if not exists prefs        jsonb   not null default '{}'::jsonb;

-- Keep the level to the three sanctioned tiers (PG = clean ribbing · PG-13 = some bite · R = no mercy).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_roast_level_check') then
    alter table public.profiles add constraint profiles_roast_level_check check (roast_level in ('PG','PG-13','R'));
  end if;
end $$;

-- Optional company-wide default roast level the owner/GM can set (applies to techs who haven't picked yet).
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
