'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { searchAccounts, loadAccount } from './actions';
import { Search, Phone, Mail, MapPin, Repeat, AlertTriangle, Loader2 } from 'lucide-react';

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString();
const dt = (s) => { if (!s) return '—'; try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return String(s).slice(0, 10); } };
const STATUS_COLOR = { open: 'var(--red)', paid: 'var(--green)', done: 'var(--green)', cancelled: 'var(--fg-3)', active: 'var(--green)', paused: 'var(--amber)' };
const sc = (s) => STATUS_COLOR[String(s || '').toLowerCase()] || 'var(--fg-2)';

export default function AccountsClient() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [acct, setAcct] = useState(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const id = ++seq.current; setSearching(true);
    const h = setTimeout(async () => { const r = await searchAccounts(query); if (id === seq.current) { setResults(r); setSearching(false); } }, 220);
    return () => clearTimeout(h);
  }, [query]);

  async function pick(id) {
    setLoading(true); setAcct(null); setResults([]); setQuery('');
    const a = await loadAccount(id); setAcct(a); setLoading(false);
  }

  const c = acct && acct.customer;
  const phones = c ? (c.phones || c.phone || '') : '';

  return (
    <>
      {/* search */}
      <div style={{ position: 'relative', maxWidth: 480, marginBottom: 16 }}>
        <Search size={15} style={{ position: 'absolute', left: 11, top: 13, color: 'var(--fg-3)' }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a customer by name or phone…" autoComplete="off"
          style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 11px 10px 33px', fontSize: 14 }} />
        {(results.length > 0 || searching) && (
          <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: 4, background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 22px rgba(0,0,0,.35)', maxHeight: 360, overflowY: 'auto' }}>
            {searching && !results.length && <div className="muted" style={{ padding: '10px 12px', fontSize: 13 }}>Searching…</div>}
            {results.map((r) => (
              <button type="button" key={r.id} onClick={() => pick(r.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 0, borderBottom: '1px solid var(--border)', color: 'var(--fg-1)', cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>{r.name}{r.do_not_service && <AlertTriangle size={12} style={{ color: 'var(--red)' }} />}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{[r.cb_number ? `CB #${r.cb_number}` : null, r.phone, r.lifetime_revenue ? `${money(r.lifetime_revenue)} lifetime` : null].filter(Boolean).join(' · ')}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={16} className="cb-spin" /> <span className="muted">Loading account…</span></div>}

      {!loading && !acct && <div className="muted" style={{ fontSize: 13 }}>Search above to pull up a customer&apos;s account.</div>}

      {c && (
        <>
          {/* header */}
          <div className="card card-amber" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{c.name}</span>
              {c.cb_number && <span className="pill">CB #{c.cb_number}</span>}
              {c.type && <span className="pill" style={{ textTransform: 'capitalize' }}>{c.type}</span>}
              {c.do_not_service && <span className="pill pill-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> Do not service</span>}
              {c.do_not_mail && <span className="pill" style={{ color: 'var(--amber)' }}>Do not mail</span>}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {phones && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Phone size={13} /> {phones}</span>}
              {c.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mail size={13} /> {c.email}</span>}
              {c.address && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={13} /> {c.address}</span>}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href="/booking" className="btn" style={{ fontSize: 13, padding: '7px 12px' }}>Book a job</Link>
              {acct.openBalance > 0 && <Link href="/past-due" className="btn-ghost" style={{ fontSize: 13, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--red)' }}>Past Due</Link>}
            </div>
          </div>

          {/* standing */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              { k: 'Open balance', v: money(acct.openBalance), sub: `${acct.invoiceCount} invoice${acct.invoiceCount === 1 ? '' : 's'} on file`, color: acct.openBalance > 0 ? 'var(--red)' : 'var(--green)' },
              { k: 'Lifetime revenue', v: money(c.lifetime_revenue), sub: 'all-time billed' },
              { k: 'Lifetime jobs', v: String(c.lifetime_jobs || acct.jobs.length || 0), sub: 'completed work' },
              { k: 'Last service', v: dt(c.last_job_completed), sub: 'most recent job' },
            ].map((x) => (
              <div key={x.k} className="card" style={{ padding: '11px 13px' }}>
                <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{x.k}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: x.color || 'var(--amber)', marginTop: 2 }}>{x.v}</div>
                <div className="muted" style={{ fontSize: 11 }}>{x.sub}</div>
              </div>
            ))}
          </div>

          {/* memberships */}
          {acct.memberships.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 6px' }}>Memberships</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {acct.memberships.map((m, i) => (
                  <span key={i} className="card" style={{ padding: '7px 11px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <Repeat size={13} style={{ color: sc(m.status) }} /> <strong>{m.plan}</strong>
                    <span className="muted" style={{ fontSize: 11.5 }}>{m.price_cents ? `· $${Math.round(m.price_cents / 100)}/${m.period === 'month' ? 'mo' : 'yr'}` : ''} · {m.status}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            {/* recent jobs */}
            <div>
              <h3 style={{ fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 6px' }}>Recent jobs</h3>
              {!acct.jobs.length && <div className="muted" style={{ fontSize: 13 }}>No jobs on file.</div>}
              <div style={{ display: 'grid', gap: 6 }}>
                {acct.jobs.map((j) => (
                  <Link key={j.id} href={`/job/${j.id}`} className="card" style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc(j.status), flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.job_type || 'Job'}{j.job_number ? ` · #${j.job_number}` : ''}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{dt(j.scheduled_at)}{j.tech_name ? ` · ${j.tech_name}` : ''}{j.city ? ` · ${j.city}` : ''}</div>
                    </div>
                    {j.amount ? <span style={{ fontSize: 12.5, fontWeight: 700 }}>{money(j.amount)}</span> : null}
                  </Link>
                ))}
              </div>
            </div>

            {/* recent invoices */}
            <div>
              <h3 style={{ fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 6px' }}>Recent invoices</h3>
              {!acct.invoices.length && <div className="muted" style={{ fontSize: 13 }}>No invoices on file.</div>}
              <div style={{ display: 'grid', gap: 6 }}>
                {acct.invoices.map((iv, i) => (
                  <div key={i} className="card" style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>#{iv.invoice_number || '—'}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{dt(iv.invoice_date)} · <span style={{ color: sc(iv.status), textTransform: 'capitalize' }}>{iv.status || '—'}</span></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{money(iv.total)}</div>
                      {Number(iv.balance) > 0 && <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>{money(iv.balance)} due</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
