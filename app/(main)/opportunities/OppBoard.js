'use client';

// The win-back board — three money streams (tech recs · declined estimates · aging heaters) in one list.
// Filter by kind, work a row (Won / Dismiss), or pick a batch and draft a coupon campaign that an approver
// releases. Nothing here sends to a customer — the Send button lives behind the campaign approver.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { setOpportunityStatus, draftCampaignFromOpportunities } from './actions';

const money = (c) => '$' + Math.round((Number(c) || 0) / 100).toLocaleString();
const daysAgo = (iso) => { if (!iso) return null; const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`; };

export default function OppBoard({ rows: initial, counts, totalValueCents, kinds, canCompose }) {
  const [rows, setRows] = useState(initial);
  const [tab, setTab] = useState('all');
  const [sel, setSel] = useState({});           // ref -> true
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [compose, setCompose] = useState(false); // batch composer open
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const shown = useMemo(() => rows.filter((r) => tab === 'all' || r.kind === tab), [rows, tab]);
  const selectedRows = useMemo(() => rows.filter((r) => sel[r.ref] && r.hasEmail), [rows, sel]);
  const drop = (ref) => setRows((rs) => rs.filter((r) => r.ref !== ref));

  const act = (r, status, reason) => start(async () => {
    setMsg(null);
    const res = await setOpportunityStatus({ oppId: r.oppId, ref: r.ref, kind: r.kind, customerId: r.customerId, jobId: r.jobId, title: r.title, valueCents: r.valueCents, status, reason });
    if (res.ok) { drop(r.ref); setSel((s) => { const n = { ...s }; delete n[r.ref]; return n; }); } else setMsg(res.msg);
  });

  const toggle = (ref) => setSel((s) => ({ ...s, [ref]: !s[ref] }));
  const selectAllShown = () => { const on = shown.every((r) => sel[r.ref] || !r.hasEmail); setSel((s) => { const n = { ...s }; shown.forEach((r) => { if (r.hasEmail) n[r.ref] = !on; }); return n; }); };

  const sendBatch = () => start(async () => {
    setMsg(null);
    const payload = selectedRows.map((r) => ({ oppId: r.oppId, ref: r.ref, kind: r.kind, customerId: r.customerId, jobId: r.jobId, title: r.title, valueCents: r.valueCents }));
    const res = await draftCampaignFromOpportunities({ rows: payload, subject, body });
    if (res.ok) { const done = new Set(selectedRows.map((r) => r.ref)); setRows((rs) => rs.filter((r) => !done.has(r.ref))); setSel({}); setCompose(false); setSubject(''); setBody(''); setMsg(res.msg); }
    else setMsg(res.msg);
  });

  const TABS = [['all', `All · ${rows.length}`], ...Object.entries(kinds).map(([k, v]) => [k, `${v.icon} ${v.label} · ${counts[k] || 0}`])];

  return (
    <div>
      {/* headline pipeline value */}
      {totalValueCents > 0 && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, borderLeft: '3px solid var(--green)' }}>
          <span style={{ fontSize: 22 }}>💰</span>
          <div><div style={{ fontWeight: 800, fontSize: 18, color: 'var(--green)' }}>{money(totalValueCents)}</div><div className="muted" style={{ fontSize: 11 }}>estimated open pipeline (where we have a quoted value)</div></div>
        </div>
      )}

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="pill" style={{ cursor: 'pointer', fontWeight: 700, fontSize: 12, color: tab === k ? '#1a1206' : 'var(--fg-2)', background: tab === k ? 'var(--amber)' : 'transparent', border: `1px solid ${tab === k ? 'var(--amber)' : 'var(--border)'}` }}>{label}</button>
        ))}
      </div>

      {msg && <div className="card" style={{ marginBottom: 10, borderLeft: '3px solid var(--amber)', fontSize: 12.5 }}>{msg}</div>}

      {/* batch bar */}
      {canCompose && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button onClick={selectAllShown} className="pill" style={{ cursor: 'pointer', fontSize: 11.5 }}>☑︎ Select all shown</button>
          <span className="muted" style={{ fontSize: 12 }}>{selectedRows.length} mailable selected</span>
          <button onClick={() => setCompose(true)} disabled={!selectedRows.length || pending} className="btn" style={{ marginLeft: 'auto', fontSize: 12.5, opacity: selectedRows.length ? 1 : 0.5 }}>✉️ Draft campaign to {selectedRows.length}</button>
        </div>
      )}

      {/* composer */}
      {compose && (
        <div className="card card-amber" style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>✉️ Coupon / win-back email to {selectedRows.length} customer{selectedRows.length === 1 ? '' : 's'}</div>
          <div className="muted" style={{ fontSize: 11 }}>Use <code>{'{{name}}'}</code> for the first name. This creates a DRAFT — an approver (owner / GM / office / accounting) releases it from Campaigns. Nothing sends now.</div>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject — e.g. A little something for your next service" style={inp} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder={"Hi {{name}},\n\nWe wanted to follow up on the work we talked about..."} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={sendBatch} disabled={pending || !subject.trim() || !body.trim()} className="btn">{pending ? 'Building…' : 'Build draft →'}</button>
            <button onClick={() => setCompose(false)} className="btn btn-ghost" type="button">Cancel</button>
          </div>
        </div>
      )}

      {/* rows */}
      {shown.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}><div style={{ fontSize: 30 }}>✅</div><div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Nothing open here — all caught up.</div></div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {shown.map((r) => {
            const k = kinds[r.kind] || {};
            return (
              <div key={r.ref} className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderLeft: `3px solid ${k.badge || 'var(--border)'}` }}>
                {canCompose && <input type="checkbox" checked={!!sel[r.ref]} disabled={!r.hasEmail} onChange={() => toggle(r.ref)} title={r.hasEmail ? 'Include in a batch' : 'No mailable email on file'} style={{ marginTop: 3, cursor: r.hasEmail ? 'pointer' : 'not-allowed' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span className="pill" style={{ fontSize: 9.5, fontWeight: 800, color: k.badge, border: `1px solid ${k.badge}` }}>{k.icon} {k.label}</span>
                    <Link href={`/invoices?customer=${r.customerId}`} style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg-1)', textDecoration: 'none' }}>{r.customerName}</Link>
                    {r.jobId && <Link href={`/job/${r.jobId}`} className="muted" style={{ fontSize: 11, textDecoration: 'none' }}>· job ›</Link>}
                    {!r.hasEmail && <span className="pill" style={{ fontSize: 9, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>{r.doNotMail ? '🚫 do-not-mail' : '⚠️ no email'}</span>}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 3 }}>{r.title}</div>
                  {r.detail && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{r.detail}</div>}
                  <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>{[r.valueCents ? money(r.valueCents) : null, daysAgo(r.at)].filter(Boolean).join(' · ')}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <button onClick={() => act(r, 'won')} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--green)', border: '1px solid var(--green)' }}>🏆 Won</button>
                  <button onClick={() => act(r, 'dismissed')} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--fg-3)' }}>✕ Dismiss</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13 };
