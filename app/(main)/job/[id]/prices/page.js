import Link from 'next/link';
import { loadCockpitMoney } from '../cockpit';
import JobHeader from '../JobHeader';

export const dynamic = 'force-dynamic';

const COMMON = [
  [/drain|clog|sewer|rooter/i, [['Main line cable', '$295'], ['Camera inspection', '$185'], ['Hydro-jet', '$650'], ['Cleanout install', '$1,200'], ['P-trap kit', '$42']]],
  [/water ?heater|tankless/i, [['40gal install', '$1,840'], ['50gal install', '$2,100'], ['Tankless install', '$4,200'], ['Expansion tank', '$165'], ['Flush + service', '$149']]],
  [/leak|faucet|toilet/i, [['Faucet replace', '$285'], ['Toilet rebuild', '$210'], ['Supply line', '$28'], ['Angle stop', '$45'], ['Wax ring', '$18']]],
];
const itemsFor = (t) => (COMMON.find(([re]) => re.test(String(t || ''))) || [null, [['Diagnostic', '$89'], ['Service call', '$59']]])[1];

export default async function PricesTab({ params }) {
  const c = await loadCockpitMoney(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">Prices</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const items = itemsFor(c.job.job_type);

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <JobHeader job={c.job} customer={c.customer} tab="Prices" />
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>📖 Price book · {c.job.job_type || 'this job'}</div>
        <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>Common items for this job type. Sample pricing until the live price book is wired — tap a row to add in the Estimate Builder.</div>
        <div style={{ display: 'grid', gap: 5 }}>
          {items.map(([name, price]) => (
            <Link key={name} href="/estimate" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-1)' }}>{name}</span>
              <span style={{ fontWeight: 700, color: 'var(--green)' }}>{price}</span>
            </Link>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Link href="/estimate" className="btn" style={{ textDecoration: 'none' }}>Open full price book →</Link>
          <Link href="/vendors" className="pill" style={{ display: 'inline-flex', alignItems: 'center' }}>Vendor prices</Link>
        </div>
      </div>
    </div>
  );
}
