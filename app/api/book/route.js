import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { postToDiscord } from '@/lib/discord';
import { readDataPlate } from '@/lib/aiVision';
import { windowOpen, windowByLabel } from '@/lib/availability';

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

  // Create the job. A picked slot → 'scheduled' with the arrival window; otherwise 'hold' for the office.
  const header = arrivalWindow ? `🌐 WEB BOOKING — ${date} · ${arrivalWindow}${emergency ? ' · 🚨 EMERGENCY' : ''}` : `🌐 WEB BOOKING — ${emergency ? '🚨 EMERGENCY · ' : ''}confirm a time.`;
  const fullNotes = [header, qa, plateLine, notes].filter(Boolean).join('\n');
  const base = { customer_id: customerId, job_type: service, status, notes: fullNotes };
  const extra = { referral_code: ref || null, how_heard: 'website', address: address || null, scheduled_at: scheduledAt, arrival_window: arrivalWindow };
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
  try { await postToDiscord(`🌐 **New web booking**\n${name} · ${phone}${address ? ` · ${address}` : ''}\nService: ${service}${ref ? `\nReferral: ${ref}` : ''}${qa ? `\n${qa}` : ''}${plateLine ? `\n🔧 ${plateLine}` : ''}${notes ? `\n📝 ${notes.slice(0, 200)}` : ''}\nConfirm a time on the board.`); } catch (_) {}

  const message = arrivalWindow
    ? `You're booked for ${date}, ${arrivalWindow}! We'll text a confirmation${plate ? ' — and thanks for the photo, it helps us come prepared' : ''}.`
    : "Thanks! We've got your request — we'll text you to confirm a time.";
  return NextResponse.json({ ok: true, jobId, scheduled: !!arrivalWindow, message }, { headers: CORS });
}
