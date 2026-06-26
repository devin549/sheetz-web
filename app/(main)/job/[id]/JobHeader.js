import Link from 'next/link';
import { ArrowLeft, Phone, MessageSquare, Mic, Navigation, History } from 'lucide-react';
import JobContext from './JobContext';

const dial = (p) => String(p || '').replace(/[^0-9+]/g, '');
function statusLabel(v) {
  const s = String(v || 'scheduled').toLowerCase();
  if (/done|complete|closed/.test(s)) return 'Complete';
  if (/on_?site/.test(s)) return 'On site';
  if (/enroute|rolling/.test(s)) return 'En route';
  if (/cancel/.test(s)) return 'Cancelled';
  return 'Scheduled';
}

// Shared Job Cockpit top section — back · customer · job# · address · call/text/CSR/directions · warnings.
// `tab` highlights the current tab in a compact sub-nav (so it's reachable even off the iPad rail).
const TABS = [
  ['Overview', ''], ['Forms', '/forms'], ['Proof', '/photos'], ['Estimate', '/estimate'],
  ['Invoice', '/invoice'], ['Parts/PO', '/parts'], ['Pricebook', '/pricebook'], ['Equipment', '/equipment'], ['History', '/history'],
];

export default function JobHeader({ job, customer = {}, tab = 'Overview' }) {
  const tel = dial(customer.phone);
  const addr = customer.address || '';
  const mapHref = addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` : null;
  const cid = customer.id || job.customer_id || null; // → the customer's full 360 (all past jobs)

  return (
    <div className="card card-amber" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
      <Link href="/my-day" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--amber)', textDecoration: 'none' }}><ArrowLeft size={14} /> My Day</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        {cid
          ? <Link href={`/customers/${cid}`} className="h1" style={{ margin: 0, fontSize: 20, textDecoration: 'none', color: 'var(--fg-1)' }} title="Open this customer's full history">{customer.name || 'Customer'}</Link>
          : <div className="h1" style={{ margin: 0, fontSize: 20 }}>{customer.name || 'Customer'}</div>}
        <div className="muted" style={{ fontSize: 12 }}>{job.job_number ? `#${job.job_number} · ` : ''}{statusLabel(job.status)}{job.job_type ? ` · ${job.job_type}` : ''}</div>
      </div>
      {addr && <a href={mapHref} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12.5, color: 'var(--fg-2)', marginTop: 2 }}>📍 {addr}{mapHref ? <span style={{ color: 'var(--amber)' }}> · tap for turn-by-turn</span> : ''}</a>}

      {/* quick contact bar */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {tel && <a href={`tel:${tel}`} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}><Phone size={13} /> Call <span style={{ fontSize: 8.5, color: 'var(--red)', fontWeight: 800 }}>● REC</span></a>}
        {tel && <a href={`sms:${tel}`} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MessageSquare size={13} /> Text <span className="muted" style={{ fontSize: 8.5 }}>saved 7yr</span></a>}
        <span className="pill" title="CSR call recording (links when call-intel is wired)" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, opacity: 0.6 }}><Mic size={13} /> CSR call</span>
        {mapHref && <a href={mapHref} target="_blank" rel="noreferrer" className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Navigation size={13} /> Directions</a>}
        {cid && <Link href={`/customers/${cid}`} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}><History size={13} /> Full history</Link>}
      </div>

      {/* Customer context card — must-tell, do-not-service, what we promised, access, flags. */}
      <JobContext job={job} customer={customer} />

      {/* tab sub-nav (also works without the iPad rail) */}
      <div style={{ display: 'flex', gap: 4, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
        {TABS.map(([label, sub]) => {
          const on = label === tab;
          return (
            <Link key={label} href={`/job/${job.id}${sub}`} className="pill" style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: on ? 800 : 600, color: on ? '#1a1206' : 'var(--fg-2)', background: on ? 'var(--amber)' : 'var(--surface-2)', border: '1px solid var(--border)' }}>{label}</Link>
          );
        })}
      </div>
    </div>
  );
}
