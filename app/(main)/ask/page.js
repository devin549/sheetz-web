import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { isAiConfigured } from '@/lib/anthropic';
import { boardContext } from './actions';
import AskBoardFull from './AskBoardFull';

export const dynamic = 'force-dynamic';

const money = (n) => { const v = Number(n || 0); return v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + Math.round(v); };

export default async function AskPage() {
  const { role } = await requirePerm('seeReports');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Ask the Board</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const ctx = await boardContext(sb);
  const aiReady = isAiConfigured(role);

  const Stat = ({ label, val, color }) => (
    <div style={{ flex: '1 1 120px', minWidth: 100 }}>
      <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--fg-1)' }}>{val}</div>
    </div>
  );

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1">🦫 Ask the Board</div>
      <p className="muted">Hank answers from your live numbers — jobs, money, customers. Powered by Claude.</p>

      <div className="card" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', borderTop: '2px solid var(--accent)' }}>
        <Stat label="Open AR" val={money(ctx.ar.outstandingDollars)} color="var(--red)" />
        <Stat label="Open invoices" val={ctx.ar.openInvoices.toLocaleString()} />
        <Stat label="Open jobs" val={ctx.jobs.open} />
        <Stat label="Urgent" val={ctx.jobs.urgent} color={ctx.jobs.urgent ? 'var(--amber)' : undefined} />
        <Stat label="Customers" val={ctx.customers.toLocaleString()} />
      </div>

      {ctx.topPastDue?.[0] && (
        <p className="muted" style={{ fontSize: 12 }}>Biggest balance: <strong>{ctx.topPastDue[0].customer}</strong> owes {money(ctx.topPastDue[0].owesDollars)}{ctx.oldestInvoice ? ` · oldest invoice ${ctx.oldestInvoice.daysLate}d late (${ctx.oldestInvoice.customer})` : ''}.</p>
      )}

      {!aiReady && <div className="notice" style={{ fontSize: 13 }}>Add a Claude key (<code>ANTHROPIC_KEY_OWNER</code> / role keys) in Vercel to turn on answers. The snapshot above is live now.</div>}

      <AskBoardFull />
    </div>
  );
}
