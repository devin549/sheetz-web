-- 139 — Customer signature on estimate approval. Until Twilio A2P clears (text-to-sign), the customer signs
-- on the iPad / their phone when they approve. We store the drawn signature (PNG data URL) + when it was
-- signed, alongside the existing typed name + consent text — a stronger, harder-to-dispute acceptance record.
alter table public.pricebook_estimates
  add column if not exists signature_data text,
  add column if not exists signed_at      timestamptz;

comment on column public.pricebook_estimates.signature_data is 'Base64 PNG of the customer''s drawn signature captured at approval (in-person/on-device until A2P text-to-sign).';
