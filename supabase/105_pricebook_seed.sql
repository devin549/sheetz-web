-- Sheetz starter pricebook seed
-- Sample numbers only. Devin/Ronnie should approve live prices.

insert into public.pricebook_categories (name, slug, sort_order)
values
  ('Drain / Sewer', 'drain-sewer', 10),
  ('Camera / Locate', 'camera-locate', 20),
  ('Water Heater', 'water-heater', 30),
  ('Toilet', 'toilet', 40),
  ('Fixture / Faucet', 'fixture-faucet', 50),
  ('Pump', 'pump', 60),
  ('Excavation', 'excavation', 70),
  ('Membership', 'membership', 80),
  ('Commercial / Apartments', 'commercial-apartments', 90)
on conflict (slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = true;

insert into public.pricebook_items (
  category_id, sku, name, customer_name, short_description, customer_description,
  internal_notes, retail_price, minimum_price, estimated_material_cost,
  estimated_labor_hours, target_margin_pct, tags, job_types, warranty_text
)
select c.id, 'DRAIN-STD-UNCLG', 'Standard Drain Unclog', 'Drain cleaning service',
  'Clear accessible residential drain stoppage.',
  'Includes standard drain clearing through accessible cleanout or fixture opening.',
  'Pitch camera if recurring, slow main, roots, or customer mentions backups. Watch callback risk if no before/after proof.',
  491, 391, 45, 1.25, 62,
  array['drain','clog','kitchen','lav','tub','unclog'],
  array['drain unclog','sewer backup','kitchen clog'],
  'Workmanship warranty applies only to the cleared line section and excludes collapsed/broken piping.'
from public.pricebook_categories c where c.slug = 'drain-sewer'
on conflict (sku) do update set
  retail_price = excluded.retail_price,
  minimum_price = excluded.minimum_price,
  estimated_material_cost = excluded.estimated_material_cost,
  estimated_labor_hours = excluded.estimated_labor_hours,
  tags = excluded.tags,
  job_types = excluded.job_types;

insert into public.pricebook_items (
  category_id, sku, name, customer_name, short_description, customer_description,
  internal_notes, retail_price, minimum_price, estimated_material_cost,
  estimated_labor_hours, target_margin_pct, tags, job_types
)
select c.id, 'DRAIN-MAIN-CABLE', 'Main Line Cable', 'Main sewer cleaning',
  'Clear main sewer stoppage with cable machine.',
  'Includes main sewer cable service from accessible cleanout.',
  'Camera should be offered on root, sludge, repeated, or unknown obstruction calls.',
  691, 541, 65, 1.75, 62,
  array['mainline','sewer','backup','roots','cable'],
  array['main sewer','sewer backup','main line clog']
from public.pricebook_categories c where c.slug = 'drain-sewer'
on conflict (sku) do update set retail_price = excluded.retail_price, minimum_price = excluded.minimum_price;

insert into public.pricebook_items (
  category_id, sku, name, customer_name, short_description, customer_description,
  internal_notes, retail_price, minimum_price, estimated_material_cost,
  estimated_labor_hours, target_margin_pct, tags, job_types
)
select c.id, 'CAM-SEWER-INSPECT', 'Sewer Camera Inspection', 'Sewer camera inspection',
  'Inspect sewer or drain line with camera.',
  'Camera inspection to identify condition, blockage, roots, belly, break, or tie-in location.',
  'Attach video/photo proof. If locator used, tag locator usage so AI can learn bundle cost.',
  385, 285, 35, 0.75, 65,
  array['camera','sewer camera','seesnake','inspection','locator'],
  array['camera inspection','drain unclog','sewer backup']
from public.pricebook_categories c where c.slug = 'camera-locate'
on conflict (sku) do update set retail_price = excluded.retail_price, minimum_price = excluded.minimum_price;

insert into public.pricebook_items (
  category_id, sku, name, customer_name, short_description, customer_description,
  internal_notes, retail_price, minimum_price, estimated_material_cost,
  estimated_labor_hours, target_margin_pct, tags, job_types
)
select c.id, 'CAM-LOCATE', 'Line Locate', 'Line locating service',
  'Locate underground line path/depth.',
  'Line locating service using electronic locator where accessible.',
  'Commonly follows camera work. Track if this keeps being used with camera inspections.',
  275, 225, 20, 0.50, 70,
  array['locate','locator','yellow locator','red locator','utility'],
  array['camera inspection','excavation','sewer backup']
from public.pricebook_categories c where c.slug = 'camera-locate'
on conflict (sku) do update set retail_price = excluded.retail_price, minimum_price = excluded.minimum_price;

insert into public.pricebook_items (
  category_id, sku, name, customer_name, short_description, customer_description,
  internal_notes, retail_price, minimum_price, estimated_material_cost,
  estimated_labor_hours, target_margin_pct, tags, job_types
)
select c.id, 'WH-40-GAS-INSTALL', '40 Gallon Gas Water Heater Install', '40 gallon gas water heater replacement',
  'Replace standard 40 gallon natural gas water heater.',
  'Includes standard replacement of a 40 gallon natural gas water heater with basic code-required connections.',
  'Confirm venting, pan, expansion tank, shutoff, permit, haul away, and code upgrades.',
  2495, 2195, 980, 3.5, 55,
  array['water heater','40 gallon','gas','install','permit'],
  array['water heater install','no hot water','leaking water heater']
from public.pricebook_categories c where c.slug = 'water-heater'
on conflict (sku) do update set retail_price = excluded.retail_price, minimum_price = excluded.minimum_price;

insert into public.pricebook_items (
  category_id, sku, name, customer_name, short_description, customer_description,
  internal_notes, retail_price, minimum_price, estimated_material_cost,
  estimated_labor_hours, target_margin_pct, tags, job_types
)
select c.id, 'WH-50-GAS-INSTALL', '50 Gallon Gas Water Heater Install', '50 gallon gas water heater replacement',
  'Replace standard 50 gallon natural gas water heater.',
  'Includes standard replacement of a 50 gallon natural gas water heater with basic code-required connections.',
  'Watch material drift. Expansion tank and shutoff should not be forgotten.',
  2795, 2395, 1125, 3.75, 55,
  array['water heater','50 gallon','gas','install','permit'],
  array['water heater install','no hot water','leaking water heater']
from public.pricebook_categories c where c.slug = 'water-heater'
on conflict (sku) do update set retail_price = excluded.retail_price, minimum_price = excluded.minimum_price;

insert into public.pricebook_items (
  category_id, sku, name, customer_name, short_description, customer_description,
  internal_notes, retail_price, minimum_price, estimated_material_cost,
  estimated_labor_hours, target_margin_pct, tags, job_types
)
select c.id, 'TOILET-RESET', 'Toilet Pull and Reset', 'Toilet pull and reset',
  'Pull, reset, and seal toilet.',
  'Includes pulling and resetting toilet with new wax/seal where flange condition allows.',
  'AI should watch for wax ring, bolts, supply line, flange repair add-ons.',
  385, 295, 35, 1.0, 65,
  array['toilet','wax ring','reset','flange'],
  array['toilet leak','toilet repair','wax ring']
from public.pricebook_categories c where c.slug = 'toilet'
on conflict (sku) do update set retail_price = excluded.retail_price, minimum_price = excluded.minimum_price;

insert into public.pricebook_items (
  category_id, sku, name, customer_name, short_description, customer_description,
  internal_notes, retail_price, minimum_price, estimated_material_cost,
  estimated_labor_hours, target_margin_pct, tags, job_types
)
select c.id, 'TOILET-FLAPPER', 'Toilet Flapper / Minor Tank Repair', 'Toilet tank repair',
  'Repair common toilet tank component failure.',
  'Includes replacement of common tank part such as flapper or fill valve when accessible.',
  'Track Korky/Fluidmaster names as aliases.',
  185, 145, 18, 0.5, 70,
  array['toilet','flapper','fill valve','korky','fluidmaster'],
  array['running toilet','toilet repair']
from public.pricebook_categories c where c.slug = 'toilet'
on conflict (sku) do update set retail_price = excluded.retail_price, minimum_price = excluded.minimum_price;

insert into public.pricebook_items (
  category_id, sku, name, customer_name, short_description, customer_description,
  internal_notes, retail_price, minimum_price, estimated_material_cost,
  estimated_labor_hours, target_margin_pct, tags, job_types
)
select c.id, 'CB-MEMBERSHIP', 'Clog Busterz Membership', 'Clog Busterz membership',
  'Membership option for repeat customers.',
  'Includes member benefits, priority reminders, and eligible savings according to current program rules.',
  'Attach current membership PDF and office rules before launch.',
  149, 149, 0, 0.15, 90,
  array['membership','club','savings','maintenance'],
  array['any job','follow up']
from public.pricebook_categories c where c.slug = 'membership'
on conflict (sku) do update set retail_price = excluded.retail_price, minimum_price = excluded.minimum_price;

insert into public.pricebook_bundles (slug, name, job_type, description, target_margin_pct)
values
  ('drain-unclog-starter', 'Drain Unclog Starter', 'drain unclog', 'Standard drain clearing with camera/membership upsell options.', 62),
  ('main-sewer-backup', 'Main Sewer Backup', 'sewer backup', 'Main cable, camera, locate, and escalation path.', 62),
  ('water-heater-install', 'Water Heater Install', 'water heater install', 'Water heater replacement with permit/code upgrade checks.', 55),
  ('toilet-repair', 'Toilet Repair', 'toilet repair', 'Toilet reset and common tank repair options.', 65)
on conflict (slug) do update set
  name = excluded.name,
  job_type = excluded.job_type,
  description = excluded.description,
  target_margin_pct = excluded.target_margin_pct,
  active = true;

insert into public.pricebook_bundle_items (bundle_id, item_id, quantity, required_or_optional, sort_order)
select b.id, i.id, 1, 'required', 10
from public.pricebook_bundles b
join public.pricebook_items i on i.sku = 'DRAIN-STD-UNCLG'
where b.slug = 'drain-unclog-starter'
on conflict (bundle_id, item_id) do update set required_or_optional = excluded.required_or_optional;

insert into public.pricebook_bundle_items (bundle_id, item_id, quantity, required_or_optional, sort_order)
select b.id, i.id, 1, 'upsell', 20
from public.pricebook_bundles b
join public.pricebook_items i on i.sku = 'CAM-SEWER-INSPECT'
where b.slug = 'drain-unclog-starter'
on conflict (bundle_id, item_id) do update set required_or_optional = excluded.required_or_optional;

insert into public.pricebook_bundle_items (bundle_id, item_id, quantity, required_or_optional, sort_order)
select b.id, i.id, 1, 'upsell', 30
from public.pricebook_bundles b
join public.pricebook_items i on i.sku = 'CB-MEMBERSHIP'
where b.slug = 'drain-unclog-starter'
on conflict (bundle_id, item_id) do update set required_or_optional = excluded.required_or_optional;

-- ── CB: Good / Better / Best customer ladder for the drain bundle ($491 / $876 / $1,025) ───────────────
update public.pricebook_bundles set
  good_option_name   = 'Clear It Today',
  better_option_name = 'Clear + Inspect',
  best_option_name   = 'Fix + Protect',
  good_best_for      = 'You just want it draining again today.',
  better_best_for    = 'You want it cleared AND a camera to see why — so it doesn''t come back.',
  best_best_for      = 'You want it fixed, scoped, and protected against the next one.',
  customer_description = 'We''ll get your drain flowing again. Choose how far you want us to go — clear it, see what caused it, or protect it for the long haul.',
  warranty_text      = 'Workmanship warranty on the cleared line. Ask us about the full coverage on the protected option.',
  approval_button_text = 'Approve & Schedule'
where slug = 'drain-unclog-starter';

-- Tier membership: Good = base drain; Better = + camera; Best = + camera + membership.
update public.pricebook_bundle_items bi set tiers = array['good','better','best']
  from public.pricebook_bundles b, public.pricebook_items i
  where bi.bundle_id = b.id and bi.item_id = i.id and b.slug = 'drain-unclog-starter' and i.sku = 'DRAIN-STD-UNCLG';
update public.pricebook_bundle_items bi set tiers = array['better','best']
  from public.pricebook_bundles b, public.pricebook_items i
  where bi.bundle_id = b.id and bi.item_id = i.id and b.slug = 'drain-unclog-starter' and i.sku = 'CAM-SEWER-INSPECT';
update public.pricebook_bundle_items bi set tiers = array['best']
  from public.pricebook_bundles b, public.pricebook_items i
  where bi.bundle_id = b.id and bi.item_id = i.id and b.slug = 'drain-unclog-starter' and i.sku = 'CB-MEMBERSHIP';

insert into public.pricebook_item_aliases (item_id, phrase, source, confidence)
select i.id, phrase, 'starter_seed', 100
from public.pricebook_items i
cross join (values
  ('seesnake'),
  ('see snake'),
  ('big reel'),
  ('sewer camera'),
  ('camera reel'),
  ('rigid camera'),
  ('ridgid camera')
) as aliases(phrase)
where i.sku = 'CAM-SEWER-INSPECT'
on conflict (item_id, phrase) do nothing;

insert into public.pricebook_item_aliases (item_id, phrase, source, confidence)
select i.id, phrase, 'starter_seed', 100
from public.pricebook_items i
cross join (values
  ('yellow locator'),
  ('red locator'),
  ('locator'),
  ('line finder')
) as aliases(phrase)
where i.sku = 'CAM-LOCATE'
on conflict (item_id, phrase) do nothing;

insert into public.pricebook_item_aliases (item_id, phrase, source, confidence)
select i.id, phrase, 'starter_seed', 100
from public.pricebook_items i
cross join (values
  ('korky flapper'),
  ('flapper'),
  ('toilet guts'),
  ('fill valve'),
  ('fluidmaster')
) as aliases(phrase)
where i.sku = 'TOILET-FLAPPER'
on conflict (item_id, phrase) do nothing;

