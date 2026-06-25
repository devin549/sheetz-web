import Link from 'next/link';
import { Sparkles, Clipboard, History, Image as ImageIcon, Wrench, CircleCheck, CircleX } from 'lucide-react';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmt = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
const KIND_COLOR = { active: 'var(--amber)', estimate: '#a78bfa', unpaid: 'var(--red)', past: 'var(--border)' };
const KIND_LABEL = { active: 'ACTIVE', estimate: 'ESTIMATE', unpaid: 'UNPAID', past: '' };

// "Customer Memory" — the cockpit's customer/history brain. Server component; everything pre-loaded.
export default function CustomerMemory({ mem, customer = {}, job = {} }) {
  const badge = (label, val, color) => val ? <span key={label} className="pill" style={{ fontSize: 11, color }}>{label}: {val}</span> : null;

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      {/* memory badges */}
      <div className="card" style={{ borderLeft: '3px solid var(--amber)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>🧠 {customer.name || 'Customer'}</span>
          {job.job_number ? <span className="muted" style={{ fontSize: 12 }}>#{job.job_number}</span> : null}
        </div>
        {customer.address && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>📍 {customer.address}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {mem.membership && <span className="pill" style={{ fontSize: 11, color: 'var(--green)', border: '1px solid var(--green)' }}>★ Member · {mem.membership}</span>}
          {(job.warranty_provider || /warranty|insurance/i.test(String(job.job_class || ''))) && <span className="pill" style={{ fontSize: 11, color: '#a78bfa' }}>🛡 Warranty</span>}
          {mem.openBalance > 0 && <span className="pill pill-red" style={{ fontSize: 11 }}>💸 Past due {money(mem.openBalance)}</span>}
          {badge('📷', mem.photoCount ? `${mem.photoCount}` : null, 'var(--fg-2)')}
          {mem.lastServiced && <span className="pill" style={{ fontSize: 11 }}>last serviced {fmt(mem.lastServiced)}</span>}
          {badge('ST', mem.stId, 'var(--fg-3)')}
          {badge('DispatchMe', job.dispatchme_job_id, 'var(--fg-3)')}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {customer.phone && <a href={`tel:${String(customer.phone).replace(/[^0-9+]/g, '')}`} className="pill" style={{ color: 'var(--amber)' }}>📞 Call</a>}
          {customer.phone && <a href={`sms:${String(customer.phone).replace(/[^0-9+]/g, '')}`} className="pill">💬 Text</a>}
          {customer.email && <span className="muted" style={{ fontSize: 11 }}>{customer.email}</span>}
        </div>
      </div>

      {/* Before You Knock */}
      {mem.beforeYouKnock.length > 0 && (
        <div className="card card-amber">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Clipboard size={16} style={{ color: 'var(--amber)' }} /><span style={{ fontWeight: 800 }}>Before you knock</span></div>
          <div style={{ display: 'grid', gap: 5 }}>
            {mem.beforeYouKnock.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: b.tone === 'warn' ? 800 : 600, color: b.tone === 'warn' ? 'var(--red)' : 'var(--fg-1)' }}>
                <span style={{ fontSize: 16 }}>{b.icon}</span>{b.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Smart summary */}
      <div className="card" style={{ borderLeft: '3px solid #a78bfa', background: 'rgba(167,139,250,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><Sparkles size={16} style={{ color: '#a78bfa' }} /><span style={{ fontWeight: 800 }}>What to know before knocking</span></div>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }}>
          {mem.summary.map((s, i) => <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5 }}>{s}</li>)}
        </ul>
      </div>

      {/* Timeline */}
      {mem.timeline.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><History size={16} style={{ color: 'var(--amber)' }} /><span style={{ fontWeight: 800 }}>Job history</span></div>
          <div style={{ position: 'relative', display: 'grid', gap: 8, paddingLeft: 14 }}>
            <div style={{ position: 'absolute', left: 4, top: 4, bottom: 4, width: 2, background: 'var(--border)' }} />
            {mem.timeline.map((t, i) => (
              <div key={t.id + i} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ position: 'absolute', left: -13, width: 10, height: 10, borderRadius: 999, background: KIND_COLOR[t.kind] || 'var(--fg-3)', border: '2px solid var(--surface-1)' }} />
                <div style={{ flex: 1, minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {KIND_LABEL[t.kind] && <span className="pill" style={{ fontSize: 9, fontWeight: 800, color: KIND_COLOR[t.kind] }}>{KIND_LABEL[t.kind]}</span>}
                    <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.jobType}</span>
                    {t.badge && <span className="pill" style={{ fontSize: 9, color: t.badge === 'warranty' ? '#a78bfa' : 'var(--amber)' }}>{t.badge}</span>}
                    {t.href && <Link href={t.href} className="pill" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--amber)' }}>open →</Link>}
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {t.date && <span>{fmt(t.date)}</span>}
                    {t.tech && <span>👷 {t.tech}</span>}
                    {t.amount ? <span style={{ color: 'var(--green)' }}>{money(t.amount)}{t.paid === false ? ' ·  UNPAID' : t.paid === true ? ' · paid' : ''}</span> : null}
                    {t.photos > 0 && <span>📷 {t.photos}</span>}
                    {t.status && <span>{String(t.status)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past photos grouped by job */}
      {mem.photoGroups.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><ImageIcon size={16} style={{ color: 'var(--amber)' }} /><span style={{ fontWeight: 800 }}>Past photos</span></div>
          {mem.photoGroups.map((g) => (
            <div key={g.jobId} style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{g.jobType || 'Job'} · {fmt(g.date)}</div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {g.items.map((p) => (
                  <a key={p.id} href={p.url || '#'} target="_blank" rel="noreferrer" style={{ flex: '0 0 auto', position: 'relative', width: 84, height: 64, borderRadius: 7, overflow: 'hidden', background: 'var(--surface-2)', border: `1px solid ${p.qa === 'fail' ? 'var(--red)' : p.qa === 'pass' ? 'var(--green)' : 'var(--border)'}` }}>
                    {p.url && !p.video ? <img src={p.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 18 }}>{p.video ? '🎬' : '🖼'}</div>}
                    <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 3px', textTransform: 'uppercase' }}>{p.kind}{p.qa ? (p.qa === 'pass' ? ' ✓' : ' ✕') : ''}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Equipment */}
      {mem.equipment.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Wrench size={16} style={{ color: 'var(--amber)' }} /><span style={{ fontWeight: 800 }}>Equipment on file</span><span className="muted" style={{ fontSize: 10, marginLeft: 'auto' }}>from photos</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
            {mem.equipment.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                {e.url ? <img src={e.url} alt="" style={{ width: 42, height: 42, borderRadius: 6, objectFit: 'cover' }} /> : <span style={{ fontSize: 24 }}>🔧</span>}
                <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div><div className="muted" style={{ fontSize: 10 }}>{fmt(e.date)} · {e.photos} 📷</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
