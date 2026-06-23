import { getSupabase, isSupabaseConfigured } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

function money(n) {
  const v = Number(n || 0);
  return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default async function Customers({ searchParams }) {
  const q = (searchParams?.q || '').trim();

  if (!isSupabaseConfigured) {
    return (
      <div className="wrap">
        <div className="h1">🔎 Customers</div>
        <div className="notice">Connect Supabase first (see README) — then your customer base shows up here.</div>
      </div>
    );
  }

  const supabase = getSupabase();
  const { count: total } = await supabase.from('customers').select('*', { count: 'exact', head: true });

  let results = [], error = null;
  if (q) {
    const r = await supabase
      .from('customers')
      .select('id, st_customer_id, name, phone, email, address, type, do_not_service, do_not_mail, lifetime_revenue, lifetime_jobs, last_job_completed')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
      .order('lifetime_revenue', { ascending: false })
      .limit(50);
    results = r.data || [];
    error = r.error;
  }

  const inputStyle = {
    flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
    color: 'var(--fg-1)', padding: '11px 13px', borderRadius: 8, fontSize: 15, outline: 'none',
  };

  return (
    <div className="wrap">
      <div className="h1">🔎 Customers</div>
      <p className="muted">
        {total != null ? total.toLocaleString() + ' customers in your database' : ''} · search by name, phone, or email
      </p>

      <form method="get" style={{ display: 'flex', gap: 8, margin: '12px 0 18px' }}>
        <input name="q" defaultValue={q} placeholder="e.g. Radebaugh  ·  859 333  ·  @gmail" style={inputStyle} autoFocus />
        <button className="btn" type="submit">Search</button>
      </form>

      {error && <div className="notice">⚠ {error.message}</div>}
      {q && !error && results.length === 0 && (
        <div className="card"><span className="muted">No match for “{q}”.</span></div>
      )}
      {!q && (
        <div className="muted">Type a name, phone, or email above to pull up a customer — full history included.</div>
      )}

      {results.map((c) => (
        <div key={c.id} className="card card-amber">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>{c.name}</span>
            {c.type && <span className="pill">{c.type}</span>}
            {c.do_not_service && <span className="pill" style={{ color: 'var(--red)', border: '1px solid var(--red)' }}>⛔ DO NOT SERVICE</span>}
            {c.do_not_mail && <span className="pill" style={{ color: 'var(--fg-3)' }}>no mail</span>}
          </div>
          <div className="meta" style={{ marginTop: 5 }}>
            📞 {c.phone || 'no phone'}{c.email ? '  ·  ✉️ ' + c.email : ''}
          </div>
          <div className="meta">📍 {c.address || 'no address'}</div>
          <div className="meta" style={{ marginTop: 5, color: 'var(--amber)' }}>
            💰 {money(c.lifetime_revenue)} lifetime · {c.lifetime_jobs || 0} jobs
            {c.last_job_completed ? ' · last ' + c.last_job_completed : ''}
            {c.st_customer_id ? ' · ST#' + c.st_customer_id : '  · ✨ added in CB'}
          </div>
        </div>
      ))}

      {results.length === 50 && (
        <div className="muted" style={{ marginTop: 10 }}>Showing the first 50 matches — narrow your search to see more.</div>
      )}
    </div>
  );
}
