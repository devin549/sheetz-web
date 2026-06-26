'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { searchTools } from '@/lib/tools';
import { resolveInventory } from '@/lib/inventoryLocate';
import { createAlert } from '@/lib/alerts';
import { SHOPS } from '@/lib/shops';
import { geocodeAddress, driveMatrix } from '@/lib/maps';
import { nextSegmentNo } from '@/lib/segments';

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
  try { const { data } = await sb.from('shops').select('id, name, address, lat, lng, phone'); for (const s of (data || [])) { await geocodeMissing(sb, 'shops', s); shopById.set(String(s.id), s); shopById.set(lc(s.name), s); } } catch (_) {}
  if (shopById.size === 0) SHOPS.forEach((s) => { const rec = { name: s.label, address: s.address }; shopById.set(s.id, rec); shopById.set(lc(s.label), rec); }); // seed fallback (addresses only)
  try { const { data } = await sb.from('vendors').select('id, name, address, lat, lng, phone, hours'); for (const v of (data || [])) { await geocodeMissing(sb, 'vendors', v); vendorById.set(String(v.id), v); vendorById.set(lc(v.name), v); } } catch (_) {}
  return { techByKey, shopById, vendorById };
}

// Geocode a fixed location ONCE and cache lat/lng back to its row (so we don't re-hit Google every search).
async function geocodeMissing(sb, table, row) {
  if (!row || !row.address || (Number.isFinite(row.lat) && Number.isFinite(row.lng))) return;
  const g = await geocodeAddress(row.address);
  if (!g) return;
  row.lat = g.lat; row.lng = g.lng;
  try { await sb.from(table).update({ lat: g.lat, lng: g.lng }).eq('id', row.id); } catch (_) {}
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
  let results = resolveInventory({ tools, parts, origin, query: q, ...idx });

  // Upgrade the haversine estimate to REAL drive time via Distance Matrix (traffic-aware), then re-rank by
  // it. Fail-soft: no key / Google error → keep the straight-line estimate the resolver already computed.
  if (origin) {
    const top = results.filter((r) => r.hasCoords).slice(0, 24); // cap API cost
    const matrix = await driveMatrix(origin, top.map((r) => ({ lat: r.lat, lng: r.lng })));
    if (matrix) {
      top.forEach((r, i) => { if (matrix[i]) { r.distanceMi = matrix[i].distanceMi ?? r.distanceMi; r.etaMin = matrix[i].etaMin ?? r.etaMin; r.driveReal = true; } });
      const cRank = { high: 0, med: 1, low: 2 };
      results.sort((a, b) => (a.available ? 0 : 1) - (b.available ? 0 : 1) || (a.etaMin == null) - (b.etaMin == null) || (a.etaMin ?? 1e9) - (b.etaMin ?? 1e9) || (cRank[a.confidence] ?? 3) - (cRank[b.confidence] ?? 3));
      results.forEach((r) => { r.best = false; });
      const best = results.find((r) => r.available && r.hasCoords); if (best) best.best = true;
    }
  }
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

  // Job costing — start a Parts Run / Tool Pickup SEGMENT on the job so the drive time attaches as labor
  // (the margin watcher already rolls receipts + segment labor into the parent). Reuses the P8 segment model.
  if (jobId) {
    try {
      let parentNumber = ''; try { const { data: pj } = await c.sb.from('jobs').select('job_number').eq('id', jobId).maybeSingle(); parentNumber = pj?.job_number || ''; } catch (_) {}
      let count = 0; try { const { count: n } = await c.sb.from('job_segments').select('id', { count: 'exact', head: true }).eq('parent_job_id', jobId); count = n || 0; } catch (_) {}
      await c.sb.from('job_segments').insert({
        parent_job_id: jobId, segment_no: nextSegmentNo(parentNumber, count), kind: 'parts_run',
        assigned_tech_id: c.profile.tech_id || null, assigned_tech_name: techName,
        reason: `${kind === 'tool' ? 'Tool pickup' : 'Parts run'}: ${row.item_name}${row.holder_name ? ' @ ' + row.holder_name : ''}`,
        status: 'active', started_at: new Date().toISOString(), created_by: c.user.id, created_by_name: techName,
        notes: jobLabel + etaTxt,
      });
    } catch (_) {}
  }

  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: techName, role: c.profile.role, action: 'inventory.reserved', entity: 'reservation', entity_id: String(data?.id || ''), detail: { kind, item: row.item_name, holderType, jobId } }); } catch (_) {}
  if (jobId) { revalidatePath(`/job/${jobId}`); }
  revalidatePath('/tools');
  return { ok: true, reservationId: data?.id, mapsUrl: clean(p.mapsUrl, 400), status };
}

// The HOLDER responds to a pickup request: accept · problem · already loaned out. Updates the reservation
// + tells the requesting tech (in-app). If the holder doesn't have it, the tool flips back so it stops
// showing as reserved and the requester can re-search.
export async function respondReservation(id, response) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const map = { accept: 'accepted', problem: 'problem', loaned: 'problem' };
  const status = map[response]; if (!status) return { ok: false, msg: 'Unknown response.' };
  const { data: r } = await c.sb.from('inventory_reservations').select('item_kind, item_id, item_name, requested_by, requested_by_name, job_id').eq('id', id).maybeSingle();
  if (!r) return { ok: false, msg: 'Reservation not found.' };
  await c.sb.from('inventory_reservations').update({ status, note: response === 'loaned' ? 'Holder: already loaned out' : null }).eq('id', id);
  // Free the tool again if the holder can't supply it.
  if (response !== 'accept' && r.item_kind === 'tool' && r.item_id) { try { await c.sb.from('tools').update({ status: 'on_van' }).eq('id', r.item_id); } catch (_) {} }
  // Tell the requester (in-app task).
  const holder = c.profile.name || c.user.email;
  await createAlert(c.sb, {
    kind: 'no_status', entity: 'tech', entityId: r.requested_by || id,
    title: response === 'accept' ? `${holder} confirmed: ${r.item_name} ready` : `${holder}: can’t supply ${r.item_name}`,
    body: response === 'accept' ? `${holder} has ${r.item_name} ready for you.` : `${holder} ${response === 'loaned' ? 'says it’s already loaned out' : 'flagged a problem'} — re-search for another source.`,
    severity: response === 'accept' ? 'low' : 'high', dedupeKey: `pickup-resp:${id}`,
  });
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: holder, role: c.profile.role, action: 'inventory.responded', entity: 'reservation', entity_id: String(id), detail: { response: status } }); } catch (_) {}
  revalidatePath('/tools'); revalidatePath('/tasks');
  return { ok: true };
}
