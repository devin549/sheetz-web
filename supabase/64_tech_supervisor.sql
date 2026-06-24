-- Field-supervisor → managed crew. Each tech/helper can be assigned the supervisor who manages them, so a
-- supervisor's meeting/announcement auto-targets exactly their people (or "everyone").
-- Idempotent. Run in the Supabase SQL editor.
alter table public.techs add column if not exists supervisor text;
create index if not exists techs_supervisor_idx on public.techs (supervisor);
