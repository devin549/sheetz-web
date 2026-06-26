-- Excused/unexcused absence tracking (audit #6, CB rules). 2 UNEXCUSED in a calendar year = forfeit all 5
-- paid holidays (AutoFill_412_1e). An absence is EXCUSED when a doctor's note is on file. The note image
-- lives in a PRIVATE bucket and is emailed to records@ for verification — we store the image + the fact a
-- doc was submitted, never the medical reason (employer absence-verification, not a medical record).
create table if not exists public.absences (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  tech_name      text,
  absence_date   date not null,
  status         text not null default 'pending' check (status in ('pending','excused','unexcused')),
  reason         text,                 -- short free text ("car wouldn't start"); NOT a medical diagnosis
  doc_path       text,                 -- private excuse-docs path (doctor's note image)
  doc_emailed_at timestamptz,
  decided_by     uuid,
  decided_by_name text,
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now()
);
create index if not exists absences_user_idx on public.absences (user_id, absence_date desc);
create index if not exists absences_status_idx on public.absences (status, absence_date);

-- Private bucket for doctor's-note images (service-role only — never public).
insert into storage.buckets (id, name, public)
values ('excuse-docs', 'excuse-docs', false) on conflict (id) do nothing;

alter table public.absences enable row level security;
