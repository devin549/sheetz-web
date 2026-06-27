-- 121 — Per-barcode vendor pricing. Each barcode is really a VENDOR's offering of the part (Everbilt @
-- Home Depot $1.98, Oatey @ Lowe's $2.40). So an item rolls up to an AVG across barcodes, a per-vendor
-- breakdown, and a CHEAPEST — and the cheapest is what the shop sheet orders from.
alter table public.pricebook_barcodes add column if not exists unit_price       numeric(12,2);
alter table public.pricebook_barcodes add column if not exists vendor_url       text;
alter table public.pricebook_barcodes add column if not exists price_checked_at timestamptz;
