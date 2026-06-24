-- Roster position — who on the techs roster can actually take field jobs. The Job Booking tech
-- picker + the dispatch board rows show everyone EXCEPT 'office'. Editable on /team.
-- Idempotent. Run in the Supabase SQL editor.
alter table public.techs add column if not exists position text not null default 'tech';
-- positions (see lib/positions.js — the app validates writes): field = tech | helper | salesman |
-- field_supervisor | general_manager | owner ; office = dispatcher | office_manager | accounting | office

-- Seed the clearly pure-office staff so they drop off the field picker immediately.
-- NOTE: the owner + supervisors still run calls and keep the tech/iPad view, so they stay
-- field-eligible (default 'tech') — set them to 'supervisor' on /team if you want the label.
-- Only touches rows still at the default — never overrides a position you've set on /team.
update public.techs set position = 'office'
  where position = 'tech' and name in ('Tracey Mills', 'Ashley Payne');
