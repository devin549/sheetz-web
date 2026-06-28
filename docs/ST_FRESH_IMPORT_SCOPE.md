# ServiceTitan → Sheetz: fresh customer + invoice import — SCOPE (not built yet)

**Goal:** at go-live, pull one final ServiceTitan export and load the **complete book**
(every customer + every invoice, not just past-due) into Supabase, so the new system
starts with full history. Re-runnable and safe to repeat.

**Status:** SCOPED only. Foundations already exist (schema + a past-due importer). This
doc is the plan for extending that to the full book. Employees are NOT part of this — they
go through the `/team` "Add employee" flow.

---

## What already exists (we build on this, don't reinvent)

- **Customers table** is ST-aware (`supabase/02_customers_st_columns.sql`): `st_customer_id`
  (UNIQUE — the natural key), `type`, `phone`, `do_not_mail`, `do_not_service`, `tags`,
  `last_job_completed`, `lifetime_revenue`, `lifetime_jobs`, `lifetime_invoices`.
- **Invoices table** is ST-aware (`supabase/04_invoices_ar_columns.sql`): `st_invoice_id`
  (UNIQUE), `customer_id` (soft link), `st_customer_id`, `invoice_number`, `invoice_date`,
  `total`, `balance` (still owed), `business_unit`, `location`, `city/street/zip`, `notes`.
- **A working importer** for past-due AR: paste CSV → `previewImport` → `runImport`
  (`app/(main)/past-due/actions.js` + `import/ImportPanel.js`). Upserts customers on
  `st_customer_id`, invoices on `st_invoice_id`, links invoices→customers by ST id.
- **Bulk-load pattern** for big files: `scripts/import_pricebook.cjs` (read file → chunked
  upserts via service-role key). Use this shape for the full book (paste UI caps out).

**Because the keys are UNIQUE, every import is an UPSERT — re-running is safe** (no dupes).

---

## What to export from ServiceTitan (the inputs)

Pull these as CSV (Reports/Exports). Exact column names vary by ST report — we map them on
import, so don't worry about matching headers, just include the fields:

1. **Customer Export (ALL customers)** — name, ST Customer Id, type (residential/commercial),
   phone(s), email, billing address (street/city/state/zip), do-not-mail, do-not-service,
   tags, and lifetime fields if available.
2. **Invoice Export (ALL invoices, not just open AR)** — ST Invoice Id, Invoice #, date, ST
   Customer Id, total, balance, business unit, location, job # (if present), notes.
3. **(Already supported) AR Detail** — open balances. The current importer covers this; the
   full Invoice Export above is the superset.
4. **(Optional) Jobs / job history** — only if you want past jobs searchable on call-in.
   Decision below.

---

## Field mapping (ST → Supabase)

**Customers** (upsert on `st_customer_id`):
| ST field | → customers column |
|---|---|
| Customer Id | `st_customer_id` (key) |
| Name | `name` |
| Type | `type` |
| Phone | `phone` |
| Email | `email` |
| Address / City / Zip | `address` / `city` / `zip` (street fields) |
| Do Not Mail / Service | `do_not_mail` / `do_not_service` |
| Tags | `tags` |
| Lifetime revenue/jobs/invoices | `lifetime_*` |

**Invoices** (upsert on `st_invoice_id`, link to customer by `st_customer_id`):
| ST field | → invoices column |
|---|---|
| Invoice Id | `st_invoice_id` (key) |
| Invoice # | `invoice_number` |
| Date | `invoice_date` |
| Customer Id | `st_customer_id` → resolve to `customer_id` |
| Total | `total` |
| Balance | `balance` |
| Business Unit / Location | `business_unit` / `location` |
| City / Street / Zip | `city` / `street` / `zip` |
| Notes | `notes` |

Unmatched invoices (customer not found) still import (soft link) and can be re-linked later.

---

## Load mechanism (recommended)

- **Customers first, then invoices** (so invoices can resolve `customer_id` by ST id).
- **Volume decides the tool:**
  - A few hundred rows → the existing **paste-CSV UI** (extend it from past-due to full book).
  - Thousands (likely for the full book) → a **node script** (`scripts/import_st_book.cjs`)
    modeled on `import_pricebook.cjs`: read the CSV file, chunked upserts (500/batch),
    progress log, dry-run flag. Avoids paste-size limits and is re-runnable.
- **Idempotent:** upsert on the unique ST keys; a second run just updates, never dupes.

---

## Order of operations at cutover

1. Freeze ST (stop new work there) and pull the final exports.
2. Import **customers** (full export).
3. Import **invoices** (full export) — links to customers by ST id.
4. (Optional) Import **jobs/history**.
5. Spot-check totals: customer count, open-AR total vs ST's AR report, a few known accounts.
6. Employees are already in via `/team` (separate, ongoing).

---

## Decisions I need from you (before building)

1. **Invoice scope:** ALL invoices (full history) or only the last N years? Full history is
   heavier but gives complete call-in lookup.
2. **Jobs/history:** import past jobs too (searchable on call-in), or just customers+invoices?
3. **Volume:** rough customer + invoice counts → picks paste-UI vs node script.
4. **Export access:** can you pull the Customer Export + full Invoice Export from ST, or do we
   only have the AR Detail today? (Determines whether we need an ST API pull instead of CSV.)
5. **Timing:** when's the go-live freeze? The export must be the LAST thing before cutover so
   nothing's stranded in ST.

---

## Explicitly NOT in this import

- **Employees** — `/team` "Add employee" (login + roster + position + Discord), done by hand.
- **Pricebook** — already has its own importer (`scripts/import_pricebook.cjs`).
- **Live/open jobs in flight** — handle as a short manual cutover list, not a bulk load.

Related: [[project_servicetitan_exit_archive]] (the "export ST data now" plan this finishes).
