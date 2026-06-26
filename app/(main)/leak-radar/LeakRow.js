'use client';

// One flagged job + its disposition controls. Manager picks what happened — it records + logs, never
// touches the job itself. Already-reviewed flags collapse to a quiet line showing the call that was made.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reviewLeak } from './actions';

const REASON_ICON = { thin_margin: '📉', underbilled: '🩸', parts_overclaim: '🧾', no_receipt: '🐀', no_cost: '❓' };
const SEV = { high: { c: 'var(--red)', l: 'HIGH' }, med: { c: 'var(--amber)', l: 'MED' }, low: { c: 'var(--muted)', l: 'LOW' } };
const ACTIONS = [
  ['rebilled', '🧾 Re-billed', 'var(--green)'],
  ['recovered', '💵 Recovered', 'var(--green)'],
  ['coaching', '🎓 Coaching', 'var(--amber)'],
  ['dismissed', '✓ OK / dismiss', 'var(--muted)'],
];
const fmt = (c) => '$' + Math.round((Number(c) || 0) / 100).toLocaleString();

export default function LeakRow({ flag, review }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(review?.note || '');
  const [msg, setMsg] = useState(null);
  const sev = SEV[flag.severity] || SEV.low;

  const act = (status) => start(async () => {
    const r = await reviewLeak(flag.id, status, { note, reason: flag.reasons.map((x) => x.code).join(','), leakCents: flag.leakCents });
    if (r.ok) { setOpen(false); router.refresh(); } else setMsg(r.msg);
  });

  const reviewed = review && review.status !== 'open';

  return (
    <div style={{ padding: '11px 13px', borderRadius: 10, background: 'var(--surface-2)', border: `1px solid ${reviewed ? 'var(--border)' : sev.c + '55'}`, opacity: reviewed ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="pill" style={{ fontSize: 10, fontWeight: 800, color: sev.c, border: `1px solid ${sev.c}` }}>{sev.l}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{flag.typeLabel}{flag.customer ? ` · ${flag.customer}` : ''}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>{fmt(flag.revenueCents)} ticket · {flag.marginPct}% margin{flag.tech ? ` · ${flag.tech}` : ''}</div>
        </div>
        {flag.leakCents > 0 && <div style={{ textAlign: 'right' }}><div style={{ fontSize: 17, fontWeight: 800, color: sev.c }}>{fmt(flag.leakCents)}</div><div className="muted" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>est. leak</div></div>}
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
        {flag.reasons.map((r, i) => (
          <span key={i} className="pill" style={{ fontSize: 11, background: 'var(--surface-1)' }}>{REASON_ICON[r.code] || '•'} {r.label}</span>
        ))}
      </div>

      {reviewed ? (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>✓ {review.status} by {review.reviewed_by_name}{review.note ? ` — “${review.note}”` : ''} · <a href={`/job/${flag.id}`}>open job</a></div>
      ) : (
        <div style={{ marginTop: 9 }}>
          {!open ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setOpen(true)} className="btn" style={{ fontSize: 12.5, padding: '6px 12px' }}>Review →</button>
              <a href={`/job/${flag.id}`} className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 12px' }}>Open job</a>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 7 }}>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (what happened / how recovered)" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '7px 9px', fontSize: 12.5 }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ACTIONS.map(([s, l, c]) => (
                  <button key={s} onClick={() => act(s)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: c, border: `1px solid ${c}` }}>{l}</button>
                ))}
                <button onClick={() => setOpen(false)} className="pill muted" style={{ cursor: 'pointer' }}>cancel</button>
              </div>
              {msg && <div style={{ color: 'var(--red)', fontSize: 12 }}>{msg}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
