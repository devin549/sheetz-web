import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';

export const dynamic = 'force-dynamic';

export default async function CustomerHeat() {
  await requireHref('/customer-heat');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Customer Heat</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();

  // Heat signals (graceful if a table's missing): unhandled low reviews + open complaints.
  const heat = {}; // name → { name, reasons:[], score }
  const bump = (name, reason, weight) => { const n = String(name || '').trim(); if (!n) return; (heat[n] = heat[n] || { name: n, reasons: [], score: 0 }); heat[n].reasons.push(reason); heat[n].score += weight; };

  try {
    const { data: rv } = await sb.from('reviews').select('customer_name, rating').lte('rating', 3).eq('responded', false);
    (rv || []).forEach((r) => bump(r.customer_name, `${r.rating}★ review (no recovery)`, 3));
  } catch (_) { /* ignore */ }
  try {
    const { data: ix } = await sb.from('customer_interactions').select('customer_name, kind, summary, status').eq('status', 'open');
    (ix || []).forEach((i) => { if (i.kind === 'complaint') bump(i.customer_name, 'open complaint', 3); });
  } catch (_) { /* ignore */ }

  const rows = Object.values(heat).sort((a, b) => b.score - a.score).slice(0, 40);

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1">Customer Heat</div>
      <p className="muted">Customers heating up — unhandled low reviews + open complaints. Cool them down before they churn or post.</p>

      {!rows.length && <div className="card"><span className="muted">No one&apos;s hot right now 🧊 — no unhandled low reviews or open complaints.</span></div>}
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((r) => {
          const hot = r.score >= 5;
          return (
            <div key={r.name} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', flexWrap: 'wrap', borderLeft: `3px solid ${hot ? 'var(--red)' : 'var(--amber)'}` }}>
              <span style={{ fontSize: 16 }}>{hot ? '🔥' : '🌡️'}</span>
              <span style={{ fontWeight: 700, fontSize: 14, flex: '0 0 auto' }}>{r.name}</span>
              <span className="muted" style={{ flex: '1 1 200px', fontSize: 12 }}>{[...new Set(r.reasons)].join(' · ')}</span>
              <span style={{ fontWeight: 800, color: hot ? 'var(--red)' : 'var(--amber)' }}>heat {r.score}</span>
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>Work recoveries on the Reviews screen; log/close complaints on the customer&apos;s account.</p>
    </div>
  );
}
