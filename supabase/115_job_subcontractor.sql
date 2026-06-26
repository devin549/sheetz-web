-- 115_job_subcontractor.sql — subcontractor cost on a job.
-- A sub is passed AT COST (no 1.5×/2× markup, no premium) and "taken off" the commissionable base.
-- It's PENDING until Accounting verifies it (sub_verified=true); pay shows the number flagged pending.
alter table public.jobs add column if not exists sub_cost_cents int not null default 0;
alter table public.jobs add column if not exists sub_vendor      text;
alter table public.jobs add column if not exists sub_verified    boolean not null default false;
alter table public.jobs add column if not exists sub_verified_by text;
alter table public.jobs add column if not exists sub_verified_at timestamptz;
