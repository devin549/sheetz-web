'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markInvoicePaid, markCustomerPaid, setArNote, setInvoiceDoubtful, markCustomerDoubtful, createPayLink } from './actions';
import CollectionsTimeline from './CollectionsTimeline';

// Ashley's per-customer A/R note ("Sent to Attorney 4/22", "DO NOT SERVICE", "Pays Weekly"…).
function ArNote({ customerId, note, canEdit, onSaved }) {
  const [val, setVal] = useState(note || '');
  const [busy, start] = useTransition();
  const [saved, setSaved] = useState(false);
  if (!canEdit) return note ? <div className="muted" style={{ fontSize: 12 }}>📝 {note}</div> : null;
  return (
    <div style={{ margin: '8px 0' }}>
      <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>📝 A/R note</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <textarea value={val} onChange={(e) => { setVal(e.target.value); setSaved(false); }} rows={2}
          placeholder="e.g. Sent to Attorney 4/22 · DO NOT SERVICE · Pays Weekly · Retainage"
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, fontFamily: 'var(--sans)', resize: 'vertical' }} />
        <button onClick={() => start(async () => { const r = await setArNote(customerId, val); if (r?.ok) { setSaved(true); onSaved && onSaved(); } })} disabled={busy}
          style={{ background: saved ? 'var(--green)' : 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {busy ? 'Saving…' : saved ? '✓ Saved' : 'Save note'}
        </button>
      </div>
    </div>
  );
}

function money(n) { return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function ageColor(days) {
  if (days == null) return 'var(--fg-3)';
  if (days > 90) return 'var(--red)';
  if (days > 60) return '#e65100';
  if (days > 30) return '#e0a800';
  return 'var(--fg-3)';
}
const inBucket = (days, b) => {
  if (b === 'all') return true;
  if (days == null) return b === 'cur';
  if (b === 'cur') return days <= 30;
  if (b === 'd60') return days > 30 && days <= 60;
  if (b === 'd90') return days > 60 && days <= 90;
  if (b === 'd90p') return days > 90;
  return true;
};
const ctrl = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 11px', fontSize: 13 };
const COLS = 'minmax(190px, 2.2fr) repeat(4, minmax(74px, 1fr)) minmax(92px, 1.1fr)';
const num = { textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' };

// The single aging filter — these big numbers ARE the filter (click to narrow the list).
const BUCKETS = [
  { key: 'all', label: 'Total open', color: 'var(--accent)', big: true },
  { key: 'cur', label: 'Current · 0–30', color: 'var(--green)' },
  { key: 'd60', label: '31–60', color: 'var(--accent)' },
  { key: 'd90', label: '61–90', color: '#e65100' },
  { key: 'd90p', label: '90+ overdue', color: 'var(--red)' },
];

export default function PastDueList({ customers, canMark, summary }) {
  const router = useRouter();
  const [open, setOpen] = useState({});
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState(null);
  const [payLinks, setPayLinks] = useState({});
  function makePayLink(c) { if (pending) return; setBusyId('pl-' + c.cid); setErr(null); start(async () => { const r = await createPayLink(c.cid, c.total, c.name); setBusyId(null); if (r.ok) setPayLinks((p) => ({ ...p, [c.cid]: r })); else setErr(r.msg); }); }

  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState('all');
  const [sort, setSort] = useState('owed');

  const toggle = (cid) => setOpen((o) => ({ ...o, [cid]: !o[cid] }));
  const run = (id, fn) => { setBusyId(id); setErr(null); start(async () => { const r = await fn(); setBusyId(null); if (r && !r.ok) setErr(r.msg); else router.refresh(); }); };

  // Top deadbeats = biggest balances owed (chase these first), doubtful included.
  const topDeadbeats = useMemo(() => customers.slice().sort((a, b) => (b.owed ?? b.total) - (a.owed ?? a.total)).slice(0, 5), [customers]);
  const jumpTo = (cid) => {
    setBucket('all'); setQ(''); setOpen({ [cid]: true });
    setTimeout(() => { const el = document.getElementById('cust-' + cid); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
  };

  const bucketVal = (key) => (key === 'all' ? summary.total : summary.aging[key] || 0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = customers.filter((c) => inBucket(c.oldestDays, bucket));
    if (needle) list = list.filter((c) => `${c.name} ${c.cbNumber || ''} ${c.phone || ''}`.toLowerCase().includes(needle));
    return list.slice().sort((a, b) =>
      sort === 'name' ? String(a.name).localeCompare(String(b.name))
        : sort === 'oldest' ? (b.oldestDays || 0) - (a.oldestDays || 0)
          : b.total - a.total);
  }, [customers, q, bucket, sort]);

  const shown = filtered.reduce((a, c) => a + c.total, 0);
  const cell = (v, color) => <span style={{ ...num, color: v ? color : 'var(--fg-3)' }}>{v ? money(v) : '—'}</span>;

  return (
    <>
      {/* ── Clickable aging summary = the ONE filter ───────────────────────── */}
      <div className="card card-amber" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 10 }}>
        {BUCKETS.map((b) => {
          const active = bucket === b.key;
          return (
            <button key={b.key} onClick={() => setBucket(b.key)}
              style={{ flex: b.big ? '0 0 auto' : 1, minWidth: b.big ? 150 : 96, textAlign: 'left', cursor: 'pointer',
                background: active ? 'var(--surface-3)' : 'transparent', border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 10, padding: '8px 12px' }}>
              <div style={{ fontSize: b.big ? 24 : 17, fontWeight: 800, color: b.color }}>{money(bucketVal(b.key))}</div>
              <div className="muted" style={{ fontSize: 10 }}>{b.label}{b.big ? ` · ${summary.custCount.toLocaleString()} cust · ${summary.count.toLocaleString()} inv` : ''}</div>
            </button>
          );
        })}
      </div>
      {summary.doubtful > 0 && <div className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>🚫 <strong>{money(summary.doubtful)}</strong> marked doubtful — kept on file (statements + lawyer packet) but <strong>not counted</strong> toward collectible AR.</div>}

      {/* ── Top deadbeats — chase these first ──────────────────────────────── */}
      {topDeadbeats.length > 1 && (
        <div style={{ margin: '12px 0 4px' }}>
          <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>🎯 Top deadbeats · chase these first</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {topDeadbeats.map((c, i) => (
              <button key={c.cid} onClick={() => jumpTo(c.cid)} className="card" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', margin: 0, cursor: 'pointer', textAlign: 'left', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--fg-3)' }}>#{i + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 13, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ fontSize: 12 }}><strong style={{ color: 'var(--accent)' }}>{money(c.total)}</strong>{c.oldestDays != null && <span style={{ color: ageColor(c.oldestDays), marginLeft: 5 }}>· {c.oldestDays}d</span>}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* search + sort (no duplicate chip row — buckets above are the filter) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 6px' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Search a customer (name, CB#, phone)…" style={{ ...ctrl, flex: 1, minWidth: 220 }} />
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={ctrl}>
          <option value="owed">Owed (high→low)</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        <strong>{filtered.length}</strong> customer{filtered.length === 1 ? '' : 's'} · {money(shown)}
        {(q || bucket !== 'all') ? <button onClick={() => { setQ(''); setBucket('all'); }} style={{ marginLeft: 8, background: 'none', border: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }}>clear filter ✕</button> : ''}
      </div>
      {err && <div className="notice" style={{ color: 'var(--red)' }}>{err}</div>}

      {/* QuickBooks-style aging table */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <div style={{ minWidth: 680 }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.04em', position: 'sticky', top: 0, background: 'var(--surface-1)' }}>
            <span>Customer</span><span style={{ textAlign: 'right' }}>0–30</span><span style={{ textAlign: 'right' }}>31–60</span><span style={{ textAlign: 'right' }}>61–90</span><span style={{ textAlign: 'right' }}>90+</span><span style={{ textAlign: 'right' }}>Total</span>
          </div>

          {!filtered.length && <div className="muted" style={{ padding: 14, fontSize: 13 }}>No customers match — clear the search or filter.</div>}

          {filtered.map((c) => {
            const isOpen = !!open[c.cid];
            const b = c.buckets || {};
            return (
              <div key={c.cid} id={'cust-' + c.cid}>
                <div onClick={() => toggle(c.cid)} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 8, padding: '9px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center', cursor: 'pointer', background: isOpen ? 'var(--surface-1)' : 'transparent' }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--fg-3)', fontSize: 11, marginRight: 6 }}>{isOpen ? '▾' : '▸'}</span>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</span>
                      {c.cbNumber && <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>CB-{c.cbNumber}</span>}
                      {c.oldestDays != null && <span style={{ fontSize: 10, marginLeft: 6, color: ageColor(c.oldestDays) }}>· {c.oldestDays}d</span>}
                      {c.doubtful > 0 && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--fg-3)' }}>· 🚫 {money(c.doubtful)} doubtful</span>}
                    </span>
                    {c.note && <span style={{ display: 'block', fontSize: 11, color: /do not service|dns/i.test(c.note) ? 'var(--red)' : 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 17 }}>📝 {c.note}</span>}
                  </span>
                  {cell(b.cur, 'var(--green)')}
                  {cell(b.d60, 'var(--accent)')}
                  {cell(b.d90, '#e65100')}
                  {cell(b.d90p, 'var(--red)')}
                  <span style={{ ...num, fontWeight: 800, fontSize: 13, color: c.total ? 'var(--accent)' : 'var(--fg-3)' }}>
                    {c.total ? money(c.total) : (c.doubtful ? <span style={{ textDecoration: 'line-through' }}>{money(c.doubtful)}</span> : '$0')}
                  </span>
                </div>

                {isOpen && (
                  <div style={{ padding: '8px 14px 12px', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}>
                    <ArNote customerId={c.cid} note={c.note} canEdit={canMark} onSaved={() => router.refresh()} />
                    <CollectionsTimeline customerId={c.cid} oldestDays={c.oldestDays} address={c.address} phone={c.phone} email={c.email} canLog={canMark} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '10px 0 6px' }}>
                      <span className="muted" style={{ fontSize: 12 }}>{c.phone ? `📞 ${c.phone}` : ''}</span>
                      {canMark && (
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button onClick={() => run('db-' + c.cid, () => markCustomerDoubtful(c.cid, !(c.doubtful > 0 && c.total === 0)))} disabled={pending}
                            title="Too old to count on — keeps it owed (statement + lawyer packet) but out of collectible AR"
                            style={{ background: 'transparent', color: 'var(--fg-2)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: pending && busyId === 'db-' + c.cid ? 0.6 : 1 }}>
                            {busyId === 'db-' + c.cid ? '…' : (c.doubtful > 0 && c.total === 0) ? '↩ Restore balance' : '🚫 Mark balance doubtful'}
                          </button>
                          {c.total > 0 && (
                            <button onClick={() => makePayLink(c)} disabled={pending}
                              title="Create a Stripe pay page for this balance — text/email it to the customer"
                              style={{ background: 'transparent', color: '#635bff', border: '1px solid #635bff', borderRadius: 7, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: pending && busyId === 'pl-' + c.cid ? 0.6 : 1 }}>
                              {busyId === 'pl-' + c.cid ? 'Creating…' : '💳 Pay link'}
                            </button>
                          )}
                          {c.total > 0 && (
                            <button onClick={() => run('cust-' + c.cid, () => markCustomerPaid(c.cid))} disabled={pending}
                              style={{ background: 'var(--green)', color: '#fff', border: 0, borderRadius: 7, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: pending && busyId === 'cust-' + c.cid ? 0.6 : 1 }}>
                              {busyId === 'cust-' + c.cid ? 'Marking…' : `✓ Mark all paid (${money(c.total)})`}
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                    {payLinks[c.cid] && (
                      <div style={{ margin: '0 0 8px', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid #635bff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#635bff' }}>💳 Pay link</span>
                          <input readOnly value={payLinks[c.cid].url} onFocus={(e) => e.target.select()} style={{ flex: '1 1 200px', minWidth: 0, background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 6, padding: '5px 8px', fontSize: 12 }} />
                          <button onClick={() => navigator.clipboard && navigator.clipboard.writeText(payLinks[c.cid].url)} style={{ background: '#635bff', color: '#fff', border: 0, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Copy</button>
                          <a href={payLinks[c.cid].url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>Open ↗</a>
                        </div>
                        {payLinks[c.cid].feeDollars > 0 && (
                          <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>Customer pays <strong style={{ color: 'var(--fg-1)' }}>{money(payLinks[c.cid].totalDollars)}</strong> = {money(payLinks[c.cid].baseDollars)} + {money(payLinks[c.cid].feeDollars)} card convenience fee.</div>
                        )}
                      </div>
                    )}
                    {c.invoices.map((i) => (
                      <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 12.5, opacity: i.doubtful ? 0.6 : 1 }}>
                        <span style={{ textDecoration: i.doubtful ? 'line-through' : 'none' }}>#{i.invoice_number}{i.city ? <span className="muted" style={{ fontSize: 11 }}> · {i.city}</span> : ''}{i.doubtful && <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>🚫 doubtful</span>}</span>
                        <span style={{ color: ageColor(i.days), fontSize: 11, whiteSpace: 'nowrap' }}>{i.invoice_date || '—'}{i.days != null ? ` · ${i.days}d` : ''}</span>
                        <span style={{ ...num, fontWeight: 700, minWidth: 64, textDecoration: i.doubtful ? 'line-through' : 'none' }}>{money(i.balance)}</span>
                        {canMark
                          ? <span style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                              {!i.doubtful && <button onClick={() => run(i.id, () => markInvoicePaid(i.id))} disabled={pending}
                                style={{ background: 'transparent', color: 'var(--green)', border: '1px solid var(--green)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: pending && busyId === i.id ? 0.5 : 1 }}>
                                {busyId === i.id ? '…' : '✓ Paid'}
                              </button>}
                              <button onClick={() => run('d' + i.id, () => setInvoiceDoubtful(i.id, !i.doubtful))} disabled={pending}
                                title={i.doubtful ? 'Restore to collectible' : 'Mark doubtful — won’t count toward the bank'}
                                style={{ background: 'transparent', color: 'var(--fg-3)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: pending && busyId === 'd' + i.id ? 0.5 : 1 }}>
                                {busyId === 'd' + i.id ? '…' : i.doubtful ? '↩' : '🚫'}
                              </button>
                            </span>
                          : <span />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
