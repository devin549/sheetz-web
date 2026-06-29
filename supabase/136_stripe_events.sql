-- 136 — Stripe webhook idempotency. Stripe delivers events at-least-once (it retries when it doesn't get a
-- prompt 2xx). Without dedupe, a retried checkout.session.completed writes a second "customer_paid" AR row
-- and overstates collections. We record each processed event id here and skip any we've already handled.
create table if not exists public.stripe_events (
  id          text primary key,   -- Stripe event id (evt_…)
  type        text,
  received_at timestamptz not null default now()
);

comment on table public.stripe_events is 'Processed Stripe webhook event ids — idempotency guard so retried deliveries are not double-counted in AR.';
