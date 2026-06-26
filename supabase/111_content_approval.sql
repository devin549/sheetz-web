-- 2-step approval for the content engine: marketing drafts + submits; only the OWNER approves to publish.
-- Nothing reaches the website without the owner's yes. Additive.
alter table public.content_ideas add column if not exists submitted   boolean not null default false;  -- marketing sent it up for approval
alter table public.content_ideas add column if not exists approved_by text;        -- who gave the final yes
alter table public.content_ideas add column if not exists approved_at timestamptz;
