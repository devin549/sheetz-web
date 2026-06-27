import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { scopeToTech, techIdentity } from '@/lib/techJobScope';
import { lastWorkedDay, lastShiftScorecard, companyRankings, enrichTodayJob, winCondition } from '@/lib/techBriefing';
import { rankEffect } from '@/lib/rankFx';
import { driveMatrix } from '@/lib/maps';
import { haversineMiles, etaMinutes } from '@/lib/geo';
import { getConfig, pullsAvailable, budgetSpent } from '@/lib/powerPlunger';
import StartOfDay from './StartOfDay';

export const dynamic = 'force-dynamic';

function nyDayKey() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()); }
function nyWindow(dateStr) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(new Date(dateStr + 'T12:00:00Z')).find((p) => p.type === 'timeZoneName');
  const m = (part?.value || 'GMT-5').match(/GMT([+-]\d{1,2})(?::(\d{2}))?/); const h = m ? parseInt(m[1], 10) : -5;
  const off = h * 60 + (h < 0 ? -1 : 1) * parseInt((m && m[2]) || '0', 10);
  const startMs = Date.parse(dateStr + 'T00:00:00Z') - off * 60000;
  return { startISO: new Date(startMs).toISOString(), endISO: new Date(startMs + 86400000).toISOString() };
}
function fmtTime(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return '—'; } }
function prettyDay(key) { if (!key) return null; try { return new Date(key + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }); } catch { return key; } }

export default async function Start() {
  const { user, profile, role } = await requirePerm('changeStatus', 'seeOwnOnly', 'seeCrew');
  const name = profile.name || user.email;
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🌅 Start of Day</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();
  const ident = techIdentity({ profile, user });
  const day = nyDayKey();
  const { startISO, endISO } = nyWindow(day);
  const nowMs = Date.now();

  // Today's jobs (rich fields for the briefing), with name/email fallback for unlinked techs.
  const jr = await scopeToTech(
    sb.from('jobs').select('id, status, priority, scheduled_at, tech_id, job_number, job_type, amount, customer_id, job_class, warranty_provider, notes, access_notes, started_at, enroute_at, estimate_outcome, converted_to_job_id, lat, lng, arrival_window, customers(name, address, phone)')
      .gte('scheduled_at', startISO).lt('scheduled_at', endISO).order('scheduled_at', { ascending: true }),
    { profile, user }
  );
  const rawJobs = jr.data || [];

  // Per-customer signals for risk tags (member / vip / past-due) — same batch as My Day.
  const memberByCust = {}, vipByCust = {}, pastDueByCust = {};
  const custIds = [...new Set(rawJobs.map((j) => j.customer_id).filter(Boolean))];
  if (custIds.length) {
    try { const { data } = await sb.from('memberships').select('customer_id, status, plan').in('customer_id', custIds); (data || []).forEach((mm) => { if (String(mm.status || '').toLowerCase() === 'active') { memberByCust[mm.customer_id] = true; if (/vip|premium|gold|platinum|elite/i.test(String(mm.plan || ''))) vipByCust[mm.customer_id] = true; } }); } catch (_) {}
    try { const { data } = await sb.from('invoices').select('customer_id, balance').in('customer_id', custIds); (data || []).forEach((v) => { const b = Math.max(0, Number(v.balance) || 0); if (b > 0) pastDueByCust[v.customer_id] = (pastDueByCust[v.customer_id] || 0) + b; }); } catch (_) {}
  }
  const jobs = rawJobs.map((j) => {
    const enr = enrichTodayJob(j, { member: memberByCust[j.customer_id], vip: vipByCust[j.customer_id], pastDue: pastDueByCust[j.customer_id] });
    const c = j.customers || {};
    return {
      id: j.id, time: fmtTime(j.scheduled_at), number: j.job_number || '', type: j.job_type || 'Service call',
      customer: c.name || 'Customer', address: c.address || '', phone: c.phone || '',
      notes: j.notes || '', access: j.access_notes || '', amount: Number(j.amount) || 0,
      opportunity: enr.opportunity, flags: enr.flags, risks: enr.risks, tools: enr.tools, bestAction: enr.bestAction,
    };
  });

  // 🚗 LEAVE-BY — home → first job drive time (Google), backed off the promised window. Needs a saved home.
  let leaveBy = null;
  const firstJob = rawJobs.find((j) => j.scheduled_at && j.lat != null && j.lng != null) || null;
  if (firstJob && profile.homeLat != null && profile.homeLng != null) {
    const targetMs = new Date(firstJob.scheduled_at).getTime();
    // Postgres `numeric` coords arrive as STRINGS — coerce, else driveMatrix/haversine reject them and leave-by is dead.
    const hLat = Number(profile.homeLat), hLng = Number(profile.homeLng), jLat = Number(firstJob.lat), jLng = Number(firstJob.lng);
    if (Number.isFinite(targetMs) && ![hLat, hLng, jLat, jLng].some(Number.isNaN)) {
      let driveMin = null;
      try { const dm = await driveMatrix({ lat: hLat, lng: hLng }, [{ lat: jLat, lng: jLng }]); if (dm && dm[0] && dm[0].etaMin != null) driveMin = dm[0].etaMin; } catch (_) {}
      if (driveMin == null) driveMin = etaMinutes(haversineMiles(hLat, hLng, jLat, jLng));
      if (driveMin != null) {
        const BUFFER = 10;
        const leaveMs = targetMs - (driveMin + BUFFER) * 60000;
        const c = firstJob.customers || {};
        leaveBy = { leaveTime: fmtTime(new Date(leaveMs).toISOString()), driveMin, buffer: BUFFER, customer: c.name || 'your first stop', window: firstJob.arrival_window || fmtTime(firstJob.scheduled_at), late: leaveMs <= nowMs, minsUntil: Math.round((leaveMs - nowMs) / 60000) };
      }
    }
  }

  // Last-shift scorecard + company rankings + movement vs last acknowledged shift.
  const lw = await lastWorkedDay(sb, ident, nowMs);
  const scorecard = lw.available && lw.dayKey ? await lastShiftScorecard(sb, ident, lw.dayKey) : { available: false };
  const ranks = await companyRankings(sb, ident, nowMs);
  const overallRank = ranks.available ? ranks.overall.rank : null;
  const fieldSize = ranks.available ? ranks.overall.total : 0;

  // prevRank: the overall rank we stamped on the tech's last SOD acknowledgement (flags.rank).
  let prevRank = null;
  try {
    const { data } = await sb.from('tech_shift_log').select('flags, day_key').eq('user_id', user.id).eq('kind', 'sod').lt('day_key', day).order('day_key', { ascending: false }).limit(1);
    const f = data && data[0] && data[0].flags; if (f && Number.isFinite(Number(f.rank))) prevRank = Number(f.rank);
  } catch (_) {}
  const fx = rankEffect({ rank: overallRank, total: fieldSize, prevRank, seed: name });

  // On-call status (current week row; match the tech's first name in any slot).
  let onCall = '';
  try {
    const { data: oc } = await sb.from('on_call_schedule').select('*').eq('slot', 'current').maybeSingle();
    if (oc && name) { const n = String(name).toLowerCase().split(/\s+/)[0]; const hit = ['mon', 'tue', 'wed', 'thu', 'weekend', 'helper_week', 'supervisor'].find((k) => String(oc[k] || '').toLowerCase().includes(n)); if (hit) onCall = hit === 'weekend' ? 'on-call this weekend' : hit === 'helper_week' ? 'helper on-call this week' : 'on-call this week'; }
  } catch (_) {}

  // Saved SOD for today (ack + checklist).
  let saved = null;
  try { const { data } = await sb.from('tech_shift_log').select('checklist, ready, notes, flags').eq('user_id', user.id).eq('day_key', day).eq('kind', 'sod').maybeSingle(); saved = data || null; } catch (_) {}

  // ── Start of Day GATE (HTML sod pane): today's checks + tools roster + handbook status + helper ──
  let sodRow = null, sodTools = [], sodHelper = null, sodHandbook = { due: true, daysOverdue: null };
  try {
    const q = profile.tech_id
      ? await sb.from('sod_checks').select('*').eq('tech_id', profile.tech_id).eq('day', day).maybeSingle()
      : await sb.from('sod_checks').select('*').eq('tech_name', name).eq('day', day).maybeSingle();
    sodRow = q.data || null;
  } catch (_) {}
  try { let tq = await sb.from('tools').select('id, name, identifier').ilike('assigned_to', name).order('name').limit(60); if (tq.error) tq = await sb.from('tools').select('id, name').ilike('assigned_to', name).limit(60); sodTools = tq.data || []; } catch (_) {}
  try { const { data } = await sb.from('helper_pairings').select('helper_name, lead_tech_name, status').or(`lead_tech_id.eq.${profile.tech_id || '00000000-0000-0000-0000-000000000000'},helper_id.eq.${profile.tech_id || '00000000-0000-0000-0000-000000000000'}`).in('status', ['active', 'pending']).order('started_at', { ascending: false }).limit(1).maybeSingle(); sodHelper = data || null; } catch (_) {}
  try {
    const { handbookDue } = await import('@/lib/sod');
    let lastAck = sodRow?.handbook_acked_at || null;
    if (!lastAck) { const { data } = await sb.from('policy_acks').select('acked_at').eq('user_id', user.id).eq('kind', 'handbook').order('acked_at', { ascending: false }).limit(1).maybeSingle(); lastAck = data?.acked_at || null; }
    sodHandbook = handbookDue(lastAck, nowMs);
  } catch (_) {}

  const rankings = ranks.available ? ranks.metrics : null;
  // Active bounties from the office (same catalog the Races board uses) — surfaced here to chase at sign-in.
  let bounties = [];
  try { const { data } = await sb.from('awards').select('id, title, icon, amount_cents, points, description').eq('active', true).in('kind', ['bounty', 'weekly']).order('sort', { ascending: true }).limit(6); bounties = data || []; } catch (_) {}
  // Weekly challenge bounties (sample seam until the challenges feed wires) — the chase list lives on Start now.
  const challenges = [
    { icon: '🍔', title: 'First to $1K Today', prize: "Lunch · Devin's tab", desc: 'First tech to clear $1,000 NET today (after parts + pay). Counts profit, not the sale. Resets 6am.', progress: 'You (net): $680 / $1,000 · $320 to go' },
    { icon: '💧', title: 'Hybrid Heater Bounty', prize: '+$100', desc: 'Sell a hybrid water heater this week. First to log + manager-approve gets $100.', progress: '⏳ Expires in 6 days · open to all' },
  ];
  // ⚡ Power Plunger pulls (earned 5★/memberships) + budget state — the roll-for-a-bonus slot lives on Start now.
  let pp = { active: false, pulls: 0, budgetTapped: false, topPrize: 15 };
  try {
    const cfg = await getConfig(sb);
    pp.topPrize = Number(cfg.top_prize) || 15; pp.active = !!cfg.active;
    if (cfg.active) {
      pp.pulls = await pullsAvailable(sb, { techId: profile.tech_id, name }, cfg);
      pp.budgetTapped = (await budgetSpent(sb, cfg.budget_period)) >= Number(cfg.budget_cap);
    }
  } catch (_) {}
  return (
    <StartOfDay
      bounties={bounties}
      challenges={challenges}
      pp={pp}
      leaveBy={leaveBy}
      sodGate={{ sod: sodRow || {}, tools: sodTools, handbook: sodHandbook, helper: sodHelper }}
      name={name}
      lastWorked={{ ...lw, pretty: prettyDay(lw.dayKey) }}
      scorecard={scorecard}
      rankings={rankings}
      fieldSize={fieldSize}
      overallRank={overallRank}
      fx={fx}
      jobs={jobs}
      win={winCondition(scorecard, rankings)}
      onCall={onCall}
      saved={saved}
      roastLevel={profile.roastLevel || 'PG'}
    />
  );
}
