-- 154 — per-employee vacation allotment. Not everyone gets the same: most earn 5 days (1 week), some earn
-- 10 days (2 weeks). Paid holidays stay 5 for everyone. Default 5 so existing rows keep the standard week.
-- lib/pto.js reads this for the anniversary grant (vacation_days × 8 hrs). Set by the office. Idempotent.
alter table public.pay_profiles
  add column if not exists vacation_days int not null default 5;   -- vacation DAYS earned each anniversary (5 = 1 wk, 10 = 2 wks)

comment on column public.pay_profiles.vacation_days is 'Vacation days earned each hire anniversary (5 = 1 week, 10 = 2 weeks). Use-it-or-lose-it. Paid holidays are a separate fixed 5/yr.';
