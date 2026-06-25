'use client';

// End-of-Day — tech/iPad wrap-up. Auto-detected issues (unresolved jobs, failed/missing photo proof,
// open corrections) show as warnings and are logged for the office. Checklist confirms tools/receipts/
// stock. Warnings don't block "ready for tomorrow" — they notify the office.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saveShift } from '../start/actions';
import { CircleCheck, Circle, CircleAlert, Wrench, Receipt, PackageCheck, ClipboardList } from 'lucide-react';

export default function EndOfDay({ name, summary, tomorrowCount, saved }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [checks, setChecks] = useState(() => (saved && saved.checklist) || {});
  const [notes, setNotes] = useState((saved && saved.notes) || '');

  const ITEMS = [
    { key: 'end_shift', label: 'End shift confirmed', icon: ClipboardList, req: true },
    { key: 'tools_returned', label: 'All tools returned / accounted for', icon: Wrench, req: true },
    { key: 'receipts', label: 'Receipts uploaded for today', icon: Receipt, req: true },
    { key: 'truck_stock', label: 'Truck stock OK (or noted below)', icon: PackageCheck, req: true },
    { key: 'parts_logged', label: 'Parts used logged / parts needed noted', icon: PackageCheck, req: false },
    { key: 'tomorrow_reviewed', label: `Reviewed tomorrow (${tomorrowCount} job${tomorrowCount === 1 ? '' : 's'})`, icon: ClipboardList, req: false },
  ];
  const required = ITEMS.filter((i) => i.req).map((i) => i.key);
  const allReq = required.every((k) => checks[k]);
  const toggle = (k) => setChecks((c) => ({ ...c, [k]: !c[k] }));

  // Warnings = auto-detected issues + unchecked confirms.
  const warnings = [
    summary.unresolved > 0 && `${summary.unresolved} unresolved job${summary.unresolved > 1 ? 's' : ''}`,
    summary.failedQa > 0 && `${summary.failedQa} failed photo${summary.failedQa > 1 ? 's' : ''}`,
    summary.missingMedia > 0 && `${summary.missingMedia} job${summary.missingMedia > 1 ? 's' : ''} missing proof`,
    summary.corrections > 0 && `${summary.corrections} open QA hold${summary.corrections > 1 ? 's' : ''}`,
    !checks.tools_returned && 'tools not confirmed returned',
    !checks.receipts && 'receipts not confirmed uploaded',
  ].filter(Boolean);

  const flags = {
    unresolved: summary.unresolved, failed_qa: summary.failedQa, missing_media: summary.missingMedia,
    corrections: summary.corrections, tools_unreturned: !checks.tools_returned, receipts_missing: !checks.receipts,
  };
  const persist = (ready) => { setMsg(null); start(async () => { const r = await saveShift('eod', checks, ready, flags, notes); setMsg(r); if (r?.ok) router.refresh(); }); };

  return (
    <div className="wrap" style={{ maxWidth: 620 }}>
      <div className="h1" style={{ marginBottom: 2 }}>🌙 End of Day</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Wrap up, {name}.{saved?.ready ? ' · ✅ Ready for tomorrow' : ''}</div>

      {/* auto-detected issues */}
      {warnings.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid var(--amber)', background: 'rgba(255,179,0,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <CircleAlert size={16} style={{ color: 'var(--amber)' }} />
            <span style={{ fontWeight: 800, color: 'var(--amber)' }}>Before you leave — {warnings.length} item{warnings.length > 1 ? 's' : ''} to flag</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: 'var(--fg-1)' }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>These get sent to the office/supervisor when you finish. {summary.failedQa + summary.missingMedia > 0 && <Link href="/my-day" style={{ color: 'var(--amber)' }}>Open My Day to fix →</Link>}</div>
        </div>
      )}
      {warnings.length === 0 && <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid var(--green)' }}><span style={{ color: 'var(--green)', fontWeight: 800 }}>✓ Clean day — no open issues detected.</span></div>}

      {/* checklist */}
      <div style={{ display: 'grid', gap: 8 }}>
        {ITEMS.map((it) => {
          const on = !!checks[it.key]; const I = it.icon;
          return (
            <button key={it.key} onClick={() => toggle(it.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                border: '1px solid ' + (on ? 'var(--green)' : 'var(--border-strong)'), background: on ? 'color-mix(in oklab, var(--green) 10%, var(--surface-1))' : 'var(--surface-2)' }}>
              {on ? <CircleCheck size={24} style={{ color: 'var(--green)', flexShrink: 0 }} /> : <Circle size={24} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />}
              <I size={18} style={{ color: on ? 'var(--green)' : 'var(--fg-3)', flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: on ? 'var(--fg-1)' : 'var(--fg-2)' }}>{it.label}{it.req ? <span style={{ color: 'var(--amber)' }}> *</span> : null}</span>
            </button>
          );
        })}
      </div>

      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Office notes before you leave (parts needed, truck issue, customer follow-up…)"
        style={{ width: '100%', marginTop: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '11px', fontSize: 13, resize: 'vertical' }} />

      <button onClick={() => persist(true)} disabled={pending || !allReq}
        style={{ width: '100%', marginTop: 14, padding: '16px', borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: allReq ? 'pointer' : 'not-allowed',
          border: 'none', background: allReq ? (warnings.length ? 'var(--amber)' : 'var(--green)') : 'var(--surface-2)', color: allReq ? '#1a1206' : 'var(--fg-3)', opacity: pending ? 0.6 : 1 }}>
        {pending ? '…' : allReq ? (warnings.length ? '🌙 End day — flag issues to office' : '🌙 Ready for tomorrow') : 'Confirm the required items'}
      </button>
      <button onClick={() => persist(false)} disabled={pending} style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--fg-2)', fontSize: 13, cursor: 'pointer' }}>Save progress</button>
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, textAlign: 'center', color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}
