'use client';

// Date navigation for the board — prev/next arrows, a "Today" reset, and a native calendar
// picker. Drives the server page via the ?date= URL param so each day is a real, shareable,
// back-button-friendly render. Default (no param) = today in Eastern time (set by the page).

import { useRouter, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function label(dateStr, today) {
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, -1)) return 'Yesterday';
  if (dateStr === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString([], { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}

export default function DateNav({ date, today }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (d) => router.push(`${pathname}?date=${d}`);
  const arrow = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button style={arrow} onClick={() => go(addDays(date, -1))} aria-label="Previous day"><ChevronLeft size={16} /></button>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-1)', minWidth: 104, justifyContent: 'center' }}>
        <Calendar size={14} style={{ color: 'var(--fg-3)' }} />
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label(date, today)}</span>
        <input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} aria-label="Pick a date"
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
      </div>
      <button style={arrow} onClick={() => go(addDays(date, 1))} aria-label="Next day"><ChevronRight size={16} /></button>
      {date !== today && (
        <button onClick={() => go(today)} className="pill" style={{ cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--surface-2)', fontSize: 11 }}>Today</button>
      )}
    </div>
  );
}
