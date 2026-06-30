'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { canOverrideCreditHold } from '@/lib/creditHold';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { sendSms } from '@/lib/twilio';
import { sendOne, isEmailConfigured } from '@/lib/email';
import { postToDiscord } from '@/lib/discord';
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
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// First scalar phone — `customers.phones` can be an array; never String() an array into a To.
const firstPhone = (c) => (c && (c.phone || (Array.isArray(c.phones) ? c.phones[0] : c.phones))) || '';

// Type-ahead against the 13k customer base — name OR phone.
export async function searchCustomersForBooking(q) {
  let sb;
  try { ({ sb } = await assertBooker()); } catch { return []; }
  const term = clean(q, 60);
  if (term.length < 2) return [];
  // RPC matches phones regardless of formatting (digits-only typing finds "(859) 779-8824").
  const rpc = await sb.rpc('search_customers', { term });
  const rows = rpc.error
    ? (await sb.from('customers').select('id, name, phone, address').or(`name.ilike.%${term}%,phone.ilike.%${term}%`).order('lifetime_revenue', { ascending: false, nullsFirst: false }).limit(8)).data // pre-42 fallback
    : rpc.data;
  return (rows || []).slice(0, 8).map((c) => ({ id: c.id, name: c.name || 'Customer', phone: c.phone || '', address: c.address || '' }));
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

  // prior tech + past-issue signal (cancelled jobs) from this customer's jobs
  let priorTech = null, cancelled = 0;
  try {
    const { data: jobs } = await sb.from('jobs').select('tech_name, status, scheduled_at').eq('customer_id', id).order('scheduled_at', { ascending: false }).limit(50);
    for (const j of (jobs || [])) { if (!priorTech && j.tech_name) priorTech = j.tech_name; if (String(j.status || '').toLowerCase().includes('cancel')) cancelled++; }
  } catch (_) { /* ignore */ }

  // active membership (by customer_id or name) — graceful if table absent
  let membership = null;
  try {
    const nm = String(c.name || '').toLowerCase();
    const { data: mem, error } = await sb.from('memberships').select('plan, status, customer_id, customer');
    if (!error && mem) { const hit = mem.find((m) => m.status === 'active' && (m.customer_id === id || String(m.customer || '').toLowerCase() === nm)); if (hit) membership = hit.plan; }
  } catch (_) { /* ignore */ }

  // low-star reviews (past issues) — match by name until reviews carry customer_id
  let lowReviews = 0;
  try {
    const { data: rv } = await sb.from('reviews').select('rating').ilike('customer_name', c.name || '___none___').lte('rating', 3);
    lowReviews = (rv || []).length;
  } catch (_) { /* ignore */ }

  // duplicate-customer warning — others sharing this exact phone
  let duplicates = 0;
  try {
    if (c.phone) { const { data: dup } = await sb.from('customers').select('id').eq('phone', c.phone).neq('id', id).limit(20); duplicates = (dup || []).length; }
  } catch (_) { /* ignore */ }

  // credit hold (migration 130) — best-effort so the snapshot still works pre-migration.
  let creditHold = false, creditHoldReason = null;
  try { const { data: ch } = await sb.from('customers').select('credit_hold, credit_hold_reason').eq('id', id).maybeSingle(); if (ch) { creditHold = !!ch.credit_hold; creditHoldReason = ch.credit_hold_reason || null; } } catch (_) { /* pre-130 */ }

  return {
    name: c.name || 'Customer', phone: c.phone || '', email: c.email || '', address: c.address || '',
    lifetimeRevenue: Number(c.lifetime_revenue) || 0, lifetimeJobs: Number(c.lifetime_jobs) || 0,
    lastJob: c.last_job_completed || null, openBalance, doNotService: !!c.do_not_service, doNotMail: !!c.do_not_mail, type: c.type || '',
    membership, priorTech, pastIssues: cancelled + lowReviews, duplicates, creditHold, creditHoldReason,
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
  if (d.is_plate !== true) return { ok: false, msg: d.reason || 'That doesn’t look like a water-heater data plate — please snap a clear photo of the rating sticker.' };
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
  // Insurance/warranty providers MUST carry a claim # (OnCourse, AWR, Pivotal, HomeServe, or class).
  const claimReq = jobClass === 'insurance' || jobClass === 'warranty' || ['OnCourse', 'AWR', 'Pivotal', 'HomeServe'].includes(warrantyProvider);
  if (claimReq && !claimNumber) return { ok: false, msg: `Claim # is required for ${warrantyProvider || jobClass} jobs.` };

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

  // 🚦 Credit hold — a held customer can only be scheduled by an approver (owner/GM/accounting). Everyone
  // else is blocked: no new work without approved terms. New customers can't be on hold. Best-effort so a
  // pre-130 DB books normally.
  try {
    const { data: ch } = await sb.from('customers').select('credit_hold, credit_hold_reason').eq('id', customerId).maybeSingle();
    if (ch?.credit_hold) {
      if (!canOverrideCreditHold(ctx.profile.role)) {
        return { ok: false, creditHold: true, msg: `🚦 CREDIT HOLD — ${ch.credit_hold_reason || 'past-due balance'}. Owner / GM / Accounting must approve before this customer is scheduled.` };
      }
      // Approver is booking it anyway — record the override so it's auditable.
      try { await sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile.name || ctx.user.email, role: ctx.profile.role, action: 'job.book_credit_hold_override', entity: 'customer', entity_id: String(customerId), detail: { reason: ch.credit_hold_reason || null } }); } catch (_) {}
    }
  } catch (_) { /* pre-130: no hold column → book normally */ }

  let techName = null, techPhone = null;
  if (techId) {
    let t = await sb.from('techs').select('name, phone').eq('id', techId).maybeSingle();
    if (t.error) t = await sb.from('techs').select('name').eq('id', techId).maybeSingle(); // pre-43
    techName = (t.data && t.data.name) || null;
    techPhone = (t.data && t.data.phone) || null;
  }

  const base = {
    customer_id: customerId, status: 'scheduled', job_type: jobType, priority,
    scheduled_at: scheduledISO || null, duration_min: durationMin, amount,
    tech_id: techId, tech_name: techName, assigned_at: techId ? new Date().toISOString() : null,
    address: address || null, city, business_unit: businessUnit, lat, lng,
  };
  let triage = null;
  try { const t = JSON.parse(String(formData.get('triage') || 'null')); if (t && typeof t === 'object' && Object.keys(t).length) triage = t; } catch (_) { triage = null; }
  const extra = { notes: notes || null, job_class: jobClass, arrival_window: arrivalWindow, po_number: poNumber, claim_number: claimNumber, warranty_provider: warrantyProvider, how_heard: howHeard, referral_code: referralCode, state, zip, triage,
    customer_promise: clean(formData.get('customerPromise'), 300) || null, access_notes: clean(formData.get('accessNotes'), 300) || null, sold_scope: clean(formData.get('soldScope'), 300) || null, must_tell_tech: clean(formData.get('mustTell'), 300) || null, csr: ctx.profile.name || ctx.user.email };
  let ins = await sb.from('jobs').insert({ ...base, ...extra }).select('id').single();
  if (ins.error && /column|schema cache/i.test(ins.error.message || '')) {
    ins = await sb.from('jobs').insert(base).select('id').single(); // pre-39 fallback: book with the core fields
  }
  const job = ins.data; const jErr = ins.error;
  if (jErr) return { ok: false, msg: 'Job: ' + jErr.message };

  try {
    await sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile.name || ctx.user.email, role: ctx.profile.role, action: 'job.book', entity: 'job', entity_id: String(job.id), detail: { jobType } });
  } catch (_) {}

  // Booking confirmation — HUMAN-initiated (CSR ticked "send"), consent-gated, text AND email, logged.
  // Never blocks the booking: if a channel can't go, the job is still booked and we report why.
  const who = ctx.profile.name || ctx.user.email;
  const whenStr = scheduledISO ? new Date(scheduledISO).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const sentBits = [];

  // Captain Hook → #sheetz: internal booking alert (not customer-facing). Never blocks the booking.
  try {
    let nm2 = newName;
    if (!nm2) { const { data: cn } = await sb.from('customers').select('name').eq('id', customerId).maybeSingle(); nm2 = (cn && cn.name) || 'Customer'; }
    await postToDiscord(`📋 New job: ${nm2} · ${jobType}${whenStr ? ` · ${whenStr}` : ''} · ${techName || 'unassigned'}${priority !== 'normal' ? ` · ${priority.toUpperCase()}` : ''}${claimReq ? ` · ${warrantyProvider || jobClass}` : ''}`, { to: 'office' });
  } catch (_) { /* discord best-effort */ }

  // Warranty/dispatch.me jobs → text the assigned tech the app link to tap "On My Way" when they head
  // out (feeds the dispatch.me On-My-Way scorecard). Set DISPATCHME_APP_URL to your exact deep link.
  const dispatchmeUrl = process.env.DISPATCHME_APP_URL; // set to your exact "On My Way" deep link
  if (claimReq && techId && techPhone && !dispatchmeUrl) {
    sentBits.push('tech link skipped — set DISPATCHME_APP_URL'); // don't text a dead generic link
  } else if (claimReq && techId && techPhone) {
    const body = `New ${warrantyProvider || 'warranty'} job (dispatch.me): ${jobType}${whenStr ? ` ${whenStr}` : ''}. Open the app and tap "On My Way" when you head out → ${dispatchmeUrl}`;
    const r = await sendSms(techPhone, body);
    try { await sb.from('cb_comms').insert({ channel: 'sms', to_addr: (r && r.to) || techPhone, customer_id: customerId, job_id: job.id, body, status: r.ok ? 'sent' : 'failed', provider_id: r.sid || null, error: r.ok ? null : r.msg, sent_by: who }); } catch (_) {}
    sentBits.push(r.ok ? 'tech got dispatch.me link' : `tech link not sent (${r.msg})`);
  }

  const wantConfirm = formData.get('sendConfirm') === 'on' || formData.get('sendConfirm') === 'true';
  if (wantConfirm && !serviceConsent) sentBits.push('not sent — no consent');
  else if (wantConfirm) {
    let phone = newPhone, email = customerEmail, nm = newName, email2 = '';
    { let { data: cust, error } = await sb.from('customers').select('name, phone, phones, email, email2').eq('id', customerId).maybeSingle(); if (error) ({ data: cust } = await sb.from('customers').select('name, phone, phones, email').eq('id', customerId).maybeSingle()); if (cust) { phone = phone || firstPhone(cust); email = email || cust.email || ''; nm = nm || cust.name || ''; email2 = cust.email2 || ''; } }
    const log = (channel, to, body, r) => { try { return sb.from('cb_comms').insert({ channel, to_addr: to, customer_id: customerId, job_id: String(job.id), body, status: r.ok ? 'sent' : 'failed', provider_id: r.sid || null, error: r.ok ? null : (r.msg || r.error), sent_by: who }); } catch (_) {} };
    if (phone) {
      const body = `Clog Busterz Plumbing: you're booked for ${jobType}${whenStr ? ` on ${whenStr}` : ''}. We'll text when we're on the way. Reply STOP to opt out.`;
      const r = await sendSms(phone, body); await log('sms', (r && r.to) || phone, body, r);
      sentBits.push(r.ok ? 'text sent' : `text not sent (${r.msg})`);
    }
    if (email) {
      const subject = `You're booked — Clog Busterz Plumbing`;
      const html = `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #e3e0d8;border-radius:10px;overflow:hidden"><div style="background:#FF6B00;color:#fff;padding:14px 20px;font-weight:800;font-size:16px">Clog Busterz Plumbing</div><div style="padding:22px 20px;font-size:14px"><p>Hi ${esc(nm) || 'there'},</p><p>You're booked for <strong>${esc(jobType)}</strong>${whenStr ? ` on <strong>${esc(whenStr)}</strong>` : ''}${address ? ` at ${esc(address)}` : ''}.</p><p>We'll text or call when your tech is on the way. Questions? Just reply to this email.</p></div><div style="padding:14px 20px;border-top:1px solid #eee;font-size:11px;color:#888">Clog Busterz Plumbing</div></div></div></body></html>`;
      const r = isEmailConfigured ? await sendOne({ to: email, cc: email2 || undefined, subject, html }) : { ok: false, error: 'no email key' };
      await log('email', email2 ? `${email}, ${email2}` : email, subject, r);
      sentBits.push(r.ok ? 'email sent' : 'email not sent');
    }
    if (!phone && !email) sentBits.push('no phone/email on file');
  }

  revalidatePath('/board');
  revalidatePath('/job-records');
  const tail = sentBits.length ? ' · ' + sentBits.join(', ') : '';
  return { ok: true, msg: 'Job booked.' + tail, jobId: job.id };
}
