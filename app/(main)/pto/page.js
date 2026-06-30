import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { can } from '@/lib/roles';
import RequestVacation from './RequestVacation';
import PtoApprovals from './PtoApprovals';
import AbsenceReport from './AbsenceReport';
import AbsenceOverride from './AbsenceOverride';
import HireDateAdmin from './HireDateAdmin';
import OnCallBanners from '../cal/OnCallBanners';
import { loadOnCallWindows } from '@/lib/onCall';
import { vacationStatus, lastAnniversary, holidaysForfeited, fmtHours, VACATION_HOURS, HOLIDAY_DAYS, UNEXCUSED_FORFEIT } from '@/lib/pto';

const fmtD = (s) => { if (!s) return ''; try { return new Date(s + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return s; } };
const KIND_ICON = { vacation: '🏖', sick: '🤒', personal: '🙋', unpaid: '💸' };
const REQ_COLOR = { pending: 'var(--amber)', approved: 'var(--green)', denied: 'var(--red)' };

export const dynamic = 'force-dynamic';

// Time Off & Holidays — ported from the live iPad SPA (pane-pto). CB benefit: 1 wk vacation (40 hrs) +
// 5 paid holidays, all at HOURLY rate (no commission), routed through the Field Supervisor. Unexcused-
// absence rule (2 = forfeit all 5 holidays) matches Tech Sheet AutoFill_412_1e. Holiday/on-call roster
// is set by OM 30+ days out. All values isolated below = the seam for the live time-off/roster feed.
// Vacation balance / used / holidays / on-call are now REAL (computed in lib/pto.js from hire_date +
// time_off + absences). Only the holiday-coverage roster below is still sample data (the live roster feed
// wires next). pending/paid/nonPaid = illustrative roster rows.
const pto = {
  pending: [
    { label: 'June 12 · Fri (vacation)', state: 'PENDING FS', color: 'var(--amber)' },
    { label: 'July 4-7 · Mon-Thu (vacation)', state: 'APPROVED ✓', color: 'var(--green-bright)' },
  ],
  paid: [
    { date: 'May 26 · Memorial Day', today: true, tech: 'Matt Shepard', you: true, helper: 'Kade Dow', sup: 'Chris W' },
    { date: 'July 4 · Independence Day', tech: 'Dalton Reese', helper: 'Avery Lane', sup: 'Ronnie' },
    { date: 'Sept 1 · Labor Day', tech: 'Josh Carter', helper: 'Kade Dow', sup: 'Chris W' },
    { date: 'Nov 27 · Thanksgiving', tech: 'Matt Shepard', you: true, helper: 'Avery Lane', sup: 'Ronnie' },
    { date: 'Dec 25 · Christmas', tech: 'Dalton Reese', helper: 'Kade Dow', sup: 'Chris W' },
  ],
  nonPaid: [
    { date: "Jan 1 · New Year's Day", tech: 'Josh Carter', helper: 'Kade Dow', sup: 'Chris W' },
    { date: 'Jan 19 · MLK Day', tech: 'Dalton Reese', helper: 'Avery Lane', sup: 'Ronnie' },
    { date: 'June 19 · Juneteenth', tech: 'Matt Shepard', you: true, helper: 'Kade Dow', sup: 'Chris W' },
    { date: 'Nov 11 · Veterans Day', tech: 'Josh Carter', helper: 'Avery Lane', sup: 'Ronnie' },
    { date: 'Dec 24 · Christmas Eve', tech: 'Dalton Reese', helper: 'Kade Dow', sup: 'Chris W' },
  ],
};

function StatCard({ h, v, d, dc }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</div>
      <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{v}</div>
      <div style={{ fontSize: 11, color: dc || 'var(--fg-3)', marginTop: 2 }}>{d}</div>
    </div>
  );
}

function BurnStep({ n, accent, tint, title, sub, right }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 10, alignItems: 'center', background: tint, borderLeft: `3px solid ${accent}`, padding: '8px 10px', borderRadius: '0 6px 6px 0' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800, color: accent, textAlign: 'center' }}>{n}</div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--fg-1)', fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 10, color: 'var(--fg-3)' }}>{sub}</div>
      </div>
      {right}
    </div>
  );
}

function Person({ role, name, you, icon }) {
  return (
    <span style={{ background: 'var(--surface-2)', borderRadius: 6, padding: '3px 8px', color: 'var(--fg-2)', fontSize: 10 }}>
      {icon} {role} <strong style={{ color: you ? 'var(--amber)' : 'var(--fg-1)' }}>{name}</strong>
      {you && <span style={{ background: 'var(--amber)', color: '#1a1a1a', padding: '0 5px', borderRadius: 5, fontSize: 8, fontWeight: 800, marginLeft: 3 }}>YOU</span>}
    </span>
  );
}

function HolidayRow({ h, paid }) {
  return (
    <div className="card" style={{ padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 700 }}>{paid && '✓ '}{h.date}{h.today && <span style={{ color: 'var(--fg-3)', fontSize: 10 }}> (today)</span>}</div>
        <span style={{ background: paid ? 'rgba(76,175,80,0.15)' : 'rgba(255,183,77,0.13)', color: paid ? 'var(--green-bright)' : '#ffb74d', padding: '2px 8px', borderRadius: 7, fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap' }}>{paid ? 'PAID · 8hr' : 'NON-PAID · OT if worked'}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Person role="Tech" name={h.tech} you={h.you} icon="🔧" />
        <Person role="Helper" name={h.helper} icon="🤝" />
        <Person role="Sup" name={h.sup} icon="👷" />
      </div>
    </div>
  );
}

export default async function Pto() {
  const { user, role, profile } = await requirePerm('seeOwnPayOnly', 'seeOwnOnly', 'changeStatus', 'seeReports');
  const name = profile?.name || user.email;

  // Real time-off requests: the tech's own + (for approvers) the pending queue. Fail-soft.
  const isApprover = can(role, 'manageUsers') || can(role, 'assignJobs') || can(role, 'seeCrew');
  let myReqs = [], pendingReqs = [], myUnexcused = 0, recentAbsences = [];
  let hireDate = null, payType = '', vacPullDays = 0, roster = [];
  // Calendar side (merged Cal+PTO): on-call status this week + today's job count.
  let onCall = '', todayJobs = 0, onCallWindows = [];
  const ackedIds = Array.isArray(profile.prefs?.oncall_acked) ? profile.prefs.oncall_acked : [];
  const yearStart = new Date().getFullYear() + '-01-01';
  if (isAdminConfigured) {
    const sb = getSupabaseAdmin();
    try {
      const { data: oc } = await sb.from('on_call_schedule').select('*').eq('slot', 'current').maybeSingle();
      if (oc && name) { const n = String(name).toLowerCase().split(/\s+/)[0]; const hit = ['mon', 'tue', 'wed', 'thu', 'weekend', 'helper_week', 'supervisor'].find((k) => String(oc[k] || '').toLowerCase().includes(n)); if (hit) onCall = hit === 'weekend' ? 'on-call this weekend' : hit === 'helper_week' ? 'helper on-call this week' : 'on-call this week'; }
    } catch (_) {}
    // The full acknowledge banners (restored) — windows this tech is on-call for, each tagged acked from prefs.
    try { onCallWindows = (await loadOnCallWindows(sb, name)).map((w) => ({ ...w, acked: ackedIds.includes(w.id) })); } catch (_) {}
    try { if (profile?.tech_id) { const s = new Date(); s.setHours(0, 0, 0, 0); const e = new Date(); e.setHours(23, 59, 59, 999); const { count } = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('tech_id', profile.tech_id).gte('scheduled_at', s.toISOString()).lte('scheduled_at', e.toISOString()); todayJobs = count || 0; } } catch (_) {}
    try { const { data } = await sb.from('time_off_requests').select('id, kind, start_date, end_date, status, reason, decided_by_name, decision_note').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12); myReqs = data || []; } catch (_) {}
    if (isApprover) { try { const { data } = await sb.from('time_off_requests').select('id, tech_name, kind, start_date, end_date, reason').eq('status', 'pending').order('start_date', { ascending: true }).limit(40); pendingReqs = data || []; } catch (_) {} }
    // Real unexcused-this-year count (policy: 2 = forfeit holidays). Manager sees recent absences to override.
    try { const { count } = await sb.from('absences').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'unexcused').gte('absence_date', yearStart); myUnexcused = count || 0; } catch (_) {}
    if (isApprover) { try { const { data } = await sb.from('absences').select('id, tech_name, absence_date, status, reason, doc_path, decided_by_name').gte('absence_date', yearStart).order('absence_date', { ascending: false }).limit(30); recentAbsences = data || []; } catch (_) {} }
    // Real vacation balance inputs: hire date (anniversary grant) + pay type. For salary/supervisors, sick &
    // personal days PULL from vacation — count those since the anniversary so the balance reflects it. Fail-soft
    // (pre-153 has no hire_date; pre-152 has no category) so /pto never breaks if a migration is behind.
    try { if (profile?.tech_id) { const { data: pp } = await sb.from('pay_profiles').select('hire_date, pay_type').eq('tech_id', profile.tech_id).maybeSingle(); if (pp) { hireDate = pp.hire_date || null; payType = String(pp.pay_type || '').toLowerCase(); } } } catch (_) {}
    if (payType === 'salary' && hireDate) {
      try { const anniv = lastAnniversary(hireDate); const { count } = await sb.from('absences').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('absence_date', anniv.toISOString().slice(0, 10)).in('category', ['sick', 'doctor', 'personal', 'other']); vacPullDays = count || 0; } catch (_) {}
    }
    // Office roster (crew with a tech_id) + their current hire dates, for the hire-date editor below.
    if (isApprover) {
      try {
        const { data: profs } = await sb.from('profiles').select('name, role, tech_id, active').not('tech_id', 'is', null).eq('active', true);
        const ids = (profs || []).map((p) => p.tech_id).filter(Boolean);
        let byTech = {};
        if (ids.length) { try { const { data: pps } = await sb.from('pay_profiles').select('tech_id, hire_date').in('tech_id', ids); (pps || []).forEach((p) => { byTech[p.tech_id] = p.hire_date || null; }); } catch (_) {} }
        roster = (profs || []).filter((p) => p.name).map((p) => ({ techId: p.tech_id, name: p.name, role: p.role || 'tech', hireDate: byTech[p.tech_id] || null })).sort((a, b) => a.name.localeCompare(b.name));
      } catch (_) {}
    }
  }
  // The real vacation picture — replaces the old hardcoded '40 hrs'.
  const vac = vacationStatus({ hireDate, timeOff: myReqs, vacationPullDays: vacPullDays });
  const forfeited = holidaysForfeited(myUnexcused);
  const pct = Math.min(100, (myUnexcused / UNEXCUSED_FORFEIT) * 100);

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1" style={{ marginBottom: 2 }}>📆 Calendar &amp; Time Off</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>Your schedule, on-call, and time off in one place.</div>

      {/* ☎️ ON-CALL — acknowledge banners (blink until you tap; the ack persists + clears the Cal badge). */}
      <OnCallBanners windows={onCallWindows} />

      {/* ── 📅 CALENDAR ── */}
      <div className="card card-amber" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>📅 {new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{todayJobs} job{todayJobs === 1 ? '' : 's'} today{onCall ? ` · ☎️ ${onCall}` : ''}</div>
        </div>
        {onCall && <span className="pill cb-blink" style={{ color: 'var(--amber)', border: '1px solid var(--amber)' }}>☎️ {onCall}</span>}
        <a href="/my-day" className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>Open My Day →</a>
      </div>
      <div className="muted" style={{ fontSize: 11, margin: '6px 0 16px' }}>Jobs, callbacks, inspections, training &amp; meetings show on My Day; on-call is set by the office. Google Calendar sync wires next.</div>

      <h3 style={{ fontSize: 13, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px' }}>🏖 Time Off &amp; Holidays</h3>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>CB benefit: 1 week vacation (40 hrs) + 5 paid holidays · all paid at HOURLY rate (no commission) · routes through Field Supervisor.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <StatCard h="Vacation Balance"
          v={!vac.hasHireDate ? '—' : vac.earned ? fmtHours(vac.balanceHours) : '0 hrs'}
          d={!vac.hasHireDate ? 'office: add hire date' : vac.earned ? `of ${VACATION_HOURS} hrs · use it or lose it` : `earns ${VACATION_HOURS} hrs at 1-yr mark`}
          dc="var(--green)" />
        <StatCard h="Used this year"
          v={vac.hasHireDate ? fmtHours(vac.usedHours) : '—'}
          d={vac.overdrawnHours > 0 ? `${fmtHours(vac.overdrawnHours)} over → pro-rated dock` : 'since your anniversary'}
          dc={vac.overdrawnHours > 0 ? 'var(--red)' : 'var(--fg-3)'} />
        <StatCard h="Paid Holidays"
          v={forfeited ? '0 / 5' : vac.holidaysEligible ? `${HOLIDAY_DAYS} / yr` : 'pending'}
          d={forfeited ? '🚨 forfeited · 2 unexcused' : vac.holidaysEligible ? '8 hrs hourly each' : vac.hasHireDate ? `eligible in ${vac.daysToHolidayEligible}d` : 'after 90 days'}
          dc={forfeited ? 'var(--red)' : 'var(--green-bright)'} />
        <StatCard h="On-Call" v={onCall ? '✓ YES' : '—'} d={onCall || 'not scheduled this week'} dc="#58a6ff" />
      </div>

      {/* UNEXCUSED ABSENCE COUNTER */}
      <div className="card" style={{ marginTop: 14, background: 'linear-gradient(135deg, color-mix(in oklab, #4caf50 16%, var(--surface-1)) 0%, var(--surface-1) 100%)', border: '2px solid #4caf50' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>⚠</span>
          <div style={{ flex: 1 }}>
            <strong style={{ color: '#a5d6a7', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em' }}>Unexcused absence counter · this year</strong>
            <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>Rule: <strong style={{ color: '#ffb74d' }}>2 unexcused = ALL 5 holidays FORFEITED</strong> for the year. No exceptions, no humor.</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 900, color: '#4caf50', lineHeight: 1 }}>{myUnexcused} / {UNEXCUSED_FORFEIT}</div>
            <div style={{ fontSize: 9, color: '#a5d6a7', textTransform: 'uppercase', fontWeight: 800 }}>{myUnexcused === 0 ? 'CLEAR ✓' : myUnexcused === 1 ? 'WARNING' : 'FORFEITED'}</div>
          </div>
        </div>
        <div style={{ position: 'relative', height: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #4caf50, #66bb6a)' }} />
          <div style={{ position: 'absolute', top: 0, left: '50%', width: 2, height: '100%', background: '#ffb74d' }} />
          <div style={{ position: 'absolute', top: 0, left: 'calc(100% - 2px)', width: 2, height: '100%', background: '#ff5252' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fg-3)', marginTop: 4 }}>
          <span>0 · clear</span><span style={{ color: '#ffb74d' }}>1 · warning</span><span style={{ color: '#ff5252' }}>2 · 🚨 HOLIDAYS FORFEITED</span>
        </div>
      </div>

      <div style={{ marginTop: 14 }}><RequestVacation /><AbsenceReport /></div>

      {/* SALARY TECH · PTO BURN-DOWN HIERARCHY — ported from the iPad pane-pto. When a salary tech misses
          work, paid time off burns holidays → vacation → pro-rated dock, in that order. */}
      <div className="card" style={{ marginTop: 14, background: 'linear-gradient(135deg, var(--amber-deep) 0%, var(--surface-1) 100%)', border: '1px solid var(--amber-dim)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>📋</span>
          <strong style={{ color: 'var(--amber)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em' }}>Salary Tech · PTO burn-down hierarchy</strong>
          <span style={{ background: 'rgba(255,179,0,0.18)', color: 'var(--amber)', padding: '1px 7px', borderRadius: 9, fontSize: 9, fontWeight: 800, marginLeft: 'auto' }}>if you&apos;re salary</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 10, lineHeight: 1.5 }}>When you miss work, your paid time off burns in this order before salary docking kicks in:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <BurnStep n="1" accent="#4caf50" tint="rgba(76,175,80,0.06)" title="🎄 Holiday days absorb first" sub="5 days/yr · 8hr × hourly base each" right={<span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: forfeited ? '#ff5252' : '#4caf50', fontWeight: 800 }}>{forfeited ? 'forfeited' : `${HOLIDAY_DAYS} left`}</span>} />
          <BurnStep n="2" accent="var(--amber)" tint="rgba(255,179,0,0.06)" title="🏖 Vacation absorbs next" sub="40 hrs/yr · 1 full week · hourly base rate, no commission" right={<span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: 'var(--amber)', fontWeight: 800 }}>{vac.hasHireDate ? `${fmtHours(vac.balanceHours)} left` : 'set hire date'}</span>} />
          <BurnStep n="3" accent="#ff5252" tint="rgba(255,82,82,0.06)" title="💸 PRO-RATED salary dock" sub="Once Holiday + Vacation both exhausted → salary deducted proportionally for missed time" right={<span style={{ background: '#ff5252', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 9, fontWeight: 800 }}>LAST RESORT</span>} />
        </div>
        <div style={{ background: 'rgba(255,138,101,0.08)', borderLeft: '3px solid #ff8a65', padding: '7px 10px', marginTop: 10, borderRadius: '0 5px 5px 0', fontSize: 10, color: 'var(--fg-2)', lineHeight: 1.5 }}>
          ⚠ <strong style={{ color: '#ff8a65' }}>Salary unexcused rule on top of holiday forfeit:</strong> 2+ unexcused absences/yr triggers a <strong>performance review</strong> with Ronnie + Tracey + Devin. Repeated pattern → review escalates beyond holiday forfeit.
        </div>
      </div>

      {/* HOW VACATION + HOLIDAY PAY WORKS — amber explainer, matches the Tech Sheet rules. */}
      <div className="card" style={{ marginTop: 14, background: 'rgba(255,179,0,0.06)', border: '1px solid var(--amber-dim)', fontSize: 11, color: 'var(--fg-2)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--amber)' }}>💰 How vacation + holiday pay works:</strong><br />
        • <strong>Vacation</strong> = 40 hrs/yr · paid at <strong>your</strong> hourly base rate · <strong style={{ color: '#ff8a65' }}>NO commission on vacation pay</strong><br />
        • <strong>Holiday</strong> = 5 days/yr · 8 hrs each · paid at <strong>your</strong> hourly base rate (8 hrs × your rate) · <strong style={{ color: '#ff8a65' }}>NO commission</strong><br />
        • <strong style={{ color: '#ffb74d' }}>2+ unexcused absences/yr</strong> = ALL 5 holidays FORFEITED for the year · auto-calc via Tech Sheet · manager email + audit log<br />
        • Excused absence (sick w/ notice, doctor note, family emergency w/ Tracey approval) does NOT count against you · UNEXCUSED = no call/no show or last-minute bail without legit reason
      </div>

      {/* Office: set hire dates — the anchor for vacation anniversary + 90-day holiday eligibility */}
      {isApprover && <HireDateAdmin roster={roster} />}

      {/* Manager: recent absences — policy already decided; override is logged */}
      {isApprover && recentAbsences.length > 0 && (
        <div className="card" style={{ marginTop: 14, borderLeft: '3px solid var(--blue)' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 2 }}>📋 Absences · this year</div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>Policy decided each one. Override only on a real exception — it’s logged against your name.</div>
          <AbsenceOverride items={recentAbsences.map((a) => ({ id: a.id, status: a.status, label: `${a.tech_name || 'Tech'} · ${fmtD(a.absence_date)}${a.reason ? ` — ${a.reason}` : ''}${a.doc_path ? ' · 📄 note on file' : ''}` }))} />
        </div>
      )}

      {/* Manager: pending approvals */}
      {isApprover && pendingReqs.length > 0 && (
        <div className="card" style={{ marginTop: 14, borderLeft: '3px solid var(--amber)' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🗳 Pending approvals · {pendingReqs.length}</div>
          <PtoApprovals items={pendingReqs.map((r) => ({ ...r, label: `${KIND_ICON[r.kind] || ''} ${r.tech_name || 'Tech'} · ${fmtD(r.start_date)}${r.end_date ? `–${fmtD(r.end_date)}` : ''}${r.reason ? ` — ${r.reason}` : ''}` }))} />
        </div>
      )}

      {/* My real requests */}
      {myReqs.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>📋 My time-off requests</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {myReqs.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13 }}>{KIND_ICON[r.kind] || '📅'}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{fmtD(r.start_date)}{r.end_date ? `–${fmtD(r.end_date)}` : ''}<span className="muted"> · {r.kind}{r.reason ? ` · ${r.reason}` : ''}</span>{r.status !== 'pending' && r.decided_by_name ? <span className="muted"> · by {r.decided_by_name}{r.decision_note ? ` (${r.decision_note})` : ''}</span> : ''}</div>
                <span className="pill" style={{ fontSize: 10, color: REQ_COLOR[r.status], border: `1px solid ${REQ_COLOR[r.status]}` }}>{r.status.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ margin: '16px 0 8px', fontSize: 13, color: 'var(--amber-dim)', textTransform: 'uppercase' }}>Pending Requests</h3>
      <div className="card">
        {pto.pending.map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
            <span style={{ color: 'var(--fg-2)', fontSize: 13 }}>{p.label}</span>
            <span style={{ color: p.color, fontWeight: 800, fontSize: 12 }}>{p.state}</span>
          </div>
        ))}
      </div>

      <h3 style={{ margin: '16px 0 6px', fontSize: 13, color: 'var(--amber-dim)', textTransform: 'uppercase' }}>Holidays &amp; on-call coverage</h3>
      <div style={{ fontSize: 10, color: 'var(--fg-3)', margin: '0 0 10px', lineHeight: 1.55 }}>OM sets the on-call roster 30+ days out. <strong style={{ color: 'var(--green-bright)' }}>Paid</strong> = 8hr hourly (no commission). <strong style={{ color: '#ffb74d' }}>Non-paid</strong> = your regular/OT rate, only for hours you actually work.</div>

      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--green-bright)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>● Paid holidays · 8hr hourly (5)</div>
      {pto.paid.map((h, i) => <HolidayRow key={i} h={h} paid />)}

      <div style={{ fontSize: 10, fontWeight: 800, color: '#ffb74d', textTransform: 'uppercase', letterSpacing: '.05em', margin: '12px 0 6px' }}>● Non-paid holidays · on-call still runs</div>
      {pto.nonPaid.map((h, i) => <HolidayRow key={i} h={h} />)}
    </div>
  );
}
