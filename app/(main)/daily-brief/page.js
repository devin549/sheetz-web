import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { boardContext } from '../ask/actions';
import { nyTodayStr, nyDayWindow } from '@/lib/day';

export const dynamic = 'force-dynamic';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default async function DailyBrief() {
  await requirePerm('seeReports', 'seeRevenue', 'seeAllJobs');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Daily Brief</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const today = nyTodayStr();
  const { startISO, endISO } = nyDayWindow(today);

  const [ctx, jRes] = await Promise.all([
    boardContext(sb),
    sb.from('jobs').select('status, priority, amount, scheduled_at').gte('scheduled_at', startISO).lt('scheduled_at', endISO),
  ]);
  const todays = (jRes.data || []).filter((j) => !/cancel/i.test(String(j.status || '')));
  const now = Date.now();
  const done = todays.filter((j) => /done|complete|closed/i.test(String(j.status || ''))).length;
  const rolling = todays.filter((j) => /on_site|onsite|enroute|rolling/i.test(String(j.status || ''))).length;
  const late = todays.filter((j) => !/done|complete|closed|on_site|onsite|enroute|rolling/i.test(String(j.status || '')) && j.scheduled_at && new Date(j.scheduled_at).getTime() < now).length;
  const urgent = todays.filter((j) => /high|urgent|emergency/i.test(String(j.priority || ''))).length;
  const bookedToday = todays.reduce((s, j) => s + (Number(j.amount) || 0), 0);
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const Section = ({ title, children }) => (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
  const Line = ({ icon, children }) => <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 14, lineHeight: 1.7 }}><span style={{ width: 18 }}>{icon}</span><span>{children}</span></div>;

  return (
    <div className="wrap" style={{ maxWidth: 680 }}>
      <div className="h1">Daily Brief</div>
      <p className="muted">{dateLabel} · the morning snapshot at a glance.</p>

      <Section title="Today's board">
        <Line icon="📋">{todays.length} jobs scheduled — <strong>{done}</strong> done, <strong>{rolling}</strong> rolling/on-site{urgent ? <>, <strong style={{ color: 'var(--amber)' }}>{urgent} urgent</strong></> : ''}.</Line>
        {late > 0 ? <Line icon="🔴"><strong style={{ color: 'var(--red)' }}>{late} running late</strong> — chase ETAs.</Line> : <Line icon="✅">Nobody flagged late right now.</Line>}
        <Line icon="💵">Booked today: <strong style={{ color: 'var(--green)' }}>{money(bookedToday)}</strong>.</Line>
      </Section>

      <Section title="Money">
        <Line icon="📒">Open AR: <strong style={{ color: 'var(--red)' }}>{money(ctx.ar.outstandingDollars)}</strong> across {ctx.ar.openInvoices.toLocaleString()} invoices.</Line>
        {ctx.topPastDue?.[0] && <Line icon="🎯">Biggest balance: <strong>{ctx.topPastDue[0].customer}</strong> owes {money(ctx.topPastDue[0].owesDollars)}.</Line>}
        {ctx.oldestInvoice && <Line icon="⏳">Oldest invoice: {ctx.oldestInvoice.daysLate}d late ({ctx.oldestInvoice.customer}).</Line>}
      </Section>

      <Section title="Book of business">
        <Line icon="👥">{ctx.customers.toLocaleString()} customers on file.</Line>
      </Section>

      <p className="muted" style={{ fontSize: 12 }}>Want this emailed every morning? That ports next (a scheduled job off this same snapshot). For ad-hoc questions, use <a href="/ask">Ask the Board</a>.</p>
    </div>
  );
}
