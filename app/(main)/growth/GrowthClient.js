'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runRankScan } from './actions';
import { RefreshCw, TrendingUp, TrendingDown, Minus, MapPin, Trophy } from 'lucide-react';

const shortLoc = (loc) => String(loc || '').replace(', United States', '').replace(', Kentucky', ', KY').replace(', Kentucky,', ', KY,');
const fmtWhen = (iso) => { if (!iso) return 'never'; try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

function rankBadge(rank) {
  if (rank == null) return { t: 'Not found', c: 'var(--red)', bg: 'color-mix(in oklab, var(--red) 14%, var(--surface-2))' };
  if (rank <= 3) return { t: `#${rank}`, c: 'var(--green)', bg: 'color-mix(in oklab, var(--green) 16%, var(--surface-2))' };
  if (rank <= 10) return { t: `#${rank}`, c: 'var(--amber)', bg: 'color-mix(in oklab, var(--amber) 16%, var(--surface-2))' };
  return { t: `#${rank}`, c: 'var(--red)', bg: 'color-mix(in oklab, var(--red) 12%, var(--surface-2))' };
}

function Trend({ rank, prevRank }) {
  if (prevRank === undefined) return <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>—</span>;
  if (prevRank == null && rank != null) return <span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 700 }}>new ✦</span>;
  if (prevRank != null && rank == null) return <span style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 700 }}><TrendingDown size={13} /> fell off</span>;
  if (rank == null && prevRank == null) return <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>—</span>;
  const diff = prevRank - rank; // positive = moved up (smaller number)
  if (diff > 0) return <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 700 }}><TrendingUp size={13} /> +{diff}</span>;
  if (diff < 0) return <span style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 700 }}><TrendingDown size={13} /> {diff}</span>;
  return <span style={{ color: 'var(--fg-3)', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11 }}><Minus size={13} /></span>;
}

export default function GrowthClient({ latest, prev, scannedAt }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [errs, setErrs] = useState([]);

  function scan() {
    setMsg(null); setErrs([]);
    start(async () => { const r = await runRankScan(); setMsg(r); setErrs(r.errors || []); if (r.ok) router.refresh(); });
  }

  const total = latest.length;
  const top3 = latest.filter((r) => r.cb_rank != null && r.cb_rank <= 3).length;
  const notFound = latest.filter((r) => r.cb_rank == null).length;
  const inLocal = latest.filter((r) => r.cb_in_local).length;

  const locations = [...new Set(latest.map((r) => r.location))];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <button type="button" className="btn" onClick={scan} disabled={pending} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: pending ? 0.6 : 1 }}>
          <RefreshCw size={15} className={pending ? 'cb-spin' : ''} /> {pending ? 'Scanning…' : 'Run scan'}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>Last scan: {fmtWhen(scannedAt)}{pending ? ' · this takes ~15s' : ''}</span>
        {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      </div>

      {total > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { k: 'Keywords tracked', v: String(total), sub: `${locations.length} markets` },
            { k: 'Top 3', v: String(top3), sub: 'page-one winners', color: 'var(--green)' },
            { k: 'In local pack', v: String(inLocal), sub: 'map results' },
            { k: 'Not found', v: String(notFound), sub: 'biggest opportunities', color: notFound ? 'var(--red)' : 'var(--green)' },
          ].map((c) => (
            <div key={c.k} className="card" style={{ padding: '12px 14px' }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{c.k}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: c.color || 'var(--amber)', marginTop: 2 }}>{c.v}</div>
              <div className="muted" style={{ fontSize: 11 }}>{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {!total && <div className="card"><span className="muted">No scans yet — hit <strong>Run scan</strong> to see where you rank.</span></div>}

      {locations.map((loc) => (
        <div key={loc} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={14} style={{ color: 'var(--amber)' }} /> {shortLoc(loc)}</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {latest.filter((r) => r.location === loc).map((r) => {
              const b = rankBadge(r.cb_rank);
              const leader = (r.top_results && r.top_results[0]) || null;
              return (
                <div key={r.keyword} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 160px', fontWeight: 700, fontSize: 13.5 }}>{r.keyword}</span>
                  <span style={{ minWidth: 78, textAlign: 'center', fontWeight: 800, fontSize: 13, color: b.c, background: b.bg, borderRadius: 7, padding: '4px 8px' }}>{b.t}</span>
                  <span style={{ minWidth: 70, textAlign: 'center' }}><Trend rank={r.cb_rank} prevRank={prev[`${r.keyword}|${r.location}`]} /></span>
                  {r.cb_in_local && <span title="In the Google map pack" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--green)', fontSize: 11, fontWeight: 700 }}><Trophy size={12} /> local</span>}
                  <span className="muted" style={{ flex: '1 1 180px', fontSize: 11.5, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.cb_rank === 1 ? 'you lead 🏆' : leader ? `ahead of you: ${leader.domain}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {errs.length > 0 && (
        <div className="notice" style={{ fontSize: 12 }}>{errs.length} query(ies) failed: {errs.join(' · ')}</div>
      )}
    </>
  );
}
