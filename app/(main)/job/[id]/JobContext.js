// The "don't lose this" customer-context card from the old iPad SPA — the field info a tech needs
// BEFORE knocking: do-not-service stop, must-tell warnings (dogs, gate code), access notes, what the
// office promised, and account flags (type / membership tags / repeat visit / arrival window).
// Every field is a REAL column on jobs/customers (no invented fields); each row hides when empty, so
// the whole card disappears for a job with no context. Shared by the overview + every cockpit tab header.

export default function JobContext({ job = {}, customer = {} }) {
  const tagList = Array.isArray(customer.tags) ? customer.tags.filter(Boolean).map(String)
    : (typeof customer.tags === 'string' ? customer.tags.replace(/[{}"]/g, '').split(',').map((s) => s.trim()).filter(Boolean) : []);
  const visits = Number(customer.lifetime_jobs) || 0;
  const urgent = /high|urgent|emergency/i.test(String(job.priority || ''));
  const hasFlags = customer.type || tagList.length > 0 || visits > 1 || job.arrival_window;

  if (!customer.do_not_service && !job.must_tell_tech && !job.access_notes && !urgent && !job.customer_promise && !hasFlags) return null;

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      {customer.do_not_service && (
        <div style={{ padding: '8px 11px', borderRadius: 8, background: 'rgba(211,47,47,0.14)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 12.5, fontWeight: 800 }}>
          🚫 DO NOT SERVICE — stop and call the office before any work.
        </div>
      )}
      {job.must_tell_tech && (
        <div style={{ padding: '8px 11px', borderRadius: 8, background: 'rgba(255,179,0,0.14)', border: '1px solid var(--amber)', color: 'var(--fg-1)', fontSize: 12.5, fontWeight: 700 }}>
          ⚠ <span style={{ color: 'var(--amber)', fontWeight: 800 }}>MUST TELL TECH:</span> {job.must_tell_tech}
        </div>
      )}
      {(job.access_notes || urgent) && (
        <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>
          {urgent && <span style={{ marginRight: 8 }}>⚠ {String(job.priority).toUpperCase()}</span>}
          {job.access_notes && <span style={{ color: 'var(--fg-1)', fontWeight: 600 }}>🔑 {job.access_notes}</span>}
        </div>
      )}
      {job.customer_promise && (
        <div style={{ fontSize: 12, color: 'var(--fg-1)' }}>
          <span style={{ color: 'var(--green)', fontWeight: 800 }}>🤝 We promised:</span> {job.customer_promise}
        </div>
      )}
      {hasFlags && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {job.arrival_window && <span className="pill" style={{ fontSize: 10.5 }}>🕐 {job.arrival_window}</span>}
          {customer.type && <span className="pill" style={{ fontSize: 10.5, textTransform: 'capitalize' }}>{customer.type}</span>}
          {visits > 1 && <span className="pill" style={{ fontSize: 10.5 }}>🔁 visit #{visits}</span>}
          {tagList.slice(0, 6).map((t) => <span key={t} className="pill" style={{ fontSize: 10.5, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>{t}</span>)}
        </div>
      )}
    </div>
  );
}
