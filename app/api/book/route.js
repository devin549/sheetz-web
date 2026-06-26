import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { postToDiscord } from '@/lib/discord';
import { readDataPlate } from '@/lib/aiVision';
import { windowOpen, windowByLabel, BOOKING_BETA } from '@/lib/availability';
import { rankTechs } from '@/lib/dispatch';
import { geocodeFull, mapsConfigured } from '@/lib/maps';
import { assessServiceArea, servedCitySet } from '@/lib/serviceArea';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUBLIC booking intake — the CB website's "Schedule" form POSTs here. Creates a customer + a job (on the
// dispatch board for the office to confirm) and records the tech's ?ref= code so the booking is attributed.
// No auth (it's a public form). Honeypot + basic validation guard against bots.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const dial = (p) => String(p || '').replace(/[^0-9+]/g, '');

export function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: 400, headers: CORS }); }
  if (clean(body.company)) return NextResponse.json({ ok: true }, { headers: CORS }); // honeypot field filled = bot, silently accept

  const name = clean(body.name, 120);
  const phone = dial(body.phone);
  if (!name || phone.length < 7) return NextResponse.json({ ok: false, error: 'Name and a valid phone are required.' }, { status: 422, headers: CORS });
  const email = clean(body.email, 160), address = clean(body.address, 300), service = clean(body.service, 120) || 'Service request';
  const notes = clean(body.notes, 1000), ref = clean(body.ref || body.referral_code, 60);
  // Qualifying answers (asked on the form) → richer context for the office to quote/dispatch accurately.
  const where = clean(body.location, 80), homeAge = clean(body.homeAge, 40), urgency = clean(body.urgency, 40);
  // Chosen slot from the availability picker.
  const date = clean(body.date, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? clean(body.date, 10) : '';
  const win = clean(body.window, 40);
  const emergency = !!body.emergency || /emergency/i.test(urgency);

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'Unavailable.' }, { status: 503, headers: CORS });

  // Validate the chosen window is still open (race guard). Sunday emergencies skip the window rules.
  let scheduledAt = new Date().toISOString(), arrivalWindow = null, status = 'hold';
  if (date && win && windowByLabel(win)) {
    const open = await windowOpen(sb, date, win);
    if (!open) return NextResponse.json({ ok: false, error: 'That time just filled up — please pick another window.' }, { status: 409, headers: CORS });
    const h = windowByLabel(win).start;
    scheduledAt = `${date}T${String(h).padStart(2, '0')}:00:00`;
    arrivalWindow = win; status = 'scheduled';
  } else if (date) { scheduledAt = `${date}T08:00:00`; }

  // 📍 Server-side address gate (never trust the client). Geocode the service address; if it's a city
  // we don't serve or > MAX_MILES from base, we can't guarantee a slot → force a review HOLD and drop
  // the confirmed window so an out-of-area booking can't lock real capacity. Fail-soft (no key / no hit).
  let geo = null, addrReview = false, distanceMi = null;
  const addrQuery = [address, where].filter(Boolean).join(', ');
  if (mapsConfigured() && addrQuery.replace(/[^a-z0-9]/gi, '').length >= 4) {
    try {
      const g = await geocodeFull(addrQuery);
      if (g && typeof g.lat === 'number') {
        geo = g;
        const a = assessServiceArea(g, await servedCitySet(sb));
        addrReview = a.needsReview; distanceMi = a.distanceMi;
      }
    } catch (_) {}
  }
  if (addrReview) { arrivalWindow = null; status = 'hold'; if (!date) scheduledAt = new Date().toISOString(); }
  const areaLine = addrReview ? `⚠ OUT-OF-AREA — NEEDS REVIEW${distanceMi != null ? ` (~${distanceMi} mi from base)` : ' (unserved city)'} · do NOT promise a slot until confirmed` : '';

  // 📷 Optional data-plate photo (water heater etc.) → OCR brand/model/fuel/age so we know the exact unit.
  let plate = null;
  if (body.platePhoto && /^data:image\//.test(String(body.platePhoto))) {
    try { plate = await readDataPlate(String(body.platePhoto).slice(0, 12_000_000), 'office'); } catch (_) {}
  }
  const plateLine = plate ? `EQUIPMENT (from customer photo): ${[plate.brand, plate.model, plate.fuelType, plate.capacityGallons ? plate.capacityGallons + 'gal' : '', plate.year ? 'yr ' + plate.year : ''].filter(Boolean).join(' · ')}` : '';
  const qa = [where && `Location: ${where}`, homeAge && `Home age: ${homeAge}`, urgency && `Urgency: ${urgency}`].filter(Boolean).join(' · ');

  // Find or create the customer (by phone).
  let customerId = null;
  try {
    const { data: existing } = await sb.from('customers').select('id').eq('phone', phone).limit(1).maybeSingle();
    if (existing) customerId = existing.id;
    else { const { data: c } = await sb.from('customers').insert({ name, phone, email: email || null, address: address || null }).select('id').maybeSingle(); customerId = c?.id || null; }
  } catch (_) {}

  // 🧠 Best-tech recommendation for the chosen slot (skill + nearby + lightest load among free techs).
  let recommended = null;
  if (date && arrivalWindow) {
    try {
      let techs = [];
      let tq = await sb.from('profiles').select('id, name, tech_id, role, skills, service_area').in('role', ['tech', 'foreman', 'fs']);
      if (tq.error) tq = await sb.from('profiles').select('id, name, tech_id, role').in('role', ['tech', 'foreman', 'fs']);
      techs = (tq.data || []).map((t) => ({ id: t.tech_id || t.id, name: t.name, skills: t.skills || [], area: t.service_area || '' }));
      const { data: dayJobs } = await sb.from('jobs').select('tech_id, arrival_window, status').gte('scheduled_at', date + 'T00:00:00').lt('scheduled_at', date + 'T23:59:59').not('status', 'eq', 'cancelled');
      const techLoad = {}; const busy = new Set();
      (dayJobs || []).forEach((j) => { if (!j.tech_id) return; techLoad[j.tech_id] = (techLoad[j.tech_id] || 0) + 1; if (j.arrival_window === arrivalWindow) busy.add(j.tech_id); });
      const ranked = rankTechs(techs, { jobType: service, city: where || address, busyTechIds: busy, techLoad });
      recommended = ranked[0] || null;
    } catch (_) {}
  }

  // BETA: every web booking holds for office approval (no auto-assign). Flip BOOKING_BETA off once proven.
  if (BOOKING_BETA) status = 'hold';
  const recoLine = recommended ? `${BOOKING_BETA ? 'BETA · pending office approval · ' : 'Auto-assigned '}suggested tech: ${recommended.tech.name}${recommended.reasons.length ? ` (${recommended.reasons.join(', ')})` : ''}` : (BOOKING_BETA && arrivalWindow ? 'BETA · pending office approval' : '');

  // Create the job. A picked slot → 'scheduled' with the arrival window; otherwise 'hold' for the office.
  const header = addrReview
    ? `🌐 WEB BOOKING — 🗺 REVIEW (out of area) — confirm before scheduling.${emergency ? ' · 🚨 EMERGENCY' : ''}`
    : (arrivalWindow ? `🌐 WEB BOOKING — ${date} · ${arrivalWindow}${emergency ? ' · 🚨 EMERGENCY' : ''}` : `🌐 WEB BOOKING — ${emergency ? '🚨 EMERGENCY · ' : ''}confirm a time.`);
  const fullNotes = [header, areaLine, recoLine, qa, plateLine, notes].filter(Boolean).join('\n');
  const base = { customer_id: customerId, job_type: service, status, notes: fullNotes };
  const extra = { referral_code: ref || null, how_heard: 'website', address: (geo && geo.formatted) || address || null, scheduled_at: scheduledAt, arrival_window: arrivalWindow };
  // Only auto-assign the tech when out of beta; in beta the office approves + assigns.
  if (!BOOKING_BETA && recommended && recommended.tech.id) extra.tech_id = recommended.tech.id;
  let jobId = null;
  let { data: job, error } = await sb.from('jobs').insert({ ...base, ...extra }).select('id').maybeSingle();
  if (error && /column|schema cache|does not exist/i.test(error.message || '')) ({ data: job, error } = await sb.from('jobs').insert(base).select('id').maybeSingle());
  if (error) return NextResponse.json({ ok: false, error: 'Could not save the booking.' }, { status: 500, headers: CORS });
  jobId = job?.id || null;

  // Auto-add the photographed unit to the location's equipment registry.
  if (plate && customerId) {
    try { await sb.from('customer_equipment').insert({ customer_id: customerId, job_id: jobId, type: service, brand: plate.brand || null, model: plate.model || null, serial: plate.serial || null, fuel_type: plate.fuelType || null, capacity_gallons: Number(plate.capacityGallons) || null, year: Number(plate.year) || null, notes: 'From customer booking photo', created_by_name: 'Website' }); } catch (_) {}
  }
  try { await sb.from('audit_log').insert({ actor_name: 'Website', role: 'public', action: 'booking.web', entity: 'job', entity_id: String(jobId || ''), detail: { name, service, ref, plate: !!plate } }); } catch (_) {}
  try { await postToDiscord(`🌐 **New web booking**${addrReview ? ' · 🗺 OUT-OF-AREA — REVIEW' : (BOOKING_BETA ? ' · ⏳ BETA — approve on the board' : '')}\n${name} · ${phone}${(geo && geo.formatted) || address ? ` · ${(geo && geo.formatted) || address}` : ''}\nService: ${service}${arrivalWindow ? `\n🗓 ${date} · ${arrivalWindow}` : ''}${areaLine ? `\n${areaLine}` : ''}${recoLine ? `\n🧠 ${recoLine}` : ''}${ref ? `\nReferral: ${ref}` : ''}${qa ? `\n${qa}` : ''}${plateLine ? `\n🔧 ${plateLine}` : ''}${notes ? `\n📝 ${notes.slice(0, 200)}` : ''}`); } catch (_) {}

  const message = addrReview
    ? `Thanks ${name.split(' ')[0] || ''}! Your address looks like it may be outside our usual service area, so we couldn't auto-reserve a time — but we've got your request and we'll review it and call you to confirm.`.replace('  ', ' ')
    : arrivalWindow
      ? (BOOKING_BETA
          ? `Got it! We've reserved ${date}, ${arrivalWindow} — our office will text you shortly to confirm.`
          : `You're booked for ${date}, ${arrivalWindow}! We'll text a confirmation${plate ? ' — and thanks for the photo, it helps us come prepared' : ''}.`)
      : "Thanks! We've got your request — we'll text you to confirm a time.";
  return NextResponse.json({ ok: true, jobId, scheduled: !BOOKING_BETA && !addrReview && !!arrivalWindow, needsReview: addrReview, message }, { headers: CORS });
}
