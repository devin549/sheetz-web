import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';

export const dynamic = 'force-dynamic';

const tm = (s) => { try { return new Date(s).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

export default async function Saves() {
  await requireHref('/saves');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Saves Today</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const sinceISO = start.toISOString();

  const saves = [];
  try {
    const { data: rv } = await sb.from('reviews').select('customer_name, rating, recovery_owner, responded_at').eq('responded', true).gte('responded_at', sinceISO).lte('rating', 3);
    (rv || []).forEach((r) => saves.push({ who: r.customer_name || 'Customer', what: `recovered ${r.rating}★ review`, by: r.recovery_owner || '', at: r.responded_at }));
  } catch (_) { /* ignore */ }
  try {
    const { data: ix } = await sb.from('customer_interactions').select('customer_name, kind, summary, owner, done_at').eq('status', 'done').gte('done_at', sinceISO);
    (ix || []).forEach((i) => { if (['complaint', 'promise', 'followup'].includes(i.kind)) saves.push({ who: i.customer_name || 'Customer', what: `${i.kind} handled${i.summary ? ` — ${i.summary}` : ''}`, by: i.owner || '', at: i.done_at }); });
  } catch (_) { /* ignore */ }
  saves.sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1">Saves Today</div>
      <p className="muted">Recoveries handled today — reviews turned around + complaints/promises closed. Nice work.</p>

      <div className="card card-amber" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: saves.length ? 'var(--green)' : 'var(--fg-3)' }}>{saves.length}</div>
        <div className="muted" style={{ fontSize: 12 }}>saves today 🎉</div>
      </div>

      {!saves.length && <div className="card"><span className="muted">No saves logged today yet — handle a recovery on Reviews or close a follow-up.</span></div>}
      <div style={{ display: 'grid', gap: 6 }}>
        {saves.map((s, i) => (
          <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', flexWrap: 'wrap', borderLeft: '3px solid var(--green)' }}>
            <span style={{ fontSize: 15 }}>✅</span>
            <span style={{ fontWeight: 700, fontSize: 13.5, flex: '0 0 auto' }}>{s.who}</span>
            <span style={{ flex: '1 1 160px', fontSize: 13 }}>{s.what}</span>
            <span className="muted" style={{ fontSize: 11 }}>{s.by ? `${s.by} · ` : ''}{tm(s.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
