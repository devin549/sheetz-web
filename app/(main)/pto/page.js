import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { can } from '@/lib/roles';
import RequestVacation from './RequestVacation';
import PtoApprovals from './PtoApprovals';

const fmtD = (s) => { if (!s) return ''; try { return new Date(s + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return s; } };
const KIND_ICON = { vacation: '🏖', sick: '🤒', personal: '🙋', unpaid: '💸' };
const REQ_COLOR = { pending: 'var(--amber)', approved: 'var(--green)', denied: 'var(--red)' };

export const dynamic = 'force-dynamic';

// Time Off & Holidays — ported from the live iPad SPA (pane-pto). CB benefit: 1 wk vacation (40 hrs) +
// 5 paid holidays, all at HOURLY rate (no commission), routed through the Field Supervisor. Unexcused-
// absence rule (2 = forfeit all 5 holidays) matches Tech Sheet AutoFill_412_1e. Holiday/on-call roster
// is set by OM 30+ days out. All values isolated below = the seam for the live time-off/roster feed.
const pto = {
  vacationBalance: '40 hrs', usedYtd: '0 hrs', paidHolidays: '5 / yr', onCall: '2 of 8', onCallNext: 'June 14-15',
  unexcused: 0, unexcusedMax: 2,
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
  const { user, role } = await requirePerm('seeOwnPayOnly', 'seeOwnOnly', 'changeStatus', 'seeReports');
  const pct = Math.min(100, (pto.unexcused / pto.unexcusedMax) * 100);

  // Real time-off requests: the tech's own + (for approvers) the pending queue. Fail-soft.
  const isApprover = can(role, 'manageUsers') || can(role, 'assignJobs') || can(role, 'seeCrew');
  let myReqs = [], pendingReqs = [];
  if (isAdminConfigured) {
    const sb = getSupabaseAdmin();
    try { const { data } = await sb.from('time_off_requests').select('id, kind, start_date, end_date, status, reason, decided_by_name, decision_note').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12); myReqs = data || []; } catch (_) {}
    if (isApprover) { try { const { data } = await sb.from('time_off_requests').select('id, tech_name, kind, start_date, end_date, reason').eq('status', 'pending').order('start_date', { ascending: true }).limit(40); pendingReqs = data || []; } catch (_) {} }
  }

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1" style={{ marginBottom: 2 }}>📅 Time Off &amp; Holidays</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>CB benefit: 1 week vacation (40 hrs) + 5 paid holidays · all paid at HOURLY rate (no commission) · routes through Field Supervisor. <em>Sample — live time-off/roster feed wires next.</em></div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <StatCard h="Vacation Balance" v={pto.vacationBalance} d="1 full week · resets Jan 1" dc="var(--green)" />
        <StatCard h="Used YTD" v={pto.usedYtd} d="0 days taken" />
        <StatCard h="Paid Holidays" v={pto.paidHolidays} d="$X each · 8 hrs hourly" dc="var(--green-bright)" />
        <StatCard h="On-Call Weekends" v={pto.onCall} d={`next: ${pto.onCallNext}`} dc="#58a6ff" />
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
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 900, color: '#4caf50', lineHeight: 1 }}>{pto.unexcused} / {pto.unexcusedMax}</div>
            <div style={{ fontSize: 9, color: '#a5d6a7', textTransform: 'uppercase', fontWeight: 800 }}>{pto.unexcused === 0 ? 'CLEAR ✓' : pto.unexcused === 1 ? 'WARNING' : 'FORFEITED'}</div>
          </div>
        </div>
        <div style={{ position: 'relative', height: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #4caf50, #66bb6a)' }} />
          <div style={{ position: 'absolute', top: 0, left: '50%', width: 2, height: '100%', background: '#ffb74d' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fg-3)', marginTop: 4 }}>
          <span>0 · clear</span><span style={{ color: '#ffb74d' }}>1 · warning</span><span style={{ color: '#ff5252' }}>2 · 🚨 HOLIDAYS FORFEITED</span>
        </div>
      </div>

      <div style={{ marginTop: 14 }}><RequestVacation /></div>

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
