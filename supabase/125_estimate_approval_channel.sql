-- 125 — Approval channel + atomic first-write-wins for the estimate close. An estimate can be opened on the
-- tech's iPad, texted, AND emailed — all three point at the SAME token. If two channels tap "approve" in the
-- same instant, the app now does a CONDITIONAL update (status not in approved/declined) so only the FIRST
-- write wins; the others see the locked state. This column records WHICH channel the winning close came in on.
--
-- ADDITIVE / IDEMPOTENT. The app degrades gracefully if this isn't applied yet (it strips the column from the
-- write and retries), so sending/approving never hard-fails on an un-run migration.
alter table public.pricebook_estimates
  add column if not exists approval_channel text;   -- 'ipad' | 'text' | 'email' | 'in_person' | 'link' — how the winning close arrived

-- The proof-event timeline already has `method`; nothing to add there. This is just the snapshot's channel.
