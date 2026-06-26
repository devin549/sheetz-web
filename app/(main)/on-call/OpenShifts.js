'use client';

// Open-shift board: managers post an after-hours shift with a VOLUNTARY pickup bonus; the first tech to
// tap "I'll take it" wins the shift + bonus. If nobody volunteers, a manager runs the FORCED lottery —
// a random eligible tech is pulled with NO bonus. Every action is logged server-side.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { offerShift, claimShift, forcePull, cancelOffer } from './offerActions';

const money = (c) => '$' + (Number(c || 0) / 100).toLocaleString();
const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 };

function Badge({ o }) {
  if (o.status === 'open') return <span className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber)' }}>OPEN</span>;
  if (o.status === 'claimed') return <span className="pill" style={{ color: 'var(--green)', border: '1px solid var(--green)' }}>✋ {o.claimed_by_name}</span>;
  if (o.status === 'forced') return <span className="pill" style={{ color: 'var(--red)', border: '1px solid var(--red)' }}>🎲 {o.claimed_by_name} (pulled)</span>;
  return <span className="pill muted">cancelled</span>;
}

export default function OpenShifts({ offers = [], canEdit = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState(null);

  const run = (fn) => start(async () => { const r = await fn(); setMsg(r); if (r?.ok) { setPosting(false); router.refresh(); } });
  const post = (form) => run(() => offerShift(form));

  const open = offers.filter((o) => o.status === 'open');
  const settled = offers.filter((o) => o.status !== 'open').slice(0, 8);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="h2" style={{ margin: 0, flex: 1 }}>🔁 Open shifts &amp; swaps</div>
        {canEdit && <button onClick={() => { setPosting(!posting); setMsg(null); }} className="btn btn-ghost" style={{ fontSize: 12.5 }}>{posting ? 'Close' : '+ Post a shift'}</button>}
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Voluntary pickups earn the bonus. If nobody grabs it, a supervisor runs the random lottery — no bonus on a forced pull.</p>

      {posting && (
        <form action={post} className="card card-amber" style={{ display: 'grid', gap: 9, marginTop: 8 }}>
          <input name="label" placeholder="Weekend on-call · which crew?" required style={inp} />
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="muted" style={{ fontSize: 11, flex: 1 }}>Date<input type="date" name="shift_date" style={{ ...inp, marginTop: 3 }} /></label>
            <label className="muted" style={{ fontSize: 11, flex: 1 }}>Pickup bonus $<input type="number" name="bonus" min="0" step="5" placeholder="50" style={{ ...inp, marginTop: 3 }} /></label>
          </div>
          <button className="btn" type="submit" disabled={pending}>{pending ? 'Posting…' : 'Post open shift →'}</button>
        </form>
      )}

      {open.length === 0 && !posting && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>No open shifts right now. 👍</div>}

      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {open.map((o) => (
          <div key={o.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--amber-dim)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{o.label}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{o.shift_date || 'date TBD'}{o.bonus_cents ? ` · pickup bonus ${money(o.bonus_cents)}` : ' · no bonus'}</div>
              </div>
              <Badge o={o} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button onClick={() => run(() => claimShift(o.id))} disabled={pending} className="btn" style={{ fontSize: 12.5, padding: '7px 12px' }}>✋ I’ll take it{o.bonus_cents ? ` (+${money(o.bonus_cents)})` : ''}</button>
              {canEdit && <button onClick={() => run(() => forcePull(o.id))} disabled={pending} className="btn btn-ghost" style={{ fontSize: 12.5, color: 'var(--red)' }}>🎲 Force-pull (lottery)</button>}
              {canEdit && <button onClick={() => run(() => cancelOffer(o.id))} disabled={pending} className="btn btn-ghost" style={{ fontSize: 12.5 }}>Cancel</button>}
            </div>
          </div>
        ))}
      </div>

      {settled.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Recently filled</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {settled.map((o) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '5px 9px', borderRadius: 7, background: 'var(--surface-1)' }}>
                <span style={{ flex: 1, minWidth: 0 }}>{o.label}</span><Badge o={o} />
              </div>
            ))}
          </div>
        </div>
      )}

      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}
