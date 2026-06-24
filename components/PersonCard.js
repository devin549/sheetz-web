'use client';

// Reusable "tap a person → quick card" — drop it around any avatar/name anywhere (Crews, board, My Day).
// Pulls live status from the shared employeeCard action: on/off shift, current job, truck, tools, Call/Text.
import { useState, useTransition } from 'react';
import { employeeCard } from '@/app/(main)/messages/actions';
import { initials, avatarHue } from '@/lib/commsTriage';
import { Phone, MessageSquare, MapPin, X, Wrench } from 'lucide-react';

function Avatar({ name, photo }) {
  const sz = 34, base = { width: sz, height: sz, borderRadius: '50%', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12.5, color: '#fff', overflow: 'hidden' };
  if (photo) return <img src={photo} alt={name} width={sz} height={sz} style={{ ...base, objectFit: 'cover' }} />;
  return <div style={{ ...base, background: `hsl(${avatarHue(name)} 45% 42%)` }}>{initials(name)}</div>;
}

export default function PersonCard({ name, children }) {
  const [card, setCard] = useState(null);
  const [, start] = useTransition();
  function open(e) { e.preventDefault(); e.stopPropagation(); setCard({ loading: true, name }); start(async () => { const r = await employeeCard(name); setCard(r && r.ok ? r : { error: true, name }); }); }

  return (
    <>
      <button onClick={open} title={`${name} — quick card`} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', borderRadius: '50%' }}>{children}</button>
      {card && (
        <div onClick={() => setCard(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 360, width: '100%', position: 'relative', padding: 0, overflow: 'hidden', textAlign: 'left' }}>
            <button onClick={() => setCard(null)} aria-label="Close" style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', padding: 4, zIndex: 1 }}><X size={16} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 12px', background: 'var(--surface-2)' }}>
              <Avatar name={card.name} photo={card.photo_url} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{card.name}</div>
                <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  {card.position && <span style={{ textTransform: 'capitalize' }}>{String(card.position).replace(/_/g, ' ')}</span>}
                  {!card.loading && !card.error && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: card.onShift ? 'var(--green)' : 'var(--fg-3)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: card.onShift ? 'var(--green)' : 'var(--fg-3)' }} />{card.onShift ? 'On shift' : 'Off shift'}</span>}
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 16px 16px', display: 'grid', gap: 9, fontSize: 13 }}>
              {card.loading && <span className="muted">Loading…</span>}
              {card.error && <span style={{ color: 'var(--red)' }}>Couldn’t load this person.</span>}
              {!card.loading && !card.error && <>
                {card.currentJob
                  ? <div style={{ display: 'flex', gap: 7 }}><MapPin size={15} style={{ color: 'var(--accent)', flex: '0 0 auto', marginTop: 1 }} /><div><div style={{ fontWeight: 700 }}>{card.currentJob.customer} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>· {String(card.currentJob.status).replace(/_/g, ' ')}</span></div>{card.currentJob.where && <div className="muted" style={{ fontSize: 12 }}>{card.currentJob.where}</div>}</div></div>
                  : <div className="muted" style={{ display: 'flex', gap: 7 }}><MapPin size={15} style={{ flex: '0 0 auto' }} /> {card.jobsToday ? `${card.jobsToday} job${card.jobsToday === 1 ? '' : 's'} today` : 'No jobs today'}{card.lastSeenMin != null ? ` · GPS ${card.lastSeenMin}m ago` : ''}</div>}
                {card.truck && <div style={{ display: 'flex', gap: 7 }}><span style={{ width: 15, textAlign: 'center' }}>🚚</span> Truck {card.truck}</div>}
                {card.toolsOut && card.toolsOut.length > 0 && <div style={{ display: 'flex', gap: 7 }}><Wrench size={15} style={{ color: 'var(--fg-3)', flex: '0 0 auto', marginTop: 1 }} /><div><span style={{ fontWeight: 700 }}>{card.toolsOut.length} tool{card.toolsOut.length === 1 ? '' : 's'} out</span><div className="muted" style={{ fontSize: 12 }}>{card.toolsOut.slice(0, 5).join(', ')}{card.toolsOut.length > 5 ? '…' : ''}</div></div></div>}
                {card.phone
                  ? <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      <a href={`tel:${String(card.phone).replace(/[^\d+]/g, '')}`} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '6px 11px' }}><Phone size={14} /> Call</a>
                      <a href={`sms:${String(card.phone).replace(/[^\d+]/g, '')}`} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '6px 11px' }}><MessageSquare size={14} /> Text</a>
                    </div>
                  : <span className="muted" style={{ fontSize: 11.5 }}>No phone on file — add it on Team.</span>}
              </>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
