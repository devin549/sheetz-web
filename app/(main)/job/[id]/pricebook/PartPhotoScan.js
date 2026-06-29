'use client';

// 📸 Scan the Pricebook — snap the fixture, Claude Vision IDs it, and we show its REPAIRS and REPLACEMENTS
// straight from OUR book. Tap one to drop it on the estimate. The recommended "best" softly glows (wow).
// Fast: one Vision call, no SerpAPI/quota. The type-in (ProblemFinder) sits right below for anything the
// photo can't catch.
import { useState, useTransition } from 'react';
import { scanFixtureRepairs } from '@/app/(main)/identify/actions';
import InAppCamera from '../InAppCamera';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fileToDataUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });

function Row({ f, best, added, onPick }) {
  return (
    <button onClick={() => onPick(f)} disabled={added} className={best ? 'cb-recommend' : ''}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 9, width: '100%', textAlign: 'left', cursor: added ? 'default' : 'pointer', border: `1px solid ${best ? 'var(--amber)' : 'var(--border)'}`, background: added ? 'color-mix(in oklab, var(--green) 12%, var(--surface-1))' : best ? 'color-mix(in oklab, var(--amber) 8%, var(--surface-2))' : 'var(--surface-2)' }}>
      {best && <span className="pill" style={{ fontSize: 9, fontWeight: 800, color: '#1a1206', background: 'var(--amber)' }}>★ BEST</span>}
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
      <span style={{ fontWeight: 700, color: 'var(--amber)' }}>{money(f.price)}</span>
      <span className="pill" style={{ fontSize: 10, color: added ? 'var(--green)' : 'var(--amber)' }}>{added ? '✓ added' : '➕ add'}</span>
    </button>
  );
}

export default function PartPhotoScan({ onAdd }) {
  const [pending, start] = useTransition();
  const [cam, setCam] = useState(false);
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState(null);
  const [added, setAdded] = useState({});

  const onPhoto = (file) => {
    setCam(false); setRes(null); setMsg('🔎 Reading the photo…');
    start(async () => {
      let dataUrl = null; try { dataUrl = await fileToDataUrl(file); } catch (_) {}
      if (!dataUrl) { setMsg('Could not read that image.'); return; }
      const r = await scanFixtureRepairs(dataUrl);
      if (r.ok) { setRes(r); setMsg(null); } else setMsg(r.msg);
    });
  };
  const pick = (f) => { if (onAdd) onAdd({ id: f.id, name: f.name, price: f.price, minimum: null }); setAdded((a) => ({ ...a, [f.id]: true })); };

  const hasResults = res && ((res.repairs && res.repairs.length) || (res.replacements && res.replacements.length));

  return (
    <div style={{ marginBottom: 10 }}>
      <button onClick={() => setCam(true)} disabled={pending} className="btn" style={{ width: '100%', padding: '11px', fontSize: 13, background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border-strong)' }}>
        📸 Scan the Pricebook <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>— snap a fixture, see repairs &amp; replacements</span>
      </button>
      {msg && <div style={{ fontSize: 12, marginTop: 6, color: msg.startsWith('🔎') ? 'var(--fg-2)' : 'var(--amber)' }}>{msg}</div>}

      {res && (
        <div style={{ marginTop: 8, padding: '10px 11px', borderRadius: 10, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Looks like</div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{res.label || res.fixture || 'Fixture'}</div>
          {res.problem && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>💡 {res.problem}</div>}

          {!hasResults ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>No matching items in your book yet — try the type-in search below, or browse the categories.</div>
          ) : (
            <>
              {res.repairs?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--fg-2)', marginBottom: 5 }}>🔧 Repairs</div>
                  <div style={{ display: 'grid', gap: 6 }}>{res.repairs.map((f) => <Row key={f.id} f={f} best={f.id === res.bestId} added={!!added[f.id]} onPick={pick} />)}</div>
                </div>
              )}
              {res.replacements?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--fg-2)', marginBottom: 5 }}>🔄 Replacements</div>
                  <div style={{ display: 'grid', gap: 6 }}>{res.replacements.map((f) => <Row key={f.id} f={f} best={f.id === res.bestId} added={!!added[f.id]} onPick={pick} />)}</div>
                </div>
              )}
            </>
          )}
          <button onClick={() => setCam(true)} disabled={pending} className="pill" style={{ cursor: 'pointer', marginTop: 10, fontSize: 11 }}>📸 Scan another</button>
        </div>
      )}

      {cam && <InAppCamera label="Scan a fixture" onCapture={onPhoto} onClose={() => setCam(false)} />}
    </div>
  );
}
