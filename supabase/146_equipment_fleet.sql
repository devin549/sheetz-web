-- 146 — Equipment fleet roster, PER UNIT (so each physical machine is its own row a tag can map to). We own
-- multiples (4× 17G, 1× 26G, 1× skid steer); each gets a printed tag, so "where's the 17G?" resolves to a
-- specific unit once tags are attached. model_key = the spaceless token chat-sightings match on ("17g"),
-- tag_code = the physical tag id (NULL until attached → scan resolves to this unit). Owner-editable.
-- Idempotent. Seeded with the current fleet; add/retire rows + fill tag_code as tags go on.
create extension if not exists pgcrypto;

create table if not exists public.equipment_fleet (
  id          uuid primary key default gen_random_uuid(),
  model       text not null,                 -- display, e.g. "17G Excavator"
  model_key   text not null,                 -- spaceless match token, e.g. "17g"
  unit_label  text not null,                 -- "17G #1" — the specific machine
  tag_code    text,                          -- physical tag id (NULL until attached); a scan looks up this unit
  kind        text not null default 'equipment',
  note        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (model_key, unit_label)
);
create unique index if not exists equipment_fleet_tag_idx on public.equipment_fleet (tag_code) where tag_code is not null;
create index if not exists equipment_fleet_model_idx on public.equipment_fleet (model_key) where active;

insert into public.equipment_fleet (model, model_key, unit_label, kind) values
  ('17G Excavator', '17g',       '17G #1', 'equipment'),
  ('17G Excavator', '17g',       '17G #2', 'equipment'),
  ('17G Excavator', '17g',       '17G #3', 'equipment'),
  ('17G Excavator', '17g',       '17G #4', 'equipment'),
  ('26G Excavator', '26g',       '26G #1', 'equipment'),
  ('Skid Steer',    'skidsteer', 'Skid Steer #1', 'equipment')
on conflict (model_key, unit_label) do nothing;

comment on table public.equipment_fleet is 'Per-unit owned-equipment roster (one row per machine, tag_code-ready). Lets the tracker report each unit + flag unseen ones; a tag scan resolves to the exact unit.';
