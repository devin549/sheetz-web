// Import registry — every importable source as PURE DATA, so one engine (lib/importEngine.js) + one
// page (/import) drive them all. Adding a new source = adding an entry here (no new code).
//
// Each kind:
//   id, label, icon, blurb — UI
//   cap        — role capability required (lib/roles.js can(role, cap))
//   table      — target Supabase table
//   mode       — 'upsert' (DB upsert on a UNIQUE key) | 'insert' (app-level dedupe on key, no unique index)
//   key        — the conflict/dedupe column
//   defaults   — constant columns written on every row
//   link       — optional FK resolve: { from, table, on, set } → look up `from` in `table.on`, write `set`
//   fields     — { key, label, syn[] (header synonyms), type (text|money|date|bool|int), required? }
//
// Column lists are kept to CONFIRMED columns for each table (a wrong column errors the insert).

export const IMPORT_KINDS = [
  {
    id: 'customers', label: 'Customers', icon: 'users', cap: 'seeFinancials',
    blurb: 'Customer list from ServiceTitan (or any CSV). Upserts on the ST Customer ID so re-imports never duplicate.',
    table: 'customers', mode: 'upsert', key: 'st_customer_id',
    fields: [
      { key: 'st_customer_id', label: 'ST Customer ID', syn: ['customer id', 'st customer id', 'account #', 'account number', 'customer #'], type: 'text', required: true },
      { key: 'name', label: 'Name', syn: ['customer name', 'customer', 'name', 'account', 'client'], type: 'text', required: true },
      { key: 'type', label: 'Type', syn: ['customer type', 'type'], type: 'text' },
      { key: 'phone', label: 'Phone', syn: ['phone number', 'phone', 'mobile', 'cell'], type: 'text' },
      { key: 'email', label: 'Email', syn: ['e-mail', 'email'], type: 'text' },
      { key: 'address', label: 'Address', syn: ['address', 'street', 'bill to', 'billing address'], type: 'text' },
      { key: 'tags', label: 'Tags', syn: ['tags', 'tag'], type: 'text' },
      { key: 'do_not_mail', label: 'Do not mail', syn: ['do not mail', 'dnm'], type: 'bool' },
      { key: 'do_not_service', label: 'Do not service', syn: ['do not service', 'dns'], type: 'bool' },
      { key: 'lifetime_revenue', label: 'Lifetime $', syn: ['lifetime revenue', 'total revenue', 'lifetime value'], type: 'money' },
      { key: 'lifetime_jobs', label: 'Lifetime jobs', syn: ['lifetime jobs', 'total jobs', '# jobs'], type: 'int' },
      { key: 'lifetime_invoices', label: 'Lifetime invoices', syn: ['lifetime invoices', 'total invoices'], type: 'int' },
    ],
  },
  {
    id: 'invoices', label: 'AR / Invoices', icon: 'list', cap: 'seeFinancials',
    blurb: 'Invoices / accounts-receivable export. Upserts on the ST Invoice ID and links each to its customer by ST Customer ID.',
    table: 'invoices', mode: 'upsert', key: 'st_invoice_id', defaults: { status: 'open' },
    link: { from: 'st_customer_id', table: 'customers', on: 'st_customer_id', set: 'customer_id' },
    fields: [
      { key: 'st_invoice_id', label: 'ST Invoice ID', syn: ['invoice id', 'st invoice id', 'doc id'], type: 'text', required: true },
      { key: 'invoice_number', label: 'Invoice #', syn: ['invoice #', 'invoice number', 'invoice', 'inv #', 'doc #'], type: 'text' },
      { key: 'invoice_date', label: 'Invoice date', syn: ['invoice date', 'inv date', 'date'], type: 'date' },
      { key: 'st_customer_id', label: 'ST Customer ID', syn: ['customer id', 'st customer id', 'account #'], type: 'text' },
      { key: 'total', label: 'Total', syn: ['invoice total', 'total', 'original amount'], type: 'money' },
      { key: 'balance', label: 'Balance', syn: ['total due', 'balance', 'open balance', 'amount due', 'amount'], type: 'money' },
      { key: 'business_unit', label: 'Business unit', syn: ['business unit', 'bu'], type: 'text' },
      { key: 'location', label: 'Location', syn: ['location', 'service location', 'job site'], type: 'text' },
      { key: 'city', label: 'City', syn: ['city', 'town'], type: 'text' },
      { key: 'street', label: 'Street', syn: ['street', 'address'], type: 'text' },
      { key: 'zip', label: 'Zip', syn: ['zip', 'postal'], type: 'text' },
      { key: 'notes', label: 'Notes', syn: ['notes', 'memo', 'note'], type: 'text' },
    ],
  },
  {
    id: 'vendors', label: 'Vendors', icon: 'list', cap: 'manageInventory',
    blurb: 'Vendor / supplier list. Skips a vendor whose name is already on file (no duplicates).',
    table: 'vendors', mode: 'insert', key: 'name',
    fields: [
      { key: 'name', label: 'Vendor name', syn: ['vendor name', 'vendor', 'supplier', 'name', 'company'], type: 'text', required: true },
      { key: 'account_no', label: 'Account #', syn: ['account #', 'account no', 'account number', 'acct'], type: 'text' },
      { key: 'rep', label: 'Rep', syn: ['rep', 'sales rep', 'contact'], type: 'text' },
      { key: 'phone', label: 'Phone', syn: ['phone number', 'phone'], type: 'text' },
      { key: 'email', label: 'Email', syn: ['e-mail', 'email'], type: 'text' },
      { key: 'terms', label: 'Terms', syn: ['terms', 'payment terms'], type: 'text' },
      { key: 'note', label: 'Note', syn: ['note', 'notes', 'memo'], type: 'text' },
    ],
  },
  {
    id: 'parts', label: 'Parts catalog', icon: 'list', cap: 'manageInventory',
    blurb: 'Vendor parts / pricebook catalog. Upserts on SKU so a re-imported catalog updates prices in place.',
    table: 'pricebook_items', mode: 'upsert', key: 'sku',
    fields: [
      { key: 'sku', label: 'SKU', syn: ['sku', 'item #', 'part #', 'part number', 'item code', 'code'], type: 'text', required: true },
      { key: 'name', label: 'Name', syn: ['name', 'item', 'description', 'item name', 'part name'], type: 'text', required: true },
      { key: 'manufacturer', label: 'Manufacturer', syn: ['manufacturer', 'brand', 'mfr', 'make'], type: 'text' },
      { key: 'manufacturer_part_number', label: 'Mfr part #', syn: ['manufacturer part number', 'mfr part #', 'mpn'], type: 'text' },
      { key: 'estimated_material_cost', label: 'Cost', syn: ['cost', 'our cost', 'unit cost', 'material cost', 'price'], type: 'money' },
      { key: 'retail_price', label: 'Retail price', syn: ['retail price', 'retail', 'list price', 'sell price'], type: 'money' },
      { key: 'short_description', label: 'Short description', syn: ['short description', 'desc'], type: 'text' },
      { key: 'customer_description', label: 'Customer description', syn: ['customer description', 'long description'], type: 'text' },
    ],
  },
];

export const getKind = (id) => IMPORT_KINDS.find((k) => k.id === id) || null;

// Serializable metadata for the client (everything here is plain data already, but this is the
// explicit contract for what the page hands to the browser).
export const kindMeta = (k) => ({ id: k.id, label: k.label, icon: k.icon, blurb: k.blurb, mode: k.mode, key: k.key, cap: k.cap, fields: k.fields });
