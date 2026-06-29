-- 142 — Owner-editable legal terms. So Devin can change the attorney language himself (no redeploy). Two
-- rows: 'work_authorization' (signed to approve) and 'completion_acceptance' (the final sign-off). The code
-- constants in lib/estimateTerms.js remain the DEFAULT/fallback if a row is absent. Already-signed estimates
-- keep the version they agreed to (stored on the estimate); new ones use whatever's current here.
create table if not exists public.legal_terms (
  kind        text primary key,                 -- 'work_authorization' | 'completion_acceptance'
  content     text not null,
  version     text not null default 'v1',
  updated_by  text,
  updated_at  timestamptz not null default now()
);

comment on table public.legal_terms is 'Owner-editable legal terms (work authorization + completion acceptance). Falls back to lib/estimateTerms.js defaults when empty.';
