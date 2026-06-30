// P4 scanners — read live state and return candidate alerts for the cron to create as tasks. Each scan
// is independent + fail-soft (a thrown scan yields []). They produce PLAIN alert objects; lib/alerts
// createAlert() does the dedupe + write. v1 covers the conditions reachable with today's data; the rest
// of the WORKFLOWS registry fills in as their data lands (geofence needs tech-location history, etc).

import { learnBaselines, flagLeaks } from './marginLearn';
import { MARGIN_TARGET } from './marginCoach';
import { onCallFor, etWeekday, loadOnCallWindows, pendingOnCall } from './onCall';

const MIN = 60 * 1000;
const ago = (now, ms) => new Date(now - ms).toISOString();
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const who = (j) => j.tech_name || 'Unassigned';

// 1) NO STATUS — enroute too long without arriving, or on-site too long without closing.
export async function scanNoStatus(sb, now) {
  try {
    const { data, error } = await sb.from('jobs')
      .select('id, job_number, status, tech_name, enroute_at, started_at, scheduled_at, customers(name)')
      .in('status', ['enroute', 'on_site', 'onsite', 'rolling']).limit(500);
    if (error) return [];
    const out = [];
    for (const j of data || []) {
      const s = String(j.status || '').toLowerCase();
      const cust = (j.customers && j.customers.name) || j.job_number || 'job';
      if (/enroute|rolling/.test(s) && j.enroute_at && (now - Date.parse(j.enroute_at)) > 90 * MIN) {
        out.push({ kind: 'no_status', entityId: String(j.id), title: `${who(j)} still "en route" 90+ min`, body: `${who(j)} → ${cust} has been en route since ${fmtTime(j.enroute_at)} with no on-site tap. Confirm they arrived.`, meta: { since: j.enroute_at } });
      } else if (/on_?site/.test(s) && j.started_at && (now - Date.parse(j.started_at)) > 4 * 60 * MIN) {
        out.push({ kind: 'no_status', entityId: String(j.id), title: `${who(j)} on-site 4+ hrs, not closed`, body: `${who(j)} has been on-site at ${cust} since ${fmtTime(j.started_at)} with no completion. Check in.`, meta: { since: j.started_at } });
      }
    }
    return out;
  } catch { return []; }
}

// 2) RUNNING LATE — scheduled start is in the past but the tech hasn't rolled → next-customer risk.
export async function scanRunningLate(sb, now) {
  try {
    // Include 'hold' (web bookings in BETA) — a dated hold whose time passed was never confirmed/assigned and
    // had NO watchdog. Unscheduled holds (scheduled_at null) are excluded — they can't be "late" without a time.
    const { data, error } = await sb.from('jobs')
      .select('id, job_number, status, tech_name, scheduled_at, customers(name)')
      .in('status', ['scheduled', 'hold']).not('scheduled_at', 'is', null)
      .lt('scheduled_at', ago(now, 20 * MIN)).gt('scheduled_at', ago(now, 8 * 60 * MIN)).limit(500);
    if (error) return [];
    return (data || []).map((j) => {
      const cust = (j.customers && j.customers.name) || j.job_number || 'job';
      const lateMin = Math.round((now - Date.parse(j.scheduled_at)) / MIN);
      const hold = j.status === 'hold';
      return {
        kind: 'running_late', entityId: String(j.id), severity: lateMin > 60 ? 'high' : 'med',
        title: hold ? `Unconfirmed booking ${lateMin}m past time — ${cust}` : `${who(j)} ${lateMin} min behind at ${cust}`,
        body: hold
          ? `A web booking for ${fmtTime(j.scheduled_at)} is still a HOLD (never confirmed/assigned) and its time has passed. Confirm + assign or call the customer.`
          : `Job was scheduled ${fmtTime(j.scheduled_at)} and the tech hasn't rolled. The next customer is at risk — re-sequence or send help.`,
        meta: { lateMin, hold },
      };
    });
  } catch { return []; }
}

// 3) AR FOLLOW-UP — open balance aged past 30 days. Tolerant of which date/balance columns exist.
export async function scanArFollowup(sb, now) {
  try {
    let res = await sb.from('invoices').select('id, number, balance, status, customer_name, due_date, created_at').gt('balance', 0).limit(800);
    if (res.error) res = await sb.from('invoices').select('id, balance, status, created_at').gt('balance', 0).limit(800);
    if (res.error) return [];
    const out = [];
    for (const inv of res.data || []) {
      const dateStr = inv.due_date || inv.created_at;
      const ageDays = dateStr ? Math.floor((now - Date.parse(dateStr)) / (24 * 60 * MIN)) : null;
      if (ageDays != null && ageDays >= 30) {
        const sev = ageDays >= 60 ? 'high' : 'med';
        out.push({ kind: 'ar_followup', entityId: String(inv.id), severity: sev, title: `AR ${ageDays}d past due${inv.customer_name ? ` — ${inv.customer_name}` : ''}`, body: `$${Number(inv.balance).toLocaleString()} open ${ageDays} days${inv.number ? ` (inv ${inv.number})` : ''}. Work the collection cascade.`, meta: { ageDays, balance: inv.balance } });
      }
    }
    return out;
  } catch { return []; }
}

// 4) ON-CALL UNCLAIMED — an open shift for today/tomorrow nobody grabbed → run the lottery.
export async function scanOncallUnclaimed(sb, now) {
  try {
    const tomorrow = new Date(now + 24 * 60 * MIN).toISOString().slice(0, 10);
    const { data, error } = await sb.from('oncall_offers').select('id, label, shift_date, bonus_cents, status').eq('status', 'open').limit(200);
    if (error) return [];
    return (data || []).filter((o) => !o.shift_date || o.shift_date <= tomorrow).map((o) => ({
      kind: 'oncall_unclaimed', entityId: String(o.id), title: `On-call unclaimed: ${o.label}`,
      body: `${o.label}${o.shift_date ? ` (${o.shift_date})` : ''} still open${o.bonus_cents ? ` despite a $${(o.bonus_cents / 100).toLocaleString()} bonus` : ''}. Claim it or run the forced lottery.`, meta: { bonus_cents: o.bonus_cents },
    }));
  } catch { return []; }
}

// 4b) ON-CALL NOT ACKNOWLEDGED — the banner promises "no ack by deadline → escalates to Tracey + Ronnie,"
// but nothing scanned for it. AFTER the 5pm ET start, if tonight's assigned on-call person hasn't acked their
// window in the app, raise a HIGH task → the escalation tier pushes it to #dispatch. Deduped per rotation.
export async function scanOncallUnacked(sb, now) {
  try {
    const d = new Date(now);
    const etHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(d));
    if (etHour < 17 || etHour >= 23) return [];   // only between 5pm (start) and 11pm — before is premature
    const wd = etWeekday(d);
    if (wd === 'Saturday' || wd === 'Sunday') return []; // weekend was announced/owned Friday
    const { data: sched } = await sb.from('on_call_schedule').select('*').eq('slot', 'current').maybeSingle();
    const oc = onCallFor(sched, wd);
    if (!oc || !oc.person) return [];
    let acked = [];
    try { const { data: prof } = await sb.from('profiles').select('prefs').ilike('name', `%${oc.person}%`).limit(1).maybeSingle(); acked = Array.isArray(prof?.prefs?.oncall_acked) ? prof.prefs.oncall_acked : []; } catch (_) {}
    const windows = await loadOnCallWindows(sb, oc.person);
    if (pendingOnCall(windows, acked) <= 0) return []; // acked → all good
    const first = String(oc.person).toLowerCase().split(/\s+/)[0] || 'oncall';
    return [{
      kind: 'oncall_unclaimed', entityId: `ack-${sched?.id || wd}-${first}`, severity: 'high',
      title: `On-call NOT acknowledged — ${oc.person}`,
      body: `${oc.person} is on-call tonight (5pm→7am) but hasn't acknowledged in the app. Confirm coverage — escalate to Tracey + Ronnie.`,
      meta: { person: oc.person },
    }];
  } catch { return []; }
}

// 5) LOW MARGIN — jobs CLOSED in the last 2 days below the company target (fresh, not historical spam).
export async function scanLowMargin(sb, now) {
  try {
    // Owner-editable target (pricing_settings.margin_target_pct, mig 151) → falls back to the MARGIN_TARGET code default.
    let target = MARGIN_TARGET;
    try { const { data: ps } = await sb.from('pricing_settings').select('margin_target_pct').eq('id', 1).maybeSingle(); if (ps && ps.margin_target_pct != null) target = Number(ps.margin_target_pct); } catch (_) {}
    const { data, error } = await sb.from('jobs')
      .select('id, job_type, status, amount, material_cost_cents, dispatch_fee_cents, tech_name, completed_at')
      .in('status', ['done', 'complete', 'completed', 'closed', 'invoiced']).limit(2000);
    if (error) return []; // includes "column does not exist" when migration 73 isn't live → no-op
    const baselines = learnBaselines(data || []);
    const recent = (data || []).filter((j) => j.completed_at && (now - Date.parse(j.completed_at)) <= 2 * 24 * 60 * MIN);
    const { flags } = flagLeaks(recent, baselines, { target });
    return flags.filter((f) => f.leakCents >= 5000).map((f) => ({
      kind: 'low_margin', entityId: String(f.id), severity: f.severity === 'high' ? 'high' : 'med',
      title: `Low margin: ${f.typeLabel} (${f.marginPct}%)`,
      body: `${f.typeLabel}${f.customer ? ` for ${f.customer}` : ''} closed at ${f.marginPct}% — ~$${Math.round(f.leakCents / 100).toLocaleString()} leaking (${f.reasons.map((r) => r.code).join(', ')}). Review on Leak Radar.`,
      meta: { leakCents: f.leakCents, reasons: f.reasons.map((r) => r.code) },
    }));
  } catch { return []; }
}

// A web lead that's sat 'new' and untouched needs a watchdog — speed-to-lead is everything in plumbing.
// /api/leads pings the office on arrival; THIS is the backstop if nobody works it. Window 2h–3d so a stale
// backlog of dead leads can't blast (older = cold, no point). One task per lead (deduped); the escalation
// tier (escalateStaleAlerts) then pushes it to #dispatch if it keeps sitting unclaimed.
export async function scanStaleLeads(sb, now) {
  try {
    const res = await sb.from('web_leads').select('id, name, phone, address, service, status, created_at')
      .eq('status', 'new').order('created_at', { ascending: true }).limit(300);
    if (res.error) return [];
    const out = [];
    for (const l of res.data || []) {
      const ageMin = l.created_at ? Math.floor((now - Date.parse(l.created_at)) / MIN) : null;
      if (ageMin == null || ageMin < 120 || ageMin > 3 * 24 * 60) continue; // 2h grace … 3-day cap
      const who = l.name || l.phone || 'Web lead';
      const hrs = Math.floor(ageMin / 60);
      out.push({
        kind: 'missed_lead', entityId: String(l.id), severity: 'high',
        title: `Untouched web lead — ${who}${l.address ? '' : ' · ⚠️ NO ADDRESS'}`,
        body: `${who}${l.phone ? ` · ${l.phone}` : ''}${l.service ? ` · ${l.service}` : ''} — came in ${hrs}h ago, still 'new'. Work it in Web Leads${l.address ? '' : ' (call to get the address first)'}.`,
        meta: { ageMin, noAddress: !l.address },
      });
    }
    return out;
  } catch { return []; }
}

export const ALL_SCANS = [scanNoStatus, scanRunningLate, scanArFollowup, scanOncallUnclaimed, scanLowMargin, scanStaleLeads, scanOncallUnacked];
