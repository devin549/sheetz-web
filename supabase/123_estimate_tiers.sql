-- Good/Better/Best on the CUSTOMER close. Until now the customer-facing estimate (`/e/[token]`) only ever
-- received the ONE tier the tech pre-picked — flattened to `lines` + `subtotal`. The buyer never saw the
-- ladder, so the compromise effect (most people pick the middle) never fired. This adds the full 3-tier
-- snapshot to the estimate so the ladder reaches the customer's thumb, and records which tier they chose.
--
-- BACKWARD-COMPATIBLE: `tiers` defaults to [] → old single-tier links keep rendering the flat view exactly
-- as before. `lines`/`subtotal` still hold the active/selected tier (the approval→usage conversion path is
-- unchanged). NO price moves here — structure + presentation only; the owner remains the only price-mover.
alter table public.pricebook_estimates
  add column if not exists tiers              jsonb not null default '[]'::jsonb,  -- [{key,name,icon,pitch,bestFor,warranty,includes:[],lines:[{name,description,price,photo,...}],subtotal,recommended}]
  add column if not exists selected_tier_key  text;                                 -- which tier the customer chose at the close ('good'|'better'|'best')
