-- After-hours / on-call flag on a job. Set when a tech picks up or is dispatched a job after they've
-- already clocked out — so it counts toward on-call pay and the office sees it was after-hours. Additive.
alter table public.jobs add column if not exists after_hours boolean not null default false;
