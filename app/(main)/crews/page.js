import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { nyTodayStr } from '@/lib/day';

export const dynamic = 'force-dynamic';

const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const crewColor = (n) => ({ 'Drain Team': '#4f9bff', 'Install Crew': '#e0a042', 'HVAC Squad': '#e07a5f' }[n] || '#FF8124');

export default async function Crews() {
  await requirePerm('seeAllTechs', 'seeCrew', 'assignJobs');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Crews</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const today = nyTodayStr();

  let tRes = await sb.from('techs').select('id, name, crew').order('name');
  if (tRes.error) tRes = await sb.from('techs').select('id, name').order('name');
  const techs = (tRes.data || []).map((t) => ({ id: t.id, name: t.name, crew: t.crew || 'Crew' }));

  // today's helper → tech pairings (guarded)
  const helpersByTech = {};
  const hRes = await sb.from('helper_assignments').select('helper_name, helper_email, tech_name').eq('date_key', today);
  if (!hRes.error) (hRes.data || []).forEach((h) => {
    const key = String(h.tech_name || '').toLowerCase();
    (helpersByTech[key] = helpersByTech[key] || []).push(h.helper_name || h.helper_email || 'Helper');
  });

  const crews = {};
  techs.forEach((t) => { (crews[t.crew] = crews[t.crew] || []).push(t); });
  const crewNames = Object.keys(crews).sort();

  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <div className="h1">Crews</div>
      <p className="muted">{techs.length} techs across {crewNames.length} crews · today&apos;s helper pairings ({today}).</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {crewNames.map((c) => (
          <div key={c} className="card" style={{ borderLeft: `3px solid ${crewColor(c)}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 800, color: crewColor(c) }}>{c}</span>
              <span className="pill" style={{ fontSize: 11 }}>{crews[c].length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {crews[c].map((t) => {
                const helpers = helpersByTech[String(t.name || '').toLowerCase()] || [];
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: crewColor(c), color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', flexShrink: 0 }}>{initials(t.name)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>{t.name}</span>
                      {helpers.length > 0 && <span className="muted" style={{ fontSize: 11 }}>+ {helpers.join(', ')}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!crewNames.length && <div className="card"><span className="muted">No techs yet — add them on Team.</span></div>}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Crews come from each tech&apos;s crew field. Editable crew assignment + supervisor ownership port next.</p>
    </div>
  );
}
