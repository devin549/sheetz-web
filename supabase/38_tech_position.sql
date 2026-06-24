-- Roster position — who on the techs roster can actually take field jobs. The Job Booking tech
-- picker + the dispatch board rows show everyone EXCEPT 'office'. Editable on /team.
-- Idempotent. Run in the Supabase SQL editor.
alter table public.techs add column if not exists position text not null default 'tech';
-- positions: tech | helper | sales | supervisor | office

-- Seed the known office/management staff so they drop off the field picker immediately.
-- Only touches rows still at the default — never overrides a position you've set on /team.
update public.techs set position = 'office'
  where position = 'tech' and name in ('Devin Tackett', 'Ronnie Mchone', 'Tracey Mills', 'Ashley Payne');
