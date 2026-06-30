-- 152 — Absence REASON category. Before this, the only way to be EXCUSED was a verified doctor's note, so a
-- funeral (no note) fell through to 'unexcused' — the bug Devin hit. Bereavement + jury duty are now their own
-- categories that auto-excuse without a note. bereavement_relation drives the paid-day rule (3 immediate / 1
-- extended) in the next piece. Idempotent.
alter table public.absences
  add column if not exists category             text,   -- 'bereavement' | 'jury_duty' | 'sick' | 'doctor' | 'other'
  add column if not exists bereavement_relation text;   -- 'immediate' | 'extended' (3 vs 1 paid days, P2)

comment on column public.absences.category is 'Reason category. bereavement/jury_duty auto-excuse (no doctor''s note needed).';
