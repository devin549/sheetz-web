-- 🗓 Net-30 (and Net-15) account terms — office-set, for trusted/commercial accounts. When > 0, the close
-- doesn't collect; the office invoices and AR tracks it due in N days. Append-only, safe to re-run.
alter table public.customers
  add column if not exists net_terms_days int not null default 0,  -- 0 = due at close; 30 = Net-30
  add column if not exists net_terms_by   text,
  add column if not exists net_terms_at   timestamptz;
