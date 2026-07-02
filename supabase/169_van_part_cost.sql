-- 169 — van parts learn their COST. useFromVan was logging every van part onto the job's PO at $0
-- (unit_cost_cents hardcoded 0) — parts billed as free and vanished from margin. Load-out now captures
-- cost-each into this column; moment-of-use bills it onto the job (fallback: the last shop-issue price
-- for the same SKU). NULL = unknown (old rows) — the app falls back, never blocks a scan.
alter table public.truck_inventory add column if not exists unit_cost_cents bigint;
