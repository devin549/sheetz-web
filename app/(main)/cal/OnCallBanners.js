'use client';

// On-call acknowledge banners (ported from pane-cal cbRenderOnCall_). Blink until the tech taps
// "I'm ready — acknowledge"; the live app then writes a confirmation timestamp to the office + auto-adds
// a Google Calendar reminder, and escalates to Tracey+Ronnie if not acked by the deadline.
// NOTE: on_call_schedule (mig 65) has NO per-tech ack fields yet, so v1 acknowledges LOCALLY and labels
// it honestly — the timestamp-recording + escalation wires when the on-call ack store is added.
import { useState } from 'react';

export default function OnCallBanners({ windows = [] }) {
  const [acked, setAcked] = useState({});
  if (!windows.length) return null;
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
              <button onClick={() => setAcked((a) => ({ ...a, [w.id]: true }))}
                style={{ background: 'linear-gradient(135deg, #9c64f4 0%, #5e35b1 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ✓ I’m ready — acknowledge
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
