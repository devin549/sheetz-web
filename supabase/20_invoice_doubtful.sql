-- "Doubtful" / bad-debt flag on invoices — too old to count on, but still legally owed (stays on
-- statements + lawyer packet). Doubtful balances are EXCLUDED from collectible AR ("money into the
-- bank") but kept for the record. Run ONCE in Supabase → SQL Editor.

alter table public.invoices
  add column if not exists doubtful    boolean default false,
  add column if not exists doubtful_at timestamptz,
  add column if not exists doubtful_by text;

create index if not exists invoices_doubtful_idx on public.invoices (doubtful) where doubtful;
