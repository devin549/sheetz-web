'use client';

// On-call acknowledge banners. Blink until the tech taps "I'm ready — acknowledge"; that now PERSISTS to
// their profile (prefs.oncall_acked) so it survives a refresh, clears the Cal nav badge, and the office sees
// it confirmed. Each window carries its initial acked state from the server.
import { useState, useTransition } from 'react';
import { acknowledgeOnCall } from './onCallActions';

export default function OnCallBanners({ windows = [] }) {
  const [acked, setAcked] = useState(() => Object.fromEntries((windows || []).filter((w) => w.acked).map((w) => [w.id, true])));
  const [pending, start] = useTransition();
  if (!windows.length) return null;
  const ack = (id) => { setAcked((a) => ({ ...a, [id]: true })); start(() => { acknowledgeOnCall(id).catch(() => setAcked((a) => ({ ...a, [id]: false }))); }); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
      {windows.map((w) => {
        const done = acked[w.id];
        return (
          <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'rgba(156,100,244,0.07)', border: '1px solid #9c64f4', borderRadius: 12, padding: '12px 16px', animation: done ? 'none' : undefined }}>
            <span style={{ fontSize: 22 }}>📟</span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong style={{ color: '#b39ddb', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em' }}>{w.title}</strong>
              <div style={{ fontSize: 12, color: 'var(--fg-1)', fontWeight: 600, marginTop: 2 }}>{w.window}</div>
              <div style={{ fontSize: 10.5, color: 'var(--fg-3)', marginTop: 2 }}>🗓 When you acknowledge, this auto-adds to your Google Calendar with reminders.</div>
              <div style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 4 }}>⚠ Blinks until you acknowledge. Office sees your confirmation timestamp. No ack by deadline → escalates to Tracey + Ronnie.</div>
            </div>
            {done ? (
              <span style={{ background: 'rgba(76,175,80,0.15)', color: 'var(--green-bright)', border: '1px solid #4caf50', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 800 }}>✓ Acknowledged</span>
            ) : (
              <button onClick={() => ack(w.id)} disabled={pending}
                style={{ background: 'linear-gradient(135deg, #9c64f4 0%, #5e35b1 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 800, cursor: pending ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: pending ? 0.7 : 1 }}>
                ✓ I’m ready — acknowledge
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
