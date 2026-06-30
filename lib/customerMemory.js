// Customer Memory — aggregates everything the tech should know about THIS customer/location before they
// knock: history timeline, photos, equipment, balance, membership, access notes → a "Before You Knock"
// digest + a smart summary. Real data, guarded + fail-soft (any piece missing just drops from the view).

const DONE = (s) => /done|complete|closed/.test(String(s || '').toLowerCase());
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const yr = (iso) => { try { return new Date(iso).getFullYear(); } catch { return ''; } };
const isEstimate = (j) => /estimate|quote|bid/i.test(String(j.job_type || '')) || String(j.job_class || '').toLowerCase() === 'estimate';
const isEquip = (k) => k === 'equipment' || k === 'model_serial' || /equipment|model|serial/i.test(String(k || ''));

export async function loadCustomerMemory(sb, job) {
  const cid = job.customer_id;
  const out = { openBalance: 0, stId: '', membership: null, photoCount: 0, lastServiced: null, beforeYouKnock: [], summary: [], timeline: [], photoGroups: [], equipment: [], hadCallback: false };
  if (!cid) return out;

  // History (this customer's jobs), invoices, membership — in parallel.
  const [jr, ir, mr] = await Promise.all([
    sb.from('jobs').select('id, job_number, job_type, status, amount, scheduled_at, completed_at, tech_name, job_class, warranty_provider, estimate_outcome, notes, access_notes, dispatchme_job_id').eq('customer_id', cid).order('scheduled_at', { ascending: false }).limit(40).then((r) => r).catch(() => ({ data: [] })),
    sb.from('invoices').select('invoice_number, total, balance, status, st_customer_id, job_id').eq('customer_id', cid).then((r) => r).catch(() => ({ data: [] })),
    sb.from('memberships').select('plan, status').eq('customer_id', cid).then((r) => r).catch(() => ({ data: [] })),
  ]);
  const jobs = (jr && jr.data) || [];
  const invoices = (ir && ir.data) || [];
  const memberships = (mr && mr.data) || [];

  // Photos across this customer's jobs (counts + recent thumbnails + kinds + QA).
  const jobIds = jobs.map((j) => String(j.id));
  let photos = [], reviews = [];
  if (jobIds.length) {
    try { const p = await sb.from('job_photos').select('id, job_id, kind, mime_type, storage_bucket, storage_path, created_at').is('deleted_at', null).in('job_id', jobIds).order('created_at', { ascending: false }); photos = p.data || []; } catch (_) {}
    if (photos.length) { try { const rv = await sb.from('job_photo_reviews').select('photo_id, result, created_at').in('photo_id', photos.map((p) => p.id)).order('created_at', { ascending: false }); reviews = rv.data || []; } catch (_) {} }
  }
  const qaByPhoto = {}; reviews.forEach((r) => { if (!qaByPhoto[r.photo_id]) qaByPhoto[r.photo_id] = r.result; });
  out.photoCount = photos.filter((p) => !/^video\//.test(p.mime_type || '') && p.kind !== 'walkthrough').length;

  // Invoices → open balance + ServiceTitan id.
  out.openBalance = invoices.reduce((s, v) => s + Math.max(0, Number(v.balance) || 0), 0);
  out.stId = (invoices.find((v) => v.st_customer_id) || {}).st_customer_id || '';
  const unpaid = invoices.filter((v) => (Number(v.balance) || 0) > 0);

  // Membership badge.
  const activeMem = memberships.find((m) => String(m.status || '').toLowerCase() === 'active');
  out.membership = activeMem ? activeMem.plan : null;

  // Last serviced + callback signal.
  const completed = jobs.filter((j) => DONE(j.status));
  out.lastServiced = completed[0]?.completed_at || completed[0]?.scheduled_at || null;
  out.hadCallback = jobs.some((j) => /callback|re-?clog|re-?do|warranty/i.test(`${j.job_type} ${j.notes || ''}`));

  // ── Timeline (not a table): active → open estimates → unpaid invoices → last 5 jobs ──
  const photoCountByJob = {}; photos.forEach((p) => { photoCountByJob[p.job_id] = (photoCountByJob[p.job_id] || 0) + 1; });
  const invByJob = {}; invoices.forEach((v) => { if (v.job_id) invByJob[String(v.job_id)] = v; });
  const item = (j, k) => ({
    kind: k, id: j.id, date: j.completed_at || j.scheduled_at, jobType: j.job_type || 'Job', tech: j.tech_name || '',
    status: j.status, amount: invByJob[String(j.id)]?.total ?? j.amount, paid: invByJob[String(j.id)] ? (Number(invByJob[String(j.id)].balance) || 0) <= 0 : null,
    photos: photoCountByJob[String(j.id)] || 0, badge: /callback|warranty|re-?clog/i.test(`${j.job_type} ${j.notes || ''}`) ? (/(warranty)/i.test(`${j.job_type}`) ? 'warranty' : 'callback') : null,
    href: `/job/${j.id}`,
  });
  const active = jobs.find((j) => String(j.id) === String(job.id)) || job;
  out.timeline.push({ ...item(active, 'active'), date: active.scheduled_at, status: active.status });
  jobs.filter((j) => String(j.id) !== String(job.id) && isEstimate(j) && j.estimate_outcome !== 'sold_now' && !DONE(j.status)).slice(0, 3).forEach((j) => out.timeline.push(item(j, 'estimate')));
  unpaid.slice(0, 3).forEach((v) => { const j = jobs.find((x) => String(x.id) === String(v.job_id)); if (j) out.timeline.push({ ...item(j, 'unpaid'), amount: v.balance }); else out.timeline.push({ kind: 'unpaid', id: 'inv-' + v.invoice_number, date: null, jobType: `Invoice ${v.invoice_number || ''}`, amount: v.balance, paid: false, photos: 0, badge: null, href: '/past-due' }); });
  const seen = new Set(out.timeline.map((t) => String(t.id)));
  jobs.filter((j) => !seen.has(String(j.id))).slice(0, 5).forEach((j) => out.timeline.push(item(j, 'past')));

  // ── Past photos grouped by job (recent jobs that have photos) ──
  const recentJobsWithPhotos = jobs.filter((j) => (photoCountByJob[String(j.id)] || 0) > 0).slice(0, 4);
  for (const j of recentJobsWithPhotos) {
    const items = [];
    for (const p of photos.filter((p) => String(p.job_id) === String(j.id)).slice(0, 6)) {
      let url = null; try { const { data } = await sb.storage.from(p.storage_bucket || 'job-photos').createSignedUrl(p.storage_path, 3600); url = data?.signedUrl || null; } catch (_) {}
      items.push({ id: p.id, url, kind: p.kind || 'photo', qa: qaByPhoto[p.id] || null, video: /^video\//.test(p.mime_type || '') || p.kind === 'walkthrough' });
    }
    out.photoGroups.push({ jobId: j.id, date: j.completed_at || j.scheduled_at, jobType: j.job_type, items });
  }

  // ── Equipment on file — the REAL units scanned off their data plates (brand/model/fuel/year), from the
  // customer_equipment table. The "scan plate" tool on the job's Equipment tab populates this. ──
  const nowYr = new Date().getFullYear();
  try {
    const { data: eq } = await sb.from('customer_equipment')
      .select('id, type, brand, model, fuel_type, capacity_gallons, year, created_at')
      .eq('customer_id', cid).order('created_at', { ascending: false }).limit(6);
    const looksLikeJob = (t) => /·|clog|unclog|repair|install|replace|service|leak|snake|cable/i.test(String(t || '')) || String(t || '').length > 28;
    for (const e of (eq || [])) {
      const cleanType = e.type && !looksLikeJob(e.type) ? e.type : 'Equipment'; // never echo a job description as the unit name
      const name = [e.brand, e.model].filter(Boolean).join(' ') || cleanType;
      const age = e.year ? nowYr - Number(e.year) : null;
      const bits = [e.fuel_type || null, e.capacity_gallons ? `${e.capacity_gallons} gal` : null, e.year ? `${e.year}${age != null && age >= 0 ? ` (${age} yr${age === 1 ? '' : 's'} old)` : ''}` : null].filter(Boolean);
      out.equipment.push({ name, sub: bits.join(' · '), fuel: e.fuel_type || '', year: e.year || null, age: age != null && age >= 0 ? age : null, date: e.created_at, url: null, photos: 0 });
    }
  } catch (_) { /* pre-103 */ }
  // Nudge: equipment photos exist but nothing's been scanned to a plate yet → prompt the tech to scan it.
  out.equipmentUnscanned = out.equipment.length === 0 && photos.some((p) => isEquip(p.kind));

  // ── "Before You Knock" — parse access notes + notes into friendly bullets ──
  const noteText = [active.access_notes, active.notes].filter(Boolean).join(' · ');
  const tone = (t) => /unpaid|callback|warning|aggress|caution/i.test(t) ? 'warn' : 'ok';
  noteText.split(/\s*[·;|\n]\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 8).forEach((t) => {
    const icon = /dog|pet/i.test(t) ? '🐕' : /gate|code/i.test(t) ? '🔑' : /park/i.test(t) ? '🅿️' : /text|call|email/i.test(t) ? '💬' : /callback|prior/i.test(t) ? '⚠️' : '📌';
    out.beforeYouKnock.push({ icon, text: t, tone: tone(t) });
  });
  if (out.openBalance > 0) out.beforeYouKnock.push({ icon: '💸', text: `Unpaid balance ${money(out.openBalance)} — collect before new work if policy requires.`, tone: 'warn' });
  const wh = jobs.find((j) => /water ?heater/i.test(j.job_type || '') && DONE(j.status));
  if (wh) out.beforeYouKnock.push({ icon: '🔥', text: `Water heater serviced/installed ${yr(wh.completed_at || wh.scheduled_at)}.`, tone: 'ok' });

  // ── Smart summary — "what the tech should know" (rule-based from the data) ──
  if (out.membership) out.summary.push(`Member — ${out.membership} plan. Treat as a VIP.`);
  if (out.openBalance > 0) out.summary.push(`⚠ Unpaid balance ${money(out.openBalance)} on file.`);
  if (out.hadCallback) out.summary.push('Had a callback / repeat issue before — be extra clear and thorough.');
  if (/text/i.test(noteText)) out.summary.push('Prefers texts over calls.');
  if (out.lastServiced) { const lj = completed[0]; out.summary.push(`Last serviced ${new Date(out.lastServiced).toLocaleDateString()} — ${lj?.job_type || 'service'}.`); }
  if (wh) out.summary.push(`Water heater is from ${yr(wh.completed_at || wh.scheduled_at)} — check age on any related work.`);
  if (!out.summary.length) out.summary.push('First recorded visit for this customer — make a great first impression.');

  return out;
}
