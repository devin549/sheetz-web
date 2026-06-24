'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { revalidatePath } from 'next/cache';

async function assertBooker() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !can(profile.role, 'createJobs')) throw new Error('Your role can’t book jobs.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, user, profile };
}
const clean = (v, n = 200) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

// Type-ahead against the 13k customer base — name OR phone.
export async function searchCustomersForBooking(q) {
  let sb;
  try { ({ sb } = await assertBooker()); } catch { return []; }
  const term = clean(q, 60);
  if (term.length < 2) return [];
  const { data, error } = await sb.from('customers')
    .select('id, name, phone, address')
    .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
    .order('lifetime_revenue', { ascending: false, nullsFirst: false })
    .limit(8);
  if (error) return [];
  return (data || []).map((c) => ({ id: c.id, name: c.name || 'Customer', phone: c.phone || '', address: c.address || '' }));
}

// Dispatcher Co-Pilot: history, value, balance + red flags for a picked customer (before you book).
export async function customerSnapshot(id) {
  let sb;
  try { ({ sb } = await assertBooker()); } catch { return null; }
  if (!id) return null;
  const { data: c } = await sb.from('customers')
    .select('name, phone, email, address, lifetime_revenue, lifetime_jobs, last_job_completed, do_not_service, do_not_mail, type')
    .eq('id', id).maybeSingle();
  if (!c) return null;
  let openBalance = 0;
  try {
    const { data: inv } = await sb.from('invoices').select('balance, status').eq('customer_id', id).eq('status', 'open').limit(200);
    openBalance = (inv || []).reduce((s, i) => s + (Number(i.balance) || 0), 0);
  } catch (_) { openBalance = 0; }
  return {
    name: c.name || 'Customer', phone: c.phone || '', email: c.email || '', address: c.address || '',
    lifetimeRevenue: Number(c.lifetime_revenue) || 0, lifetimeJobs: Number(c.lifetime_jobs) || 0,
    lastJob: c.last_job_completed || null, openBalance, doNotService: !!c.do_not_service, doNotMail: !!c.do_not_mail, type: c.type || '',
  };
}

// Verify a service address via Google Maps geocoding → canonical street/city/state/zip + lat/lng.
// Stops typos + bad addresses before a truck rolls.
export async function verifyAddress(parts) {
  try { await assertBooker(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return { ok: false, msg: 'No Google Maps key — add GOOGLE_MAPS_KEY in Vercel.' };
  const q = [parts && parts.street, parts && parts.city, parts && parts.state, parts && parts.zip].map((s) => clean(s, 120)).filter(Boolean).join(', ');
  if (!q) return { ok: false, msg: 'Enter an address first.' };

  let json;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=us&key=${key}`);
    json = await r.json();
  } catch (e) { return { ok: false, msg: 'Verify failed: ' + (e && e.message ? e.message : String(e)) }; }
  if (json.status !== 'OK' || !json.results || !json.results.length) {
    return { ok: false, msg: json.status === 'ZERO_RESULTS' ? 'No match — double-check the address.' : 'Verify error: ' + (json.status || 'unknown') };
  }
  const res = json.results[0];
  const comp = (type) => res.address_components.find((x) => x.types.includes(type)) || null;
  const sn = comp('street_number'), route = comp('route');
  const city = comp('locality') || comp('sublocality') || comp('postal_town');
  const st = comp('administrative_area_level_1'), zip = comp('postal_code');
  const loc = res.geometry && res.geometry.location;
  return {
    ok: true,
    formatted: res.formatted_address,
    street: [sn && sn.long_name, route && route.long_name].filter(Boolean).join(' ') || null,
    city: city ? city.long_name : null,
    state: st ? st.short_name : null,
    zip: zip ? zip.long_name : null,
    lat: loc ? loc.lat : null, lng: loc ? loc.lng : null,
    partial: !!res.partial_match,
  };
}

// Decode a water-heater model #/serial → real specs (brand, capacity, fuel, vent, age). The live
// HTML "Decode" pulled nothing up; this wires it to Claude so it actually returns the unit.
export async function decodeWaterHeater(model, serial) {
  let role;
  try { const ctx = await assertBooker(); role = ctx.profile.role; } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const m = clean(model, 60), s = clean(serial, 60);
  if (!m && !s) return { ok: false, msg: 'Enter a model # (and serial if you have it).' };
  if (!isAiConfigured(role)) return { ok: false, msg: 'No Claude key for your role yet — add ANTHROPIC_KEY_* in Vercel.' };

  const anthropic = getAnthropic(role);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 600,
      output_config: { effort: 'low' },
      system: 'You decode residential water-heater nameplate data for a plumbing dispatcher. The MODEL number encodes the specs (capacity in gallons, fuel type, vent type, tank height); the SERIAL number encodes the manufacture DATE (and plant) — use each accordingly, and never infer capacity/fuel from a serial alone. Identify the unit so the tech brings the right replacement. Return ONLY minified JSON, no prose, with keys: brand, capacity_gallons (number or null), fuel ("Natural Gas"|"Propane (LP)"|"Electric"|null), vent_type (e.g. "Atmospheric","Power vent","Direct vent","Electric"|null), tank_style ("Tall"|"Short (Lowboy)"|null), year (4-digit number or null), age_years (number or null), summary (one short sentence), confidence ("high"|"medium"|"low"). Use known manufacturer model/serial conventions (Rheem/Ruud, A.O. Smith/State/American, Bradford White, Rinnai, Navien, etc.). If a field is unknown, use null — never guess wildly.',
      messages: [{ role: 'user', content: `Model #: ${m || '(none)'}\nSerial #: ${s || '(none)'}` }],
    });
  } catch (e) { return { ok: false, msg: 'Decode error: ' + (e && e.message ? e.message : String(e)) }; }

  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  let data;
  try { data = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()); } catch { return { ok: false, msg: 'Couldn’t read the decode — try again or enter specs by hand.' }; }
  return { ok: true, data };
}

// Scan a rating-plate PHOTO → read model/serial + specs with Claude vision. The model FIRST decides
// whether the image is genuinely an appliance data plate; anything else (a person, random object,
// meme, screenshot, unreadable, or inappropriate) is REJECTED — nothing is stored or filled.
export async function scanDataPlate(imageDataUrl) {
  let role;
  try { const ctx = await assertBooker(); role = ctx.profile.role; } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!isAiConfigured(role)) return { ok: false, msg: 'No Claude key for your role yet — add ANTHROPIC_KEY_* in Vercel.' };

  const match = String(imageDataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) return { ok: false, msg: 'Unsupported image — use a JPG or PNG photo.' };
  const media_type = match[1], data = match[2];
  if (data.length > 9_000_000) return { ok: false, msg: 'Photo too large — try again (it should auto-shrink).' };

  const anthropic = getAnthropic(role);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 700,
      output_config: { effort: 'low' },
      system: 'You read appliance rating/data plates for a plumbing dispatcher. FIRST verify the image is genuinely a photo of an appliance rating/data plate or nameplate (a metal stamp or printed label showing model and serial numbers). If it is NOT a data plate — a person or body, an unrelated object or scene, a screenshot or meme, blank, too blurry/dark to read, or anything inappropriate — set is_plate=false with a short polite reason and leave the rest null. Only when it IS a readable plate, extract the data. The MODEL # encodes capacity/fuel/vent; the SERIAL # encodes the manufacture date. Return ONLY minified JSON: {is_plate:boolean, reason:string, model:(string|null), serial:(string|null), brand:(string|null), capacity_gallons:(number|null), fuel:("Natural Gas"|"Propane (LP)"|"Electric"|null), vent_type:(string|null), tank_style:("Tall"|"Short (Lowboy)"|null), year:(number|null), age_years:(number|null), summary:string, confidence:("high"|"medium"|"low")}.',
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type, data } },
        { type: 'text', text: 'Read this water-heater data plate. If it is not a readable appliance data plate, reject it.' },
      ] }],
    });
  } catch (e) { return { ok: false, msg: 'Scan error: ' + (e && e.message ? e.message : String(e)) }; }

  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  let d;
  try { d = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()); } catch { return { ok: false, msg: 'Couldn’t read the photo — try a clearer, straight-on shot of the plate.' }; }
  if (!d.is_plate) return { ok: false, msg: d.reason || 'That doesn’t look like a water-heater data plate — please snap a clear photo of the rating sticker.' };
  return { ok: true, data: d };
}

// Create a booking: find-or-create the customer, then insert the job (status scheduled).
export async function createBooking(formData) {
  let ctx;
  try { ctx = await assertBooker(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const { sb } = ctx;

  let customerId = clean(formData.get('customerId'), 80) || null;
  const newName = clean(formData.get('newName'), 120);
  const newPhone = clean(formData.get('newPhone'), 40);
  const newAddress = clean(formData.get('newAddress'), 200);
  const customerEmail = clean(formData.get('customerEmail'), 160).toLowerCase();
  const jobType = clean(formData.get('jobType'), 120);
  const jobClass = clean(formData.get('jobClass'), 40) || null;
  const scheduledISO = clean(formData.get('scheduledISO'), 40);
  const durationMin = Math.max(15, Math.min(720, parseInt(formData.get('durationMin'), 10) || 60));
  const techId = clean(formData.get('techId'), 80) || null;
  const priority = ['normal', 'urgent', 'emergency'].includes(formData.get('priority')) ? formData.get('priority') : 'normal';
  const amount = Math.max(0, Number(formData.get('amount')) || 0);
  const address = clean(formData.get('address'), 200) || newAddress;
  const city = clean(formData.get('city'), 80) || null;
  const state = clean(formData.get('state'), 8) || null;
  const zip = clean(formData.get('zip'), 12) || null;
  const lat = Number(formData.get('lat')) || null;
  const lng = Number(formData.get('lng')) || null;
  const arrivalWindow = clean(formData.get('arrivalWindow'), 60) || null;
  const businessUnit = clean(formData.get('businessUnit'), 60) || null;
  const poNumber = clean(formData.get('poNumber'), 60) || null;
  const claimNumber = clean(formData.get('claimNumber'), 60) || null;
  const warrantyProvider = clean(formData.get('warrantyProvider'), 80) || null;
  const howHeard = clean(formData.get('howHeard'), 80) || null;
  const referralCode = clean(formData.get('referralCode'), 60) || null;
  const contacts = clean(formData.get('contacts'), 400);
  let notes = clean(formData.get('notes'), 1000);
  if (contacts) notes = (notes ? notes + '\n' : '') + 'Other contacts: ' + contacts;
  const serviceConsent = formData.get('serviceConsent') === 'on' || formData.get('serviceConsent') === 'true';
  const marketingConsent = formData.get('marketingConsent') === 'on' || formData.get('marketingConsent') === 'true';

  if (!jobType) return { ok: false, msg: 'What’s the job? (service type)' };
  if (scheduledISO && Number.isNaN(Date.parse(scheduledISO))) return { ok: false, msg: 'Bad date/time.' };

  // create the customer if this is a new one
  if (!customerId) {
    if (!newName) return { ok: false, msg: 'Pick a customer or enter a new name.' };
    const { data: created, error: cErr } = await sb.from('customers')
      .insert({ name: newName, phone: newPhone || null, address: newAddress || null, email: customerEmail || null })
      .select('id').single();
    if (cErr) return { ok: false, msg: 'Customer: ' + cErr.message };
    customerId = created.id;
  }

  // capture consent + email on the customer (we never auto-send — this records permission).
  const consentPatch = { sms_consent: serviceConsent, marketing_consent: marketingConsent, consent_source: 'web_booking', consent_ts: new Date().toISOString() };
  if (customerEmail) consentPatch.email = customerEmail;
  let cu = await sb.from('customers').update(consentPatch).eq('id', customerId);
  if (cu.error && /marketing_consent|column|schema cache/i.test(cu.error.message || '')) {
    delete consentPatch.marketing_consent; // pre-39 fallback
    await sb.from('customers').update(consentPatch).eq('id', customerId);
  }

  let techName = null;
  if (techId) { const { data: t } = await sb.from('techs').select('name').eq('id', techId).maybeSingle(); techName = (t && t.name) || null; }

  const base = {
    customer_id: customerId, status: 'scheduled', job_type: jobType, priority,
    scheduled_at: scheduledISO || null, duration_min: durationMin, amount,
    tech_id: techId, tech_name: techName, assigned_at: techId ? new Date().toISOString() : null,
    address: address || null, city, business_unit: businessUnit, lat, lng,
  };
  let triage = null;
  try { const t = JSON.parse(String(formData.get('triage') || 'null')); if (t && typeof t === 'object' && Object.keys(t).length) triage = t; } catch (_) { triage = null; }
  const extra = { notes: notes || null, job_class: jobClass, arrival_window: arrivalWindow, po_number: poNumber, claim_number: claimNumber, warranty_provider: warrantyProvider, how_heard: howHeard, referral_code: referralCode, state, zip, triage };
  let ins = await sb.from('jobs').insert({ ...base, ...extra }).select('id').single();
  if (ins.error && /column|schema cache/i.test(ins.error.message || '')) {
    ins = await sb.from('jobs').insert(base).select('id').single(); // pre-39 fallback: book with the core fields
  }
  const job = ins.data; const jErr = ins.error;
  if (jErr) return { ok: false, msg: 'Job: ' + jErr.message };

  try {
    await sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile.name || ctx.user.email, role: ctx.profile.role, action: 'job.book', entity: 'job', entity_id: String(job.id), detail: { jobType } });
  } catch (_) {}

  revalidatePath('/board');
  revalidatePath('/job-records');
  return { ok: true, msg: 'Job booked.', jobId: job.id };
}
