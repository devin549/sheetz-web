'use client';

// Parent-job "Crew & Segments" panel — the rollup the spec asks for: every tech/helper, total labor,
// parts, receipts, photos-by-segment, and live margin health, plus the "Split / Add…" menu (the same
// items as the board right-click) and per-segment activate/complete/cancel. Segments never make a new
// customer job; everything rolls up here.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SEGMENT_KINDS, statusLabel, kindIcon } from '@/lib/segments';
import { createSegment, activateSegment, completeSegment, setSegmentStatus } from './segmentActions';

const money = (c) => '$' + Math.round((Number(c) || 0) / 100).toLocaleString();
const STATUS_COLOR = { draft: 'var(--fg-3)', live_not_active: 'var(--amber)', active: 'var(--green)', done: 'var(--fg-2)', cancelled: 'var(--fg-3)' };
const HEALTH = { good: ['🌽', 'var(--green)'], watch: ['🟡', 'var(--amber)'], bad: ['💩', 'var(--red)'], unknown: ['•', 'var(--fg-3)'] };
const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 13 };

export default function JobSegments({ parentJobId, rollup, segments = [], canDispatch = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(null); // kind being added
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState((segments?.length || 0) > 0); // single-tech jobs start collapsed (no noise)

  const run = (fn) => { setMsg(null); start(async () => { const r = await fn(); if (r && r.msg) setMsg(r); if (!r || r.ok) router.refresh(); }); };
  const add = (form) => { setMsg(null); start(async () => { const r = await createSegment(form); setMsg(r); if (r.ok) { setAdding(null); router.refresh(); } }); };
  const [hc, hcColor] = HEALTH[rollup?.health] || HEALTH.unknown;

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setOpen((o) => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 150 }}>
          <span style={{ fontWeight: 800 }}>👷 Crew &amp; extra work</span>
          <span className="pill" style={{ fontSize: 10 }}>{rollup?.techCount || 0} tech{rollup?.techCount === 1 ? '' : 's'}{(segments?.length || 0) ? ` · ${segments.length} added` : ''}</span>
          <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </button>
        {canDispatch && (
          <div style={{ position: 'relative' }}>
            <select value="" onChange={(e) => { if (e.target.value) { setAdding(e.target.value); setOpen(true); } e.target.value = ''; }} style={{ ...inp, width: 'auto', cursor: 'pointer', fontWeight: 700 }}>
              <option value="">＋ Split / Add…</option>
              {SEGMENT_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.icon} {k.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {open && (<>
      <div className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>Add a 2nd tech, a helper, a parts run, a return visit, or a unit/phase — they roll up to this job (labor, parts, photos, margin).</div>

      {/* rollup chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <span className="pill" style={{ fontSize: 11 }}>👷 {rollup?.techCount || 0} tech{rollup?.techCount === 1 ? '' : 's'}</span>
        {rollup?.helperCount > 0 && <span className="pill" style={{ fontSize: 11 }}>🧑‍🔧 {rollup.helperCount} helper{rollup.helperCount === 1 ? '' : 's'}</span>}
        <span className="pill" style={{ fontSize: 11 }}>⏱ {rollup?.laborHrs || 0}h labor</span>
        <span className="pill" style={{ fontSize: 11 }}>📦 {money(rollup?.partsCents)} parts</span>
        {rollup?.receiptCount > 0 && <span className="pill" style={{ fontSize: 11 }}>🧾 {rollup.receiptCount} receipt{rollup.receiptCount === 1 ? '' : 's'}</span>}
        {rollup?.partsRuns > 0 && <span className="pill" style={{ fontSize: 11 }}>🚐 {rollup.partsRuns} parts run{rollup.partsRuns === 1 ? '' : 's'}</span>}
        <span className="pill" style={{ fontSize: 11 }}>📸 {rollup?.photoCount || 0} photos</span>
        {rollup?.margin && <span className="pill" style={{ fontSize: 11, color: hcColor, border: `1px solid ${hcColor}` }}>{hc} {rollup.margin.pct}% margin</span>}
      </div>

      {/* Split-job pay note — 2+ techs share the commission, exactly like the Tech Sheet "Split" rule. */}
      {(rollup?.techCount || 0) >= 2 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--amber)', background: 'rgba(255,179,0,0.08)', border: '1px solid var(--amber-dim)', borderRadius: 8, padding: '7px 10px', lineHeight: 1.45 }}>
          💰 <strong>Split job</strong> — commission splits 50/50 across {rollup.techCount} techs, and revenue counts 50/50 to each. A salary tech takes no commission; the other still gets their half.
        </div>
      )}

      {/* add form */}
      {adding && (
        <form action={add} className="card card-amber" style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input type="hidden" name="parent_job_id" value={parentJobId} />
          <input type="hidden" name="kind" value={adding} />
          <div style={{ fontWeight: 800, fontSize: 13 }}>{kindIcon(adding)} {(SEGMENT_KINDS.find((k) => k.kind === adding) || {}).label}</div>
          <input name="assigned_tech_name" placeholder="Assign to (tech/helper name)" style={inp} autoComplete="off" />
          <input name="reason" placeholder="Reason (why this segment)" style={inp} autoComplete="off" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ flex: 1, fontSize: 10.5, color: 'var(--fg-3)' }}>When<input type="datetime-local" name="scheduled_at" style={{ ...inp, marginTop: 2 }} /></label>
            <label style={{ flex: 1, fontSize: 10.5, color: 'var(--fg-3)' }}>Est. min<input type="number" name="est_duration_min" min="0" step="15" placeholder="60" style={{ ...inp, marginTop: 2 }} /></label>
          </div>
          {adding === 'unit_phase' && <input name="unit_label" placeholder="Unit / phase label (e.g. Unit 12)" style={inp} autoComplete="off" />}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--fg-2)' }}>
            <input type="checkbox" name="counts_capacity" /> Block this tech&apos;s capacity on the board
          </label>
          <div className="muted" style={{ fontSize: 10.5 }}>Creates a live segment — on the board &amp; assignable, but not a new booked job, no invoice, no customer text. Rolls up here.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add segment →'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(null)}>Cancel</button>
          </div>
        </form>
      )}

      {/* segment list */}
      <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        {segments.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No segments yet — this is a single-tech job. Use “Split / Add” to add crew, a parts run, a return visit, or a unit/phase.</div>}
        {segments.map((s) => {
          const sc = STATUS_COLOR[s.status] || 'var(--fg-3)';
          return (
            <div key={s.id} style={{ padding: '9px 11px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14 }}>{kindIcon(s.kind)}</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{s.segment_no || s.kind}</span>
                {s.assigned_tech_name && <span className="muted" style={{ fontSize: 12 }}>· {s.assigned_tech_name}</span>}
                <span className="pill" style={{ fontSize: 9.5, color: sc, border: `1px solid ${sc}`, marginLeft: 'auto' }}>{statusLabel(s.status)}</span>
              </div>
              {s.reason && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{s.reason}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                {s.status === 'live_not_active' && <button onClick={() => run(() => activateSegment(s.id, parentJobId))} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', border: '1px solid var(--green)' }}>▶ Activate (En Route)</button>}
                {s.status === 'active' && <button onClick={() => run(() => completeSegment(s.id, parentJobId))} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: '1px solid var(--amber)' }}>■ Complete</button>}
                {canDispatch && s.status !== 'done' && s.status !== 'cancelled' && <button onClick={() => run(() => setSegmentStatus(s.id, 'cancelled', parentJobId))} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>cancel</button>}
                {(rollup?.photosBySegment?.[s.id]?.length || 0) > 0 && <span className="pill" style={{ fontSize: 10 }}>📸 {rollup.photosBySegment[s.id].length}</span>}
              </div>
            </div>
          );
        })}
      </div>
      </>)}

      {msg && !msg.ok && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{msg.msg}</div>}
      {msg && msg.ok && <div style={{ color: 'var(--green)', fontSize: 12, marginTop: 8 }}>{msg.msg}</div>}
    </div>
  );
}
