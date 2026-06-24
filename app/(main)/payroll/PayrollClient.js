'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { savePayRate, generateRun, saveLine, approveRun, reopenRun } from './actions';

const money = (c) => '$' + (Number(c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d) => { const [y, m, day] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString([], { timeZone: 'UTC', month: 'short', day: 'numeric' }); };
const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 6, padding: '6px 8px', fontSize: 13, fontFamily: 'inherit', width: '100%' };
// CB rule: commission techs get commission only; hourly excluded.
function grossCents(line, payType) {
  const comm = ['commission', 'hourly_comm'].includes(payType) ? (line.commission_cents || 0) : 0;
  const base = (payType === 'salary' || ['hourly', 'hourly_comm'].includes(payType)) ? (line.hourly_cents || 0) : 0;
  return comm + base + (line.bonus_cents || 0) + (line.adjust_cents || 0);
}

function RateRow({ tech, pay }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [payType, setPayType] = useState(pay?.pay_type || 'commission');
  const [pct, setPct] = useState(pay?.commission_pct ?? '');
  const [rate, setRate] = useState(pay?.hourly_rate ?? '');
  const [sal, setSal] = useState(pay?.weekly_salary ?? '');
  const save = () => { const fd = new FormData(); fd.set('techId', tech.id); fd.set('payType', payType); fd.set('commissionPct', pct); fd.set('hourlyRate', rate); fd.set('weeklySalary', sal); start(async () => { await savePayRate(fd); router.refresh(); }); };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 80px 80px 90px 60px', gap: 6, alignItems: 'center', padding: '5px 0' }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{tech.name}</span>
      <select value={payType} onChange={(e) => setPayType(e.target.value)} style={input}><option value="commission">Commission</option><option value="hourly">Hourly</option><option value="hourly_comm">Hourly+Comm</option><option value="salary">Salary</option></select>
      <input value={pct} onChange={(e) => setPct(e.target.value)} placeholder="%" inputMode="decimal" style={input} title="Commission %" />
      <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="$/hr" inputMode="decimal" style={input} title="Hourly rate" />
      <input value={sal} onChange={(e) => setSal(e.target.value)} placeholder="$/wk" inputMode="decimal" style={input} title="Weekly salary" />
      <button onClick={save} disabled={pending} className="pill" style={{ cursor: 'pointer' }}>Save</button>
    </div>
  );
}

function LineRow({ line, rate, locked }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hours, setHours] = useState(line.hours || 0);
  const [bonus, setBonus] = useState((line.bonus_cents || 0) / 100 || '');
  const [adjust, setAdjust] = useState((line.adjust_cents || 0) / 100 || '');
  const [note, setNote] = useState(line.note || '');
  const isSalary = line.pay_type === 'salary';
  const hourlyCents = isSalary ? (line.hourly_cents || 0) : Math.round((Number(hours) || 0) * (Number(rate) || 0) * 100);
  const live = { ...line, hourly_cents: hourlyCents, bonus_cents: Math.round((Number(bonus) || 0) * 100), adjust_cents: Math.round((Number(adjust) || 0) * 100) };
  const gross = grossCents(live, line.pay_type);
  const save = () => { const fd = new FormData(); fd.set('lineId', line.id); fd.set('hours', hours); fd.set('hourly', (hourlyCents / 100).toString()); fd.set('bonus', bonus || 0); fd.set('adjust', adjust || 0); fd.set('note', note); start(async () => { await saveLine(fd); router.refresh(); }); };
  const showsComm = ['commission', 'hourly_comm'].includes(line.pay_type);
  const showsHours = ['hourly', 'hourly_comm'].includes(line.pay_type);

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '8px 10px', fontWeight: 700 }}>{line.tech_name}<div className="muted" style={{ fontSize: 10.5, fontWeight: 400 }}>{line.pay_type}</div></td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{line.jobs_count}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{money(line.revenue_cents)}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: showsComm ? 'var(--green)' : 'var(--fg-3)' }}>{showsComm ? money(line.commission_cents) : '—'}</td>
      <td style={{ padding: '8px 10px', width: 64 }}>{showsHours && !locked ? <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" style={{ ...input, textAlign: 'right' }} /> : <span className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{showsHours ? hours : '—'}</span>}</td>
      <td style={{ padding: '8px 10px', width: 70 }}>{!locked ? <input value={bonus} onChange={(e) => setBonus(e.target.value)} inputMode="decimal" placeholder="0" style={{ ...input, textAlign: 'right' }} /> : <span className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{money(line.bonus_cents)}</span>}</td>
      <td style={{ padding: '8px 10px', width: 70 }}>{!locked ? <input value={adjust} onChange={(e) => setAdjust(e.target.value)} inputMode="decimal" placeholder="0" style={{ ...input, textAlign: 'right' }} title="+/- callbacks, holds, doc-fraud" /> : <span className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{money(line.adjust_cents)}</span>}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, color: gross <= 0 ? 'var(--red)' : 'var(--fg-1)' }}>{money(gross)}{gross <= 0 && <span title="No pay — check this" style={{ marginLeft: 4 }}>⚠</span>}</td>
      {!locked && <td style={{ padding: '8px 6px' }}><button onClick={save} disabled={pending} className="pill" style={{ cursor: 'pointer' }}>{pending ? '…' : 'Save'}</button></td>}
    </tr>
  );
}

export default function PayrollClient({ week, weekEnd, today, prevWeek, nextWeek, run, lines, techs, payByTech, canApprove }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const locked = run?.status === 'approved';
  const total = lines.reduce((s, l) => s + grossCents(l, l.pay_type), 0);
  const zeros = lines.filter((l) => grossCents(l, l.pay_type) <= 0).length;
  const run2 = (fn) => { setMsg(null); start(async () => { const r = await fn(); setMsg(r); if (r?.ok) router.refresh(); }); };

  return (
    <div className="wrap" style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="h1" style={{ margin: 0 }}>Payroll Run</div>
        <Link href={`/payroll?week=${prevWeek}`} className="pill" style={{ cursor: 'pointer' }}>‹</Link>
        <span style={{ fontWeight: 700 }}>{fmtD(week)} – {fmtD(weekEnd)}</span>
        <Link href={`/payroll?week=${nextWeek}`} className="pill" style={{ cursor: 'pointer' }}>›</Link>
        {week !== today && <Link href="/payroll" className="pill" style={{ cursor: 'pointer' }}>This week</Link>}
        <span style={{ marginLeft: 'auto', fontWeight: 800, color: locked ? 'var(--green)' : 'var(--amber)' }}>{run ? (locked ? 'APPROVED' : 'DRAFT') : 'No run'}</span>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>CB week (Sun–Sat). Commission = % of completed-job revenue; <strong>hours auto-fill</strong> from on-site time (started→completed) — editable. <strong>Nothing is sent</strong> — approval just locks the run; export to your payroll file is a separate step.</p>
      {msg && <div className="muted" style={{ fontSize: 12, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}

      {/* Pay rates */}
      <details className="card" style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Pay rates ({techs.length} techs)</summary>
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 80px 80px 90px 60px', gap: 6, fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.04em', paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
            <span>Tech</span><span>Pay type</span><span>Comm %</span><span>$/hr</span><span>$/wk</span><span></span>
          </div>
          {techs.map((t) => <RateRow key={t.id} tech={t} pay={payByTech[t.id]} />)}
        </div>
      </details>

      {!run ? (
        <div className="card" style={{ marginTop: 10, textAlign: 'center', padding: 24 }}>
          <p className="muted">No draft for this week yet.</p>
          <button onClick={() => run2(() => generateRun(week))} disabled={pending} className="btn">{pending ? 'Building…' : 'Generate draft'}</button>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflowX: 'auto', marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>
                {['Tech', 'Jobs', 'Revenue', 'Commission', 'Hours', 'Bonus', 'Adjust', 'Gross'].map((h, i) => <th key={h} style={{ padding: '8px 10px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--fg-3)', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
                {!locked && <th />}
              </tr></thead>
              <tbody>
                {lines.map((l) => <LineRow key={l.id} line={l} rate={payByTech[l.tech_id]?.hourly_rate || 0} locked={locked} />)}
                {!lines.length && <tr><td colSpan={9} style={{ padding: 16 }}><span className="muted">No techs with jobs or pay rates this week.</span></td></tr>}
              </tbody>
              {lines.length > 0 && <tfoot><tr style={{ borderTop: '2px solid var(--border-strong)' }}><td colSpan={7} style={{ padding: '10px', fontWeight: 800, textAlign: 'right' }}>Total gross</td><td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15 }}>{money(total)}</td>{!locked && <td />}</tr></tfoot>}
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            {zeros > 0 && <span style={{ color: 'var(--red)', fontSize: 12.5, fontWeight: 700 }}>⚠ {zeros} line{zeros > 1 ? 's' : ''} at $0 — review before approving.</span>}
            {locked
              ? <>
                  <span className="muted" style={{ fontSize: 12 }}>Approved by {run.approved_by}.</span>
                  {canApprove && <button onClick={() => run2(() => reopenRun(run.id))} disabled={pending} className="pill" style={{ cursor: 'pointer' }}>Reopen</button>}
                </>
              : canApprove
                ? <button onClick={() => run2(() => approveRun(run.id))} disabled={pending} className="btn" style={{ marginLeft: 'auto' }}>Approve payroll</button>
                : <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>An approver (owner/GM/OM) signs off.</span>}
          </div>
        </>
      )}
    </div>
  );
}
