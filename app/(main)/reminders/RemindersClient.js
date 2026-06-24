'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendReminder } from './actions';
import { Bell, Phone, Mail } from 'lucide-react';

const when = (s) => { try { return new Date(s).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

export default function RemindersClient({ jobs }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msgs, setMsgs] = useState({});

  const remind = (id) => start(async () => { const r = await sendReminder(id); setMsgs((m) => ({ ...m, [id]: r })); router.refresh(); });

  if (!jobs.length) return <div className="card"><span className="muted">No jobs in the next 48 hours.</span></div>;

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {jobs.map((j) => {
        const m = msgs[j.id];
        return (
          <div key={j.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', flexWrap: 'wrap', opacity: pending ? 0.7 : 1 }}>
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{j.customer}</div>
              <div className="muted" style={{ fontSize: 12 }}>{j.job_type} · {when(j.scheduled_at)}{j.tech_name ? ` · ${j.tech_name}` : ''}</div>
            </div>
            <span style={{ display: 'inline-flex', gap: 6, fontSize: 11 }}>
              <span title={j.consent ? 'has phone + text consent' : (j.hasPhone ? 'phone but no consent' : 'no phone')} style={{ color: j.hasPhone && j.consent ? 'var(--green)' : 'var(--fg-3)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Phone size={12} /></span>
              <span title={j.hasEmail ? 'has email' : 'no email'} style={{ color: j.hasEmail ? 'var(--green)' : 'var(--fg-3)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Mail size={12} /></span>
            </span>
            {m ? <span style={{ fontSize: 12, fontWeight: 700, color: m.ok ? 'var(--green)' : 'var(--red)' }}>{m.msg}</span>
              : <button type="button" className="btn" onClick={() => remind(j.id)} disabled={pending} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px' }}><Bell size={14} /> Remind</button>}
          </div>
        );
      })}
    </div>
  );
}
