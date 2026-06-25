import { requirePerm } from '@/lib/guard';
import OnCallBanners from './OnCallBanners';

export const dynamic = 'force-dynamic';

// On-call windows the tech must acknowledge (sample; seam = on_call_schedule, mig 65).
const ONCALL = [
  { id: 'wknd', title: "You're on-call this weekend", window: 'Fri Jun 13 6:00 PM → Mon Jun 16 7:00 AM · Primary · assigned by Tracey' },
  { id: 'week', title: "You're on-call this week", window: 'Mon Jun 8 → Fri Jun 12 · nightly 5:00 PM → 7:00 AM (weekday after-hours) · Primary · assigned by Tracey' },
];

// My Calendar — ported from the live iPad SPA (CB_Dispatch_TechIpadHtml_v1.js, pane-cal). The live
// screen pulls from Google Calendar via CB_Tech_CalendarBridge (cbCal_listUpcoming_, every 5 min):
// jobs, callbacks, inspections/811 returns, training, PTO, mandatory meetings. All events isolated in
// `cal` below = the seam where the real feed (Calendar Bridge → Supabase) drops in. Sample for now.
const cal = {
  todayLabel: 'Today',
  todayCount: '4 jobs · 1 callback due',
  today: [
    { time: '2:00 PM', color: '#ffc107', title: '📞 Call Margaret Wells', sub: '859-555-0142 · 22 Apple Ln, Richmond KY · J-1221 follow-up', note: 'You promised Monday — make this one count.', tel: '+18595550142' },
  ],
  pendingReview: { job: 'J-1219 Murphy', desc: 'Callback fired yesterday on a drain re-clog. Manager reviews evidence (Pete recording, before/after photos, texts) and classifies before 8 AM.' },
  week: [
    { when: 'Thu 9:30 AM', color: '#64b5f6', title: '🔧 811 Return · J-1218 Adkins', sub: '567 Walnut St · tracer wire + sight pipe + green sticker · 45 min' },
    { when: 'Fri 4:00 PM', color: '#4caf50', title: '🎓 Training · Backflow Recertification', sub: 'CB Shop · 1 hr · mandatory by 6/15 license renewal' },
    { when: 'Sat ALL DAY', color: '#ba68c8', title: '📅 PTO (APPROVED)', sub: 'Approved by Ronnie · 5/22', dim: true },
  ],
};

const LEGEND = [
  ['#ff5252', '🚨 RED — Mandatory shop meeting (Tier 3 callback)'],
  ['#ffc107', '📞 YELLOW — Customer callback promise'],
  ['#64b5f6', '🔧 BLUE — Inspection / 811 return'],
  ['#4caf50', '🎓 GREEN — Training / coaching'],
  ['#ba68c8', '📅 GRAPE — PTO'],
];

export default async function Calendar() {
  await requirePerm('seeOwnPayOnly', 'seeOwnOnly', 'changeStatus', 'seeReports');
  const todayLabel = new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1" style={{ marginBottom: 2 }}>📆 My Calendar</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>Sample view — live sync from Google Calendar (CB Calendar Bridge) wires next: jobs · callbacks · inspections · training · PTO.</div>

      <OnCallBanners windows={ONCALL} />

      {/* TODAY */}
      <div className="card" style={{ background: 'linear-gradient(135deg, color-mix(in oklab, var(--amber) 16%, var(--surface-1)) 0%, var(--surface-1) 100%)', border: '1px solid var(--amber)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>📅</span>
          <strong style={{ color: 'var(--amber)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em' }}>{cal.todayLabel} · {todayLabel}</strong>
          <span style={{ background: 'var(--amber)', color: '#1a1a1a', padding: '1px 7px', borderRadius: 9, fontSize: 9, fontWeight: 800, marginLeft: 'auto' }}>{cal.todayCount}</span>
        </div>
        {cal.today.map((e, i) => (
          <div key={i} style={{ background: 'rgba(255,193,7,0.1)', borderLeft: `4px solid ${e.color}`, borderRadius: '0 6px 6px 0', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 800, color: e.color, minWidth: 60 }}>{e.time}</div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 700 }}>{e.title}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-2)' }}>{e.sub}</div>
              {e.note && <div style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 2, fontStyle: 'italic' }}>{e.note}</div>}
            </div>
            {e.tel && <a href={`tel:${e.tel}`} style={{ background: 'var(--amber)', color: '#1a1a1a', padding: '7px 14px', borderRadius: 6, fontSize: 11, fontWeight: 800, textDecoration: 'none' }}>📞 Call now</a>}
          </div>
        ))}
      </div>

      {/* PENDING MANAGER REVIEW */}
      {cal.pendingReview && (
        <div className="card" style={{ marginTop: 12, background: 'linear-gradient(135deg, var(--amber-deep) 0%, var(--surface-1) 100%)', border: '2px dashed var(--amber-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>⏳</span>
            <strong style={{ color: 'var(--amber)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em' }}>Pending manager review</strong>
            <span style={{ background: 'var(--amber-dim)', color: 'var(--amber)', padding: '1px 7px', borderRadius: 9, fontSize: 9, fontWeight: 800, marginLeft: 'auto' }}>CALLBACK · {cal.pendingReview.job}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 10, lineHeight: 1.6 }}>{cal.pendingReview.desc}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            {[['✅', 'No Fault', 'Customer mistake · callback WIPED', '#4caf50'], ['💩', 'Half-Ass', 'Partial fault · partial deduct', 'var(--amber)'], ['💩🏆', '100% Turd', 'Full deduct + MANDATORY 8AM meeting', '#ff5252']].map(([ic, t, d, c]) => (
              <div key={t} style={{ background: 'var(--surface-2)', border: `1px solid ${c}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 18 }}>{ic}</div>
                <div style={{ fontSize: 10, color: c, fontWeight: 800, textTransform: 'uppercase', marginTop: 2 }}>{t}</div>
                <div style={{ fontSize: 9, color: 'var(--fg-3)', marginTop: 2 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REST OF WEEK */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <strong style={{ color: 'var(--amber-dim)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em' }}>Rest of this week</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cal.week.map((e, i) => (
            <div key={i} style={{ background: 'var(--surface-2)', borderLeft: `4px solid ${e.color}`, borderRadius: '0 6px 6px 0', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, opacity: e.dim ? 0.85 : 1, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 800, color: e.color, minWidth: 80 }}>{e.when}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 12, color: 'var(--fg-1)', fontWeight: 700 }}>{e.title}</div>
                <div style={{ fontSize: 10, color: 'var(--fg-3)' }}>{e.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LEGEND */}
      <div className="card" style={{ marginTop: 12, border: '1px solid #64b5f6' }}>
        <strong style={{ color: '#64b5f6', display: 'block', marginBottom: 8, fontSize: 11 }}>📆 Color legend · auto-created on your Google Calendar:</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 4, fontSize: 10, color: 'var(--fg-2)' }}>
          {LEGEND.map(([c, t]) => (
            <span key={t}><span style={{ display: 'inline-block', width: 10, height: 10, background: c, borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
