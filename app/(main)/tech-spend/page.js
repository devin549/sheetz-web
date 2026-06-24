import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';

export const dynamic = 'force-dynamic';

const money = (c) => '$' + (Math.round(c || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });

function Section({ title, children }) {
  return (<>
    <h3 style={{ margin: '20px 0 8px', fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{title}</h3>
    {children}
  </>);
}

export default async function TechSpend() {
  await requireHref('/tech-spend');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Tech Spend &amp; Waste</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const res = await sb.from('shop_issues').select('job_id, item_name, qty, total_cost_cents, kind, status, issued_to, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(3000);

  if (res.error && /could not find|does not exist|schema cache/i.test(res.error.message || '')) {
    return <div className="wrap"><div className="h1">Tech Spend &amp; Waste</div><div className="notice">Needs the Shop Counter table — run <code>supabase/46_shop_issues.sql</code>, then issue some parts.</div></div>;
  }
  const rows = res.data || [];

  const byTech = {}, byJob = {};
  let total = 0;
  for (const r of rows) {
    total += r.total_cost_cents || 0;
    const t = r.issued_to || 'Unassigned'; (byTech[t] = byTech[t] || { spend: 0, n: 0 }); byTech[t].spend += r.total_cost_cents || 0; byTech[t].n++;
    if (r.job_id) { (byJob[r.job_id] = byJob[r.job_id] || { spend: 0, n: 0 }); byJob[r.job_id].spend += r.total_cost_cents || 0; byJob[r.job_id].n++; }
  }
  const techs = Object.entries(byTech).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.spend - a.spend);
  const jobs = Object.entries(byJob).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.spend - a.spend).slice(0, 12);
  const rentalsOut = rows.filter((r) => r.kind === 'rental' && r.status === 'out');
  const wasteValue = rentalsOut.reduce((s, r) => s + (r.total_cost_cents || 0), 0);

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="h1">Tech Spend &amp; Waste</div>
      <p className="muted">Parts &amp; materials issued to jobs over the last 90 days — who&apos;s spending, on which jobs, and rentals still out (the waste/exposure).</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '6px 0 8px' }}>
        {[
          { k: 'Total issued (90d)', v: money(total), c: 'var(--amber)' },
          { k: 'Line items', v: String(rows.length) },
          { k: 'Rentals still out', v: String(rentalsOut.length), c: rentalsOut.length ? 'var(--red)' : 'var(--green)' },
          { k: 'Rental $ exposed', v: money(wasteValue), c: wasteValue ? 'var(--red)' : 'var(--green)' },
        ].map((c) => (
          <div key={c.k} className="card" style={{ padding: '12px 14px' }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{c.k}</div>
            <div style={{ fontSize: 23, fontWeight: 800, color: c.c || 'var(--fg-1)', marginTop: 2 }}>{c.v}</div>
          </div>
        ))}
      </div>

      <Section title="By tech (spend)">
        {!techs.length && <div className="card"><span className="muted">No issues logged yet.</span></div>}
        <div style={{ display: 'grid', gap: 6 }}>
          {techs.map((t) => (
            <div key={t.name} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px' }}>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>{t.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>{t.n} item{t.n === 1 ? '' : 's'}</span>
              <span style={{ fontWeight: 800, color: 'var(--amber)' }}>{money(t.spend)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Top jobs (material cost)">
        {!jobs.length && <div className="card"><span className="muted">No job costs yet.</span></div>}
        <div style={{ display: 'grid', gap: 6 }}>
          {jobs.map((j) => (
            <div key={j.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px' }}>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>Job #{j.id}</span>
              <span className="muted" style={{ fontSize: 12 }}>{j.n} item{j.n === 1 ? '' : 's'}</span>
              <span style={{ fontWeight: 800 }}>{money(j.spend)}</span>
            </div>
          ))}
        </div>
      </Section>

      {rentalsOut.length > 0 && (
        <Section title="⚠️ Rentals still out (close these)">
          <div style={{ display: 'grid', gap: 6 }}>
            {rentalsOut.map((r, i) => (
              <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', borderLeft: '3px solid var(--red)' }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>{r.item_name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{r.issued_to || '—'} · job #{r.job_id || '—'}</span>
                <span style={{ fontWeight: 700, color: 'var(--red)' }}>{money(r.total_cost_cents)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
