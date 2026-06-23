import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';

export const dynamic = 'force-dynamic';

function money(n) {
  return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function isLow(p) {
  const rp = p.reorder_point != null ? Number(p.reorder_point) : 3;
  return Number(p.qty || 0) <= rp;
}

function Section({ title, children }) {
  return (
    <>
      <h3 style={{ margin: '20px 0 8px', fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</h3>
      {children}
    </>
  );
}

export default async function MyTruck({ searchParams }) {
  const { user, role } = await requireRole(['owner', 'tech']);
  const myName = (user.user_metadata && user.user_metadata.name) || '';
  const techParam = (searchParams && searchParams.tech ? String(searchParams.tech) : '').trim();
  const tech = role === 'tech' ? myName : (techParam || null);

  if (!isAdminConfigured) {
    return (
      <div className="wrap"><div className="h1">🚐 My Truck</div>
        <div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to read truck data.</div>
      </div>
    );
  }
  const sb = getSupabaseAdmin();

  let invQ = sb.from('truck_inventory').select('*').order('name');
  let toolQ = sb.from('tools').select('*').order('name');
  if (tech) { invQ = invQ.ilike('tech_name', tech); toolQ = toolQ.ilike('assigned_to', tech); }
  const [{ data: inv, error: invErr }, { data: tools }] = await Promise.all([invQ, toolQ]);

  if (invErr && /relation .* does not exist/i.test(invErr.message)) {
    return (
      <div className="wrap"><div className="h1">🚐 My Truck</div>
        <div className="notice">Run <code>supabase/05_truck_tools.sql</code> in Supabase to create the truck/tools tables, then refresh.</div>
      </div>
    );
  }

  const parts = inv || [];
  const lowCount = parts.filter(isLow).length;
  const toolList = tools || [];
  const toolVal = toolList.reduce((a, t) => a + (Number(t.value) || 0), 0);

  return (
    <div className="wrap">
      <div className="h1">🚐 My Truck{tech ? ` · ${tech}` : ''}</div>
      <p className="muted">Parts on your van + tools issued to you{role === 'owner' && !tech ? ' (all techs — add ?tech=Name to filter)' : ''}.</p>

      <div className="card card-amber" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber)' }}>{parts.length}</div><div className="muted" style={{ fontSize: 11 }}>parts on van</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: lowCount ? '#ff8a65' : 'var(--green)' }}>{lowCount}</div><div className="muted" style={{ fontSize: 11 }}>low stock</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800 }}>{toolList.length}</div><div className="muted" style={{ fontSize: 11 }}>tools issued</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-bright)' }}>{money(toolVal)}</div><div className="muted" style={{ fontSize: 11 }}>tools value</div></div>
      </div>

      <Section title="🧰 Parts on the van">
        {!parts.length && <div className="card"><span className="muted">No parts stocked yet.</span></div>}
        {parts.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            {parts.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13 }}>{p.name || p.sku}{p.bin ? <span className="muted" style={{ fontSize: 11 }}> · {p.bin}</span> : ''}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: isLow(p) ? '#ff8a65' : 'var(--fg-2)', whiteSpace: 'nowrap' }}>
                  {Number(p.qty || 0)} {p.unit || 'ea'}{isLow(p) ? ' ⚠' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="🔧 Tools issued to you">
        {!toolList.length && <div className="card"><span className="muted">No tools issued yet — the shop assigns them.</span></div>}
        {toolList.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            {toolList.map((t) => {
              const loaned = /loan/i.test(String(t.status || ''));
              return (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 10, fontFamily: 'monospace' }}>
                      {[t.serial && 'SN: ' + t.serial, t.mfg, t.year, t.value && money(t.value)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: loaned ? '#ff8a65' : 'var(--green-bright)', whiteSpace: 'nowrap' }}>
                    {loaned ? '🔄 LOANED' : '✓ ON VAN'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
