// Generic CSV import engine — one parser + column-matcher + row-builder that every import "kind"
// (lib/importKinds.js) drives. Pure functions (no DB, no 'use server') so they're shared by the
// preview + run server actions and are unit-testable. Generalized from the past-due AR importer.

// RFC-ish CSV parser: handles quoted fields, escaped quotes, CRLF, and stray leading tabs.
export function parseCsv(text) {
  const s = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = []; let row = []; let field = ''; let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) { if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; continue; }
    if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\t' && !field && !row.length) { /* tolerate a leading tab */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

// Coerce a raw cell to the field's type. Returns null for empty/unparseable (so we don't write junk).
export function coerce(value, type) {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return null;
  switch (type) {
    case 'money': { const n = Number(raw.replace(/[$,()\s]/g, '')); return Number.isFinite(n) ? n : null; }
    case 'int': { const n = parseInt(raw.replace(/[,\s]/g, ''), 10); return Number.isFinite(n) ? n : null; }
    case 'date': { const t = new Date(raw); return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10); }
    case 'bool': { if (/^(y|yes|true|1|x|✓)$/i.test(raw)) return true; if (/^(n|no|false|0)$/i.test(raw)) return false; return null; }
    default: return raw; // text
  }
}

// Match each field to a header column by its synonyms — exact match first, then substring.
// Returns { idx: {fieldKey: columnIndex}, headers, missingRequired: [labels] }.
export function mapColumns(kind, headers) {
  const h = (headers || []).map((x) => String(x).toLowerCase().trim());
  const find = (syn) => {
    for (const k of syn) { const i = h.findIndex((x) => x === k); if (i >= 0) return i; }
    for (const k of syn) { const i = h.findIndex((x) => x.includes(k)); if (i >= 0) return i; }
    return -1;
  };
  const idx = {}; const missingRequired = [];
  for (const f of kind.fields) {
    const i = find([f.key.replace(/_/g, ' '), ...(f.syn || [])]);
    if (i >= 0) idx[f.key] = i;
    else if (f.required) missingRequired.push(f.label);
  }
  return { idx, headers: headers || [], missingRequired };
}

// Build target-row objects from the data rows using the column map + per-field coercion + constant
// defaults. Skips rows missing a required field or (for upsert kinds) the conflict key.
export function buildRows(kind, dataRows, idx) {
  const objects = []; const skipped = { missingRequired: 0, noKey: 0, empty: 0 };
  const byKey = kind.fields.reduce((m, f) => { m[f.key] = f; return m; }, {});
  for (const r of dataRows) {
    const obj = {};
    let bad = false;
    for (const key of Object.keys(idx)) {
      const f = byKey[key];
      const val = coerce(r[idx[key]], f.type);
      if (val == null) { if (f.required) bad = true; continue; }
      obj[key] = val;
    }
    if (bad) { skipped.missingRequired++; continue; }
    if (!Object.keys(obj).length) { skipped.empty++; continue; }
    // upsert kinds need their conflict key present, else the row can't dedupe → skip it
    if (kind.mode === 'upsert' && (obj[kind.key] == null || obj[kind.key] === '')) { skipped.noKey++; continue; }
    Object.assign(obj, kind.defaults || {});
    objects.push(obj);
  }
  return { objects, skipped };
}

// A human-readable "field → matched header" map for the preview UI.
export function mappingSummary(kind, headers, idx) {
  return kind.fields.map((f) => ({ field: f.label, key: f.key, required: !!f.required, header: idx[f.key] != null ? headers[idx[f.key]] : null }));
}
