import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const DONE = ['done', 'complete', 'completed', 'closed', 'invoiced', 'paid'];
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString();
const weekKey = (iso) => { const d = new Date(iso); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.toISOString().slice(0, 10); };
const monthKey = (iso) => String(iso).slice(0, 7);
const monthLabel = (k) => { try { return new Date(k + '-15').toLocaleDateString([], { month: 'long', year: 'numeric' }); } catch { return k; } };

// 🏆 My Record (Career) — lifetime stats, never resets. Real where the data supports it; the rest stay
// honest placeholders until their source is wired (total pay = payroll history, streak = on-time archive).
export default async function Record() {
  const { profile, user } = await requirePerm('seeOwnPayOnly', 'seeOwnOnly', 'changeStatus');
  const name = profile.name || user.email;

  let jobs = [], reviews = [], live = false;
  if (isAdminConfigured && (profile.tech_id || name)) {
    const sb = getSupabaseAdmin();
    try {
      let jq = profile.tech_id
        ? await sb.from('jobs').select('amount, status, scheduled_at, completed_at, job_type, customers(name)').eq('tech_id', profile.tech_id).in('status', DONE).limit(5000)
        : await sb.from('jobs').select('amount, status, scheduled_at, completed_at, job_type, customers(name)').ilike('tech_name', name).in('status', DONE).limit(5000);
      if (!jq.error) { jobs = jq.data || []; live = true; }
    } catch (_) {}
    try { const { data } = await sb.from('reviews').select('rating').ilike('tech_name', name); reviews = data || []; } catch (_) {}
  }

  const revenue = jobs.reduce((s, j) => s + (Number(j.amount) || 0), 0);
  const count = jobs.length;
  const avgTicket = count ? revenue / count : 0;
  const biggest = jobs.reduce((b, j) => (Number(j.amount) || 0) > (Number(b?.amount) || 0) ? j : b, null);
  const firstDate = jobs.reduce((min, j) => { const d = j.completed_at || j.scheduled_at; return d && (!min || d < min) ? d : min; }, null);
  const byWeek = {}; jobs.forEach((j) => { const d = j.completed_at || j.scheduled_at; if (d) { const k = weekKey(d); byWeek[k] = (byWeek[k] || 0) + (Number(j.amount) || 0); } });
  const bestWeek = Object.entries(byWeek).sort((a, b) => b[1] - a[1])[0];
  const ratingN = reviews.length;
  const ratingAvg = ratingN ? (reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / ratingN) : 0;

  // Monthly compare — last 6 months.
  const byMonth = {};
  jobs.forEach((j) => { const d = j.completed_at || j.scheduled_at; if (d) { const k = monthKey(d); const m = (byMonth[k] = byMonth[k] || { rev: 0, jobs: 0 }); m.rev += Number(j.amount) || 0; m.jobs += 1; } });
  const months = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);

  const cards = [
    ['Total Revenue', money(revenue), firstDate ? `since ${String(firstDate).slice(0, 7)}` : 'lifetime'],
    ['Jobs Closed', count.toLocaleString(), `${money(avgTicket)} avg ticket`],
    ['Avg Rating', ratingN ? `${ratingAvg.toFixed(2)} ⭐` : '—', ratingN ? `${ratingN} review${ratingN === 1 ? '' : 's'}` : 'no reviews yet'],
    ['Best Week', bestWeek ? money(bestWeek[1]) : '—', bestWeek ? `Week of ${bestWeek[0]}` : '—'],
    ['Biggest Job', biggest ? money(biggest.amount) : '—', biggest ? `${(biggest.customers && biggest.customers.name) || ''}${biggest.completed_at ? ' · ' + String(biggest.completed_at).slice(0, 10) : ''}`.trim() || (biggest.job_type || '') : '—'],
  ];

  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <div className="h1" style={{ marginBottom: 2 }}>🏆 My Record · Career</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Lifetime stats — never resets. {live ? 'Live from your closed jobs.' : 'Connect your tech profile to see your record.'}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {cards.map(([h, v, d]) => (
          <div key={h} className="card" style={{ padding: 14 }}>
            <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</div>
            <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{v}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{d}</div>
          </div>
        ))}
      </div>

      {months.length > 0 && (
        <>
          <h3 style={{ margin: '18px 0 8px', fontSize: 13, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>📈 Monthly compare (last 6)</h3>
          <div className="card" style={{ display: 'grid', gap: 6 }}>
            {months.map(([k, m]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                <span style={{ width: 120, fontWeight: 600 }}>{monthLabel(k)}</span>
                <span style={{ flex: 1, fontWeight: 800, color: 'var(--green-bright)', fontFamily: "'JetBrains Mono', monospace" }}>{money(m.rev)}</span>
                <span className="muted">{m.jobs} job{m.jobs === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
