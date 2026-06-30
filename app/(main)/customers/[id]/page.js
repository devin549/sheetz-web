import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { loadCustomerMemory } from '@/lib/customerMemory';
import { canOverrideCreditHold } from '@/lib/creditHold';
import { can } from '@/lib/roles';
import CreditHoldToggle from './CreditHoldToggle';
import NetTermsToggle from './NetTermsToggle';
import CustomerEmailEditor from './CustomerEmailEditor';

export const dynamic = 'force-dynamic';
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const dial = (r) => { const d = String(r || '').replace(/[^\d]/g, ''); return d.length === 10 ? '+1' + d : d.length === 11 ? '+' + d : d ? '+' + d : ''; };
const fmt = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

export default async function CustomerProfile({ params }) {
  const { role } = await requireHref('/customers');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">Customer</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();
  const { data: c, error } = await sb.from('customers').select('id, cb_number, st_customer_id, name, phone, email, address, type, do_not_service, do_not_mail, lifetime_revenue, lifetime_jobs, last_job_completed').eq('id', params.id).maybeSingle();
  if (error || !c) notFound();

  // Credit hold (migration 130) — best-effort so the profile still loads pre-migration.
  let creditHold = false, creditHoldReason = null, creditHoldBy = null;
  try { const { data: ch } = await sb.from('customers').select('credit_hold, credit_hold_reason, credit_hold_by').eq('id', c.id).maybeSingle(); if (ch) { creditHold = !!ch.credit_hold; creditHoldReason = ch.credit_hold_reason || null; creditHoldBy = ch.credit_hold_by || null; } } catch (_) { /* pre-130 */ }
  const canHold = canOverrideCreditHold(role);
  // Secondary email (mig 157) — best-effort so the profile loads pre-migration.
  let custEmail2 = '';
  try { const { data: e2 } = await sb.from('customers').select('email2').eq('id', c.id).maybeSingle(); if (e2) custEmail2 = e2.email2 || ''; } catch (_) { /* pre-157 */ }
  const canEditEmail = can(role, 'assignJobs') || can(role, 'manageUsers') || can(role, 'seeCrew') || can(role, 'createJobs') || can(role, 'contactCustomer');
  // Billing mode (migration 132 net terms + 135 bill-from-office) — best-effort, independent of credit-hold.
  let netTermsDays = 0, netTermsBy = null, officeBills = false;
  try { const { data: nt } = await sb.from('customers').select('net_terms_days, net_terms_by, bill_from_office').eq('id', c.id).maybeSingle(); if (nt) { netTermsDays = Number(nt.net_terms_days) || 0; netTermsBy = nt.net_terms_by || null; officeBills = !!nt.bill_from_office; } }
  catch (_) { try { const { data: nt } = await sb.from('customers').select('net_terms_days, net_terms_by').eq('id', c.id).maybeSingle(); if (nt) { netTermsDays = Number(nt.net_terms_days) || 0; netTermsBy = nt.net_terms_by || null; officeBills = netTermsDays > 0; } } catch (_2) { /* pre-132 */ } }

  // Reuse the Customer Memory aggregator (timeline / photos / equipment / balance / membership / summary).
  const mem = await loadCustomerMemory(sb, { customer_id: c.id, id: '__profile__' });
  const timeline = (mem.timeline || []).filter((t) => String(t.id) !== '__profile__');
  const tel = dial(c.phone);
  const mapHref = c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}` : null;

  const Stat = ({ label, value, color }) => (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 17, fontWeight: 800, color: color || 'var(--fg-1)' }}>{value}</div>
      <div className="muted" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
    </div>
  );

  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <Link href="/customers" className="muted" style={{ fontSize: 12 }}>← Customers</Link>

      {/* Header */}
      <div className="card card-amber" style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="h1" style={{ margin: 0 }}>{c.name}</span>
          {c.cb_number && <span className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber-dim)', fontWeight: 800 }}>CB-{c.cb_number}</span>}
          {c.type && <span className="pill">{c.type}</span>}
          {mem.membership && <span className="pill" style={{ color: 'var(--green)' }}>⭐ {mem.membership}</span>}
          {c.do_not_service && <span className="pill" style={{ color: 'var(--red)', border: '1px solid var(--red)' }}>⛔ DO NOT SERVICE</span>}
          {creditHold && <span className="pill" style={{ color: 'var(--red)', border: '1px solid var(--red)', fontWeight: 800 }}>🚦 CREDIT HOLD</span>}
          {netTermsDays > 0 && <span className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber-dim)', fontWeight: 800 }}>🗓 NET-{netTermsDays}</span>}
        </div>
        <CreditHoldToggle customerId={c.id} held={creditHold} reason={creditHoldReason} by={creditHoldBy} canEdit={canHold} />
        <NetTermsToggle customerId={c.id} days={netTermsDays} officeBills={officeBills} by={netTermsBy} canEdit={canHold} />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 13 }}>
          {tel && <a href={`tel:${tel}`}>📞 {c.phone}</a>}
          {mapHref && <a href={mapHref} target="_blank" rel="noreferrer">📍 {c.address}</a>}
        </div>
        <CustomerEmailEditor customerId={c.id} email={c.email || ''} email2={custEmail2} canEdit={canEditEmail} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginTop: 12 }}>
          <Stat label="Lifetime" value={money(c.lifetime_revenue)} color="var(--green-bright)" />
          <Stat label="Jobs" value={c.lifetime_jobs || mem.timeline.length || 0} />
          <Stat label="Open balance" value={money(mem.openBalance)} color={mem.openBalance > 0 ? 'var(--red)' : 'var(--green)'} />
          <Stat label="Photos" value={mem.photoCount} />
          <Stat label="Last job" value={c.last_job_completed ? fmt(c.last_job_completed) : (mem.lastServiced ? fmt(mem.lastServiced) : '—')} />
        </div>
      </div>

      {/* What to know */}
      {mem.summary?.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>🧠 What to know</div>
          {mem.summary.map((s, i) => <div key={i} className="muted" style={{ fontSize: 12.5, padding: '2px 0' }}>• {s}</div>)}
        </div>
      )}

      {/* Job history */}
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🕑 Job history</div>
        {timeline.length === 0 ? <span className="muted" style={{ fontSize: 12.5 }}>No jobs recorded yet.</span> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {timeline.map((t) => (
              <Link key={String(t.id)} href={t.href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: t.kind === 'unpaid' ? 'var(--red)' : t.kind === 'estimate' ? 'var(--amber)' : 'var(--fg-3)', minWidth: 58, textTransform: 'uppercase' }}>{t.kind}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{t.jobType}{t.badge && <span className="pill" style={{ marginLeft: 6, fontSize: 9, color: t.badge === 'warranty' ? 'var(--green)' : 'var(--red)' }}>{t.badge}</span>}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{fmt(t.date)}{t.tech ? ` · ${t.tech}` : ''}{t.photos ? ` · 📸 ${t.photos}` : ''}</div>
                </div>
                {t.amount != null && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13, color: t.paid === false ? 'var(--red)' : 'var(--fg-1)' }}>{money(t.amount)}{t.paid === false ? ' due' : ''}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Photos by job */}
      {mem.photoGroups?.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>📸 Photos by visit</div>
          {mem.photoGroups.map((g) => (
            <div key={g.jobId} style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{g.jobType} · {fmt(g.date)}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {g.items.map((p) => p.url ? <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: p.qa === 'fail' ? '2px solid var(--red)' : p.qa === 'pass' ? '2px solid var(--green)' : '1px solid var(--border)' }} /></a> : <div key={p.id} style={{ width: 64, height: 64, borderRadius: 6, background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}>{p.video ? '🎬' : '📷'}</div>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Equipment */}
      {mem.equipment?.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🔧 Equipment on file</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
            {mem.equipment.map((e, i) => (
              <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {e.url ? <img src={e.url} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} /> : <div style={{ aspectRatio: '4/3', display: 'grid', placeItems: 'center', background: 'var(--surface-2)' }}>🔧</div>}
                <div style={{ padding: 8 }}><div style={{ fontWeight: 700, fontSize: 12 }}>{e.name}</div><div className="muted" style={{ fontSize: 10 }}>{fmt(e.date)}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
