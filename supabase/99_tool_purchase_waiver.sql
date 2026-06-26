-- Bypass / waiver for tool purchase plans: sometimes the company approves a tool to just STAY ON THE VAN as
-- company gear — no weekly payroll deduction. `waived = true` means company-owned, assigned to the van/tech,
-- and the weekly deduction run skips it. Independent + idempotent (safe whether or not 98 has been applied).
alter table public.tool_purchases add column if not exists waived boolean not null default false;
