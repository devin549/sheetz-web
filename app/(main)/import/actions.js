'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { getKind } from '@/lib/importKinds';
import { parseCsv, mapColumns, buildRows, mappingSummary } from '@/lib/importEngine';
import { revalidatePath } from 'next/cache';

// Gate per KIND: a server action is a public RPC, so re-check the caller has this kind's capability.
async function gate(kindId) {
  const kind = getKind(kindId);
  if (!kind) return { err: 'Unknown import type.' };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!profile || profile.active === false || !can(profile.role, kind.cap)) return { err: `Your role can’t import ${kind.label.toLowerCase()}.` };
  const sb = getSupabaseAdmin();
  if (!sb) return { err: 'Server not configured (SUPABASE_SERVICE_ROLE_KEY missing).' };
  return { kind, sb, who: user.email || '' };
}

// PREVIEW — parse + match columns + build rows. No writes. Shows the operator exactly what will land.
export async function previewKind(kindId, csv) {
  const g = await gate(kindId);
  if (g.err) return { ok: false, msg: g.err };
  const { kind } = g;
  const rows = parseCsv(csv);
  if (rows.length < 2) return { ok: false, msg: 'Paste a header row + at least one data row.' };
  const map = mapColumns(kind, rows[0]);
  if (map.missingRequired.length) return { ok: false, msg: `Couldn’t find a column for: ${map.missingRequired.join(', ')}. Headers seen: ${rows[0].join(' | ')}` };
  const built = buildRows(kind, rows.slice(1), map.idx);
  const keys = new Set(built.objects.map((o) => o[kind.key]).filter((v) => v != null));
  return {
    ok: true,
    label: kind.label,
    mapping: mappingSummary(kind, rows[0], map.idx),
    totalDataRows: rows.length - 1,
    willWrite: built.objects.length,
    distinctKeys: keys.size,
    skipped: built.skipped,
    sample: built.objects.slice(0, 6),
    mode: kind.mode,
    keyLabel: (kind.fields.find((f) => f.key === kind.key) || {}).label || kind.key,
  };
}

// RUN — resolve any FK link, then write: UPSERT on the unique key, or INSERT with app-level dedupe.
export async function runKind(kindId, csv) {
  const g = await gate(kindId);
  if (g.err) return { ok: false, msg: g.err };
  const { kind, sb } = g;
  const rows = parseCsv(csv);
  if (rows.length < 2) return { ok: false, msg: 'Nothing to import.' };
  const map = mapColumns(kind, rows[0]);
  if (map.missingRequired.length) return { ok: false, msg: `Missing required column(s): ${map.missingRequired.join(', ')}.` };
  let { objects } = buildRows(kind, rows.slice(1), map.idx);
  if (!objects.length) return { ok: false, msg: 'No valid rows to import (check the required columns).' };

  // FK link: resolve e.g. invoices.st_customer_id → customers.customer_id.
  let linked = 0, unlinked = 0;
  if (kind.link) {
    const froms = [...new Set(objects.map((o) => o[kind.link.from]).filter(Boolean))];
    const toId = {};
    for (let i = 0; i < froms.length; i += 300) {
      const { data } = await sb.from(kind.link.table).select(`id, ${kind.link.on}`).in(kind.link.on, froms.slice(i, i + 300));
      (data || []).forEach((r) => { if (r[kind.link.on] != null) toId[String(r[kind.link.on])] = r.id; });
    }
    objects.forEach((o) => { const k = o[kind.link.from] != null ? String(o[kind.link.from]) : null; if (k && toId[k]) { o[kind.link.set] = toId[k]; linked++; } else if (k) unlinked++; });
  }

  let written = 0, skippedExisting = 0; let firstErr = null;
  if (kind.mode === 'upsert') {
    for (let i = 0; i < objects.length; i += 500) {
      const { error, count } = await sb.from(kind.table).upsert(objects.slice(i, i + 500), { onConflict: kind.key, count: 'estimated' });
      if (error) { firstErr = firstErr || error.message; } else written += objects.slice(i, i + 500).length;
    }
  } else {
    // INSERT with dedupe: skip rows whose key already exists (and dups within the file).
    const vals = [...new Set(objects.map((o) => o[kind.key]).filter(Boolean))];
    const existing = new Set();
    for (let i = 0; i < vals.length; i += 300) {
      const { data } = await sb.from(kind.table).select(kind.key).in(kind.key, vals.slice(i, i + 300));
      (data || []).forEach((r) => existing.add(String(r[kind.key])));
    }
    const seen = new Set();
    const fresh = objects.filter((o) => {
      const v = o[kind.key] != null ? String(o[kind.key]) : null;
      if (v && (existing.has(v) || seen.has(v))) { skippedExisting++; return false; }
      if (v) seen.add(v);
      return true;
    });
    for (let i = 0; i < fresh.length; i += 500) {
      const { error } = await sb.from(kind.table).insert(fresh.slice(i, i + 500));
      if (error) { firstErr = firstErr || error.message; } else written += fresh.slice(i, i + 500).length;
    }
  }

  if (firstErr && !written) return { ok: false, msg: 'Import failed: ' + firstErr };
  revalidatePath('/import');
  return { ok: true, written, skippedExisting, linked: kind.link ? linked : undefined, unlinked: kind.link ? unlinked : undefined, warn: firstErr || null };
}
