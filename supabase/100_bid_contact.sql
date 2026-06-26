-- Bid / estimate follow-up tracking (HTML "Bids" tab). Devin's rule: the tech keeps their 5% if THEY follow
-- up and close it; let it sit with no contact and it escalates to Sales in 24h (tech forfeits the 5%, Sales
-- gets 3%). Logging a contact stamps the bid as "followed up · stays yours" and stops the escalation clock.
-- Additive, idempotent.
alter table public.jobs add column if not exists bid_contacted_at   timestamptz;
alter table public.jobs add column if not exists bid_contacted_by   text;
alter table public.jobs add column if not exists bid_contact_method text;   -- 'text' | 'call' | 'email'
alter table public.jobs add column if not exists bid_followup_at     date;  -- optional scheduled follow-up
