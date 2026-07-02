-- 170 — ONE open ETA report per job, enforced at the DB. The revise-not-stack logic in reportEta had a
-- check-then-insert race: a double-tap made two identical banners the office had to Notify/Dismiss twice
-- (Devin's board screenshot: two "+480 min on Jane Smith · 7:08 AM" rows). The partial unique index closes
-- the race; reportEta catches the conflict and revises the surviving row instead.

-- Self-heal first (the index can't build over existing dupes): auto-ack all but the NEWEST open report
-- per job. The newest carries the latest ETA — the one the office actually needs.
with ranked as (
  select id, row_number() over (partition by job_id order by created_at desc) as rn
  from public.job_eta_updates
  where ack_at is null
)
update public.job_eta_updates
   set ack_at = now()
 where id in (select id from ranked where rn > 1);

create unique index if not exists job_eta_one_open_idx
  on public.job_eta_updates (job_id)
  where ack_at is null;
