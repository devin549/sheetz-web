-- 146 — Equipment fleet roster. We own MULTIPLE identical machines (4× 17G, 1× 26G, 1× skid steer), so
-- "where's the 17G?" can't collapse to one location — there are up to 4 at once. This roster gives the
-- DENOMINATOR per model so the tracker reports several recent locations and flags "2 of 4 not seen lately."
-- model_key = the spaceless token chat-sightings match on ("17g", "26g", "skidsteer"). Owner-editable.
-- Idempotent. Seeded with the current fleet; edit rows in Supabase as the fleet changes.
create extension if not exists pgcrypto;

create table if not exists public.equipment_fleet (
  id          uuid primary key default gen_random_uuid(),
  model       text not null,                 -- display name, e.g. "17G Excavator"
  model_key   text not null unique,          -- spaceless match token, e.g. "17g"
  count       int  not null default 1,       -- how many we own
  kind        text not null default 'equipment',
  note        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.equipment_fleet (model, model_key, count, kind) values
  ('17G Excavator', '17g',       4, 'equipment'),
  ('26G Excavator', '26g',       1, 'equipment'),
  ('Skid Steer',    'skidsteer', 1, 'equipment')
on conflict (model_key) do nothing;

comment on table public.equipment_fleet is 'Owned-equipment roster (model + how many). Lets the chat-learned tracker report MULTIPLE units per model and flag unseen ones.';
