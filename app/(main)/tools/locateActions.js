'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { searchTools } from '@/lib/tools';
import { resolveInventory } from '@/lib/inventoryLocate';
import { createAlert } from '@/lib/alerts';
import { SHOPS } from '@/lib/shops';

const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();
const clean = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  return { user, profile: await loadProfile(user), sb: getSupabaseAdmin() };
}

// Build the location indexes (tech GPS / shops / vendors) the resolver needs.
async function buildIndexes(sb) {
  const techByKey = new Map(), shopById = new Map(), vendorById = new Map();
  try { const { data } = await sb.from('tech_locations').select('tech_name, tech_id, lat, lng, battery, status, updated_at'); (data || []).forEach((r) => { const rec = { ...r, ageMin: r.updated_at ? Math.round((Date.now() - Date.parse(r.updated_at)) / 60000) : null }; if (r.tech_id) techByKey.set(String(r.tech_id), rec); if (r.tech_name) techByKey.set(lc(r.tech_name), rec); }); } catch (_) {}
  try { const { data } = await sb.from('shops').select('id, name, address, lat, lng, phone'); (data || []).forEach((s) => { shopById.set(String(s.id), s); shopById.set(lc(s.name), s); }); } catch (_) {}
  if (shopById.size === 0) SHOPS.forEach((s) => { const rec = { name: s.label, address: s.address }; shopById.set(s.id, rec); shopById.set(lc(s.label), rec); }); // seed fallback
  try { const { data } = await sb.from('vendors').select('id, name, address, lat, lng, phone, hours'); (data || []).forEach((v) => { vendorById.set(String(v.id), v); vendorById.set(lc(v.name), v); }); } catch (_) {}
  return { techByKey, shopById, vendorById };
}

// Search a tool/part and resolve every match to a physical location, ranked fastest-available.
export async function locateInventory(query, lat, lng, jobId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const q = clean(query, 80);
  const origin = (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) ? { lat: Number(lat), lng: Number(lng) } : null;

  let tools = [];
  try { const r = await searchTools(c.sb, q); tools = r.tools || []; } catch (_) {}
  let parts = [];
  try { let pq = c.sb.from('item_locations').select('*'); if (q) pq = pq.ilike('name', `%${q}%`); const { data } = await pq.limit(100); parts = data || []; } catch (_) {}

  const idx = await buildIndexes(c.sb);
  const results = resolveInventory({ tools, parts, origin, query: q, ...idx });
  return { ok: true, results: results.slice(0, 40), hasOrigin: !!origin };
}

// Reserve + route: tie the item to the current job, notify the holder/shop, and post a dispatch tray note.
// Returns the Maps URL the client opens. Never texts the customer.
export async function reserveAndRoute(payload) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const p = payload || {};
  const jobId = clean(p.jobId, 60) || null;
  const kind = p.kind === 'part' ? 'part' : 'tool';
  const holderType = clean(p.holderType, 20) || 'unknown';
  const status = holderType === 'tech' ? 'pickup_pending' : 'reserved';
  const techName = c.profile.name || c.user.email;

  const row = {
    job_id: jobId, item_kind: kind, item_id: clean(p.itemId, 60) || null, item_name: clean(p.itemName, 160),
    qty: Number(p.qty) || 1, requested_by: c.user.id, requested_by_name: techName,
    holder_type: holderType, holder_id: clean(p.holderId, 60) || null, holder_name: clean(p.holderName, 160) || null,
    status, eta_min: Math.max(0, Math.round(Number(p.etaMin) || 0)) || null, note: clean(p.note, 300) || null,
  };
  const { data, error } = await c.sb.from('inventory_reservations').insert(row).select('id').maybeSingle();
  if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/89_inventory_locate.sql first.' : error.message };

  // Mark a serialized tool reserved so it stops ranking as available.
  if (kind === 'tool' && row.item_id) { try { await c.sb.from('tools').update({ status: 'reserved' }).eq('id', row.item_id); } catch (_) {} }

  const jobLabel = jobId ? `job #${jobId.slice(0, 8)}` : 'a job';
  const etaTxt = row.eta_min ? ` · ETA ~${row.eta_min}m` : '';
  // Notify the HOLDER (other tech / shop) — in-app task first (P4), never an auto-text.
  if (holderType === 'tech' || holderType === 'shop') {
    await createAlert(c.sb, {
      kind: holderType === 'shop' ? 'oncall_unclaimed' : 'no_status', // reuse a registered kind for routing/severity
      entity: holderType === 'tech' ? 'tech' : 'shop', entityId: row.holder_id || row.item_id,
      title: holderType === 'shop' ? `Pull request: ${row.item_name}` : `${techName} is coming for ${row.item_name}`,
      body: holderType === 'shop'
        ? `${techName} is coming for ${row.item_name} for ${jobLabel}${etaTxt}. ${row.bin ? 'Bin ' + row.bin + '. ' : ''}Have it ready.`
        : `${techName} is on the way to pick up ${row.item_name} for ${jobLabel}${etaTxt}. Accept or flag a problem.`,
      severity: 'med', dedupeKey: `pickup:${data?.id || row.item_id}`, meta: { reservation: data?.id, job_id: jobId },
    });
  }
  // Dispatch tray note.
  await createAlert(c.sb, { kind: 'route_swap', entity: 'job', entityId: jobId || row.item_id, title: `Tool pickup in progress: ${row.item_name}`, body: `${techName} picking up ${row.item_name} for ${jobLabel}${etaTxt}. Watch the next job for delay.`, severity: 'low', dedupeKey: `pickup-tray:${data?.id || row.item_id}` });

  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: techName, role: c.profile.role, action: 'inventory.reserved', entity: 'reservation', entity_id: String(data?.id || ''), detail: { kind, item: row.item_name, holderType, jobId } }); } catch (_) {}
  if (jobId) { revalidatePath(`/job/${jobId}`); }
  revalidatePath('/tools');
  return { ok: true, reservationId: data?.id, mapsUrl: clean(p.mapsUrl, 400), status };
}
