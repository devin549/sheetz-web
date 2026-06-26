import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { accountabilityByTech, eventMeta } from '@/lib/toolLedger';

const money = (c) => '$' + (Math.round((Number(c) || 0) / 100)).toLocaleString();
const when = (s) => { try { return new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } };

// Manager-only: the chain-of-custody roll-up. Who's breaking and losing tools, and the dollars on their head.
export default async function ToolAccountability() {
  const sb = getSupabaseAdmin();
  let events = [];
  try {
    const { data, error } = await sb.from('tool_events').select('tool_id, tool_name, event, holder_name, by_name, cost_cents, note, condition_photo, created_at').order('created_at', { ascending: false }).limit(200);
    if (error) {
      if (/relation|column|schema cache|does not exist/i.test(error.message)) {
        return <div className="notice" style={{ marginTop: 16 }}>Run <code>supabase/97_tool_events.sql</code> to turn on the tool accountability log.</div>;
      }
      return null;
    }
    events = data || [];
  } catch { return null; }

  if (!events.length) {
    return <div className="card" style={{ marginTop: 16 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>🧾 Tool accountability</div><span className="muted">No tool events logged yet. As tools get issued, broken, or lost, every move shows up here — per tech.</span></div>;
  }

  // Sign condition photos on the rows we'll show (private bucket).
  const shown = events.slice(0, 14);
  await Promise.all(shown.map(async (e) => {
    if (!e.condition_photo) return;
    try { const { data } = await sb.storage.from('job-photos').createSignedUrl(e.condition_photo, 3600); e._photo = data?.signedUrl || null; } catch { e._photo = null; }
  }));

  const ranked = accountabilityByTech(events);
  const totalCost = ranked.reduce((s, r) => s + r.costCents, 0);
  const lbl = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 7px', fontSize: 12 };

  return (
    <div style={{ marginTop: 18 }}>
      <div className="h2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>🧾 Tool accountability</span>
        {totalCost > 0 && <span className="muted" style={{ fontSize: 13 }}>{money(totalCost)} in breaks &amp; losses</span>}
      </div>

      {ranked.length === 0 ? (
        <div className="card"><span className="muted">Nobody's broken or lost a tracked tool. 🎉</span></div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {ranked.map((r, i) => (
            <div key={r.tech} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px' }}>
              <span style={{ fontSize: 18, width: 22, textAlign: 'center', opacity: i === 0 ? 1 : 0.4 }}>{i === 0 ? '🐀' : i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{r.tech}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {r.broke > 0 && <>💥 {r.broke} broke </>}
                  {r.lost > 0 && <>❓ {r.lost} lost</>}
                </div>
              </div>
              {r.costCents > 0 && <div style={{ fontWeight: 800, color: 'var(--danger, #d9534f)' }}>{money(r.costCents)}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="h2" style={{ marginTop: 16 }}>Recent tool activity</div>
      <div style={{ display: 'grid', gap: 4 }}>
        {shown.map((e, i) => {
          const m = eventMeta(e.event);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13.5 }}>
              {e._photo ? <a href={e._photo} target="_blank" rel="noreferrer"><img src={e._photo} alt="condition" style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} /></a> : <span style={{ fontSize: 15 }}>{m.icon}</span>}
              <span style={{ ...lbl, color: m.bad ? 'var(--danger, #d9534f)' : 'var(--fg-2)' }}>{m.label}</span>
              <span style={{ fontWeight: 600 }}>{e.tool_name || 'Tool'}</span>
              {e.holder_name && <span className="muted">· {e.holder_name}</span>}
              {e.cost_cents > 0 && <span className="muted">· {money(e.cost_cents)}</span>}
              <span className="muted" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{when(e.created_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
