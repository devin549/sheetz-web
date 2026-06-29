'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saveReceipt, readReceipt, confirmSubcontractor, verifySubcontractor } from './actions';
import { createToolPurchase } from '../tools/purchaseActions';

const CATS = ['materials', 'fuel', 'tools', 'permit', 'other'];
const money = (cents) => '$' + (Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '7px 9px', fontSize: 13, fontFamily: 'inherit' };
const STATUS = { verified: { label: 'Verified', color: 'var(--green)' }, flagged: { label: 'Flagged', color: 'var(--red)' }, pending: { label: 'Pending', color: 'var(--amber)' } };

function ReceiptCard({ r, canSave, canVerify, aiReady }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const e = r.entry || {};
  const [vendor, setVendor] = useState(e.vendor || '');
  const [amount, setAmount] = useState(e.amount_cents ? (e.amount_cents / 100).toFixed(2) : '');
  const [category, setCategory] = useState(e.category || 'materials');
  const [note, setNote] = useState(e.note || '');
  const st = STATUS[e.status] || null;
  // Subcontractor gate
  const subIs = !!e.is_subcontractor, subStatus = e.sub_status || null;
  const [subName, setSubName] = useState(e.sub_name || '');
  const [aiSubHint, setAiSubHint] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejReason, setRejReason] = useState('');
  function confirmSub(isSub) {
    const fd = new FormData(); fd.set('photoId', r.photoId); fd.set('isSub', isSub ? 'true' : 'false'); fd.set('subName', subName);
    setMsg(null); start(async () => { const res = await confirmSubcontractor(fd); setMsg(res); if (res.ok) router.refresh(); });
  }
  function verifySub(decision) {
    setMsg(null); start(async () => { const res = await verifySubcontractor(r.photoId, decision, rejReason); setMsg(res); if (res.ok) { setRejecting(false); router.refresh(); } });
  }
  // Tool-plan setup (shown when this receipt is a 'tools' purchase) — turns the receipt into a payoff plan.
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState({ toolName: '', techName: r.job.tech || '', weeklyPct: '10', keepOnVan: false });
  const setP = (k) => (ev) => setPlan((s) => ({ ...s, [k]: ev.target.value }));
  function makePlan() {
    setMsg(null);
    start(async () => {
      const res = await createToolPurchase({ toolName: plan.toolName, techName: plan.techName, valueDollars: amount, weeklyPct: plan.weeklyPct, vendor, receiptPath: r.storagePath, keepOnVan: plan.keepOnVan });
      setMsg(res.ok ? { ok: true, msg: res.msg } : res);
      if (res.ok) { setPlanOpen(false); router.refresh(); }
    });
  }

  function save(status) {
    const fd = new FormData();
    fd.set('photoId', r.photoId); fd.set('jobId', r.jobId); fd.set('vendor', vendor); fd.set('amount', amount); fd.set('category', category); fd.set('note', note); fd.set('status', status);
    setMsg(null);
    start(async () => { const res = await saveReceipt(fd); setMsg(res); if (res.ok) router.refresh(); });
  }
  function readAI() {
    setMsg(null);
    start(async () => {
      const res = await readReceipt(r.photoId);
      if (res.ok) {
        if (res.vendor) setVendor(res.vendor); if (res.amount !== '') setAmount(String(res.amount)); if (res.category) setCategory(res.category);
        if (res.isSubcontractor) { setAiSubHint(true); if (res.subName && !subName) setSubName(res.subName); }
        setMsg({ ok: true, msg: res.isSubcontractor ? '🤖 Looks like a subcontractor bill — confirm below to route to accounting.' : 'AI filled it in — review, then Verify.' });
      }
      else setMsg(res);
    });
  }

  return (
    <article className="card" style={{ padding: 0, overflow: 'hidden', borderColor: e.status === 'flagged' ? 'var(--red)' : e.status === 'verified' ? 'var(--green)' : 'var(--border)' }}>
      {r.signedUrl ? (
        <a href={r.signedUrl} target="_blank" rel="noreferrer" style={{ display: 'block', background: 'var(--surface-2)' }}>
          <img src={r.signedUrl} alt="Receipt" loading="lazy" style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block', maxHeight: 220 }} />
        </a>
      ) : <div className="muted" style={{ aspectRatio: '3 / 4', maxHeight: 220, display: 'grid', placeItems: 'center', background: 'var(--surface-2)' }}>No preview</div>}
      <div style={{ padding: 12, display: 'grid', gap: 7 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.job.customer || 'Job'}{r.job.job_number ? ` · #${r.job.job_number}` : ''}</span>
          {st && <span className="pill" style={{ fontSize: 9.5, color: st.color }}>{st.label}</span>}
        </div>
        <div className="muted" style={{ fontSize: 11 }}>{[r.job.tech, r.uploadedBy].filter(Boolean).join(' · ') || '—'}</div>
        {aiReady && r.signedUrl && <button disabled={pending} onClick={readAI} className="pill" style={{ cursor: 'pointer', justifyContent: 'center', display: 'flex', background: 'color-mix(in oklab, var(--accent) 12%, var(--surface-2))', color: 'var(--accent)', fontWeight: 800, border: '1px solid var(--border-strong)' }}>{pending ? '…' : '🔍 AI read'}</button>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 6 }}>
          <input value={vendor} onChange={(ev) => setVendor(ev.target.value)} placeholder="Vendor" style={input} />
          <input value={amount} onChange={(ev) => setAmount(ev.target.value)} placeholder="$" inputMode="decimal" style={{ ...input, textAlign: 'right' }} />
        </div>
        <select value={category} onChange={(ev) => setCategory(ev.target.value)} style={input}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Note (optional)" style={input} />
        {canSave && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={pending} onClick={() => save('verified')} className="pill" style={{ cursor: 'pointer', flex: 1, justifyContent: 'center', display: 'flex', background: 'rgba(70,193,120,.16)', color: 'var(--green)', fontWeight: 800, border: '1px solid var(--border-strong)' }}>Verify</button>
            <button disabled={pending} onClick={() => save('flagged')} className="pill" style={{ cursor: 'pointer', flex: 1, justifyContent: 'center', display: 'flex', color: 'var(--red)', border: '1px solid var(--border-strong)' }}>Flag</button>
            <button disabled={pending} onClick={() => save('pending')} className="pill" style={{ cursor: 'pointer', border: '1px solid var(--border-strong)' }}>Save</button>
          </div>
        )}
        {/* 🧱 Subcontractor gate — flag → accounting verifies before pay (no money moved here). */}
        {subIs && subStatus === 'pending_verify' ? (
          <div style={{ border: '1px solid var(--red)', borderRadius: 8, padding: 8, display: 'grid', gap: 6 }}>
            <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--red)' }}>🛑 Subcontractor — DO NOT PAY yet</div>
            <div className="muted" style={{ fontSize: 11 }}>{e.sub_name ? `${e.sub_name} · ` : ''}flagged by {e.sub_confirmed_by || 'staff'} · accounting must verify.</div>
            {canVerify ? (!rejecting ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={pending} onClick={() => verifySub('cleared')} className="pill" style={{ cursor: 'pointer', flex: 1, justifyContent: 'center', display: 'flex', background: 'rgba(70,193,120,.16)', color: 'var(--green)', fontWeight: 800, border: '1px solid var(--border-strong)' }}>✓ Clear to pay</button>
                <button disabled={pending} onClick={() => setRejecting(true)} className="pill" style={{ cursor: 'pointer', color: 'var(--red)', border: '1px solid var(--border-strong)' }}>Reject</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <input value={rejReason} onChange={(ev) => setRejReason(ev.target.value)} placeholder="Reason for rejecting" style={input} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button disabled={pending} onClick={() => verifySub('rejected')} className="pill" style={{ cursor: 'pointer', flex: 1, justifyContent: 'center', display: 'flex', color: 'var(--red)', border: '1px solid var(--red)' }}>Confirm reject</button>
                  <button onClick={() => setRejecting(false)} className="pill" style={{ cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            )) : <div className="muted" style={{ fontSize: 11 }}>Waiting on accounting to verify.</div>}
          </div>
        ) : subIs && subStatus === 'cleared' ? (
          <div style={{ fontSize: 11.5, color: 'var(--green)', fontWeight: 700 }}>✅ Subcontractor cleared to pay{e.sub_verified_by ? ` · ${e.sub_verified_by}` : ''} — pay via AP.</div>
        ) : subIs && subStatus === 'rejected' ? (
          <div style={{ fontSize: 11.5, color: 'var(--red)', fontWeight: 700 }}>✗ Subcontractor rejected{e.sub_reject_reason ? `: ${e.sub_reject_reason}` : ''} — held.</div>
        ) : canSave ? (
          <div style={{ borderTop: '1px dashed var(--border-strong)', paddingTop: 8 }}>
            {aiSubHint && <div style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 4 }}>🤖 This looks like a subcontractor bill — confirm to route it to accounting.</div>}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={subName} onChange={(ev) => setSubName(ev.target.value)} placeholder="Sub name (optional)" style={{ ...input, flex: 1 }} />
              <button disabled={pending} onClick={() => confirmSub(true)} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: `1px solid ${aiSubHint ? 'var(--amber)' : 'var(--border-strong)'}`, fontWeight: 700, whiteSpace: 'nowrap' }}>🧱 Confirm sub</button>
            </div>
          </div>
        ) : null}

        {/* 🧰 Company-bought tool → spin up a weekly-payoff plan straight off this receipt. */}
        {category === 'tools' && (
          <div style={{ borderTop: '1px dashed var(--border-strong)', paddingTop: 8, marginTop: 1 }}>
            {!planOpen ? (
              <button onClick={() => setPlanOpen(true)} className="pill" style={{ cursor: 'pointer', width: '100%', justifyContent: 'center', display: 'flex', color: 'var(--amber)', border: '1px solid var(--amber-dim)', fontWeight: 700 }}>🧰 Set up tool plan</button>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <input value={plan.toolName} onChange={setP('toolName')} placeholder="tool (e.g. K-60 cable machine)" style={input} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px', gap: 6 }}>
                  <input value={plan.techName} onChange={setP('techName')} placeholder="tech name" style={input} />
                  <input value={plan.weeklyPct} onChange={setP('weeklyPct')} placeholder="%" inputMode="decimal" style={{ ...input, textAlign: 'right' }} />
                </div>
                {!plan.keepOnVan && amount && Number(amount) > 0 && Number(plan.weeklyPct) > 0 && (
                  <div className="muted" style={{ fontSize: 10.5 }}>≈ {money(Math.round(Number(amount) * Number(plan.weeklyPct)))}/wk · ~{Math.ceil(100 / Number(plan.weeklyPct))} wks · {money(Math.round(Number(amount) * 100))} value</div>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                  <input type="checkbox" checked={plan.keepOnVan} onChange={(ev) => setPlan((s) => ({ ...s, keepOnVan: ev.target.checked }))} />
                  🚐 Company tool — keep on van, no deduction
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button disabled={pending} onClick={makePlan} className="pill" style={{ cursor: 'pointer', flex: 1, justifyContent: 'center', display: 'flex', background: 'color-mix(in oklab, var(--amber) 16%, var(--surface-2))', color: 'var(--amber)', fontWeight: 800, border: '1px solid var(--border-strong)' }}>{plan.keepOnVan ? 'Add company tool' : 'Start plan'}</button>
                  <button disabled={pending} onClick={() => setPlanOpen(false)} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)', border: '1px solid var(--border-strong)' }}>✕</button>
                </div>
              </div>
            )}
          </div>
        )}
        {r.jobId && <Link href={`/job/${r.jobId}`} className="muted" style={{ fontSize: 11 }}>open job →</Link>}
        {msg && <div style={{ fontSize: 11, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
      </div>
    </article>
  );
}

export default function ReceiptInboxClient({ receipts, canSave, canVerify, aiReady }) {
  const [filter, setFilter] = useState('all');
  const isSubPending = (r) => r.entry?.is_subcontractor && r.entry?.sub_status === 'pending_verify';
  const counts = useMemo(() => {
    const c = { all: receipts.length, pending: 0, verified: 0, flagged: 0, subs: 0, total: 0 };
    receipts.forEach((r) => { const s = r.entry?.status || 'pending'; c[s] = (c[s] || 0) + 1; if (r.entry?.status === 'verified') c.total += Number(r.entry.amount_cents) || 0; if (isSubPending(r)) c.subs += 1; });
    return c;
  }, [receipts]);
  const shown = receipts.filter((r) => filter === 'all' ? true : filter === 'subs' ? isSubPending(r) : (r.entry?.status || 'pending') === filter);

  if (!receipts.length) return <div className="card"><span className="muted">No receipts yet — when a tech tags a photo as “receipt” on a job, it lands here for review.</span></div>;

  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Verified $</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{money(counts.total)}</div></div>
        {['all', 'pending', 'verified', 'flagged', 'subs'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="pill" style={{ cursor: 'pointer', textTransform: 'capitalize', fontWeight: filter === f ? 800 : 600, border: filter === f ? '1px solid var(--amber)' : '1px solid transparent', background: filter === f ? 'color-mix(in oklab, var(--amber) 16%, var(--surface-2))' : 'var(--surface-2)', color: f === 'subs' && counts.subs ? 'var(--red)' : undefined }}>{f === 'subs' ? '🧱 subs to verify' : f} <strong>{counts[f] || 0}</strong></button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
        {shown.map((r) => <ReceiptCard key={r.photoId} r={r} canSave={canSave} canVerify={canVerify} aiReady={aiReady} />)}
      </div>
    </>
  );
}
